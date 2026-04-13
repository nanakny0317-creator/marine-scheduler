/**
 * CSVインポートモーダル（メールワイズ本文解析対応版）
 *
 * フロー A: 本文列あり（メールワイズ形式）
 *   ファイル選択 → 本文列マッピング → 解析プレビュー → インポート（受講者＋申込同時作成）
 *
 * フロー B: 通常CSV（本文列なし）
 *   ファイル選択 → 列マッピング → プレビュー → インポート（受講者のみ）
 */
import { useRef, useState } from 'react'
import Papa from 'papaparse'
import type { ApplicationType, StudentInput, EnrollmentInput } from '../../types'
import { studentsApi, enrollmentsApi, fetchAddressByZip } from '../../lib/api'
import {
  parseMailwiseBody,
  parsedBodyToStudent,
  parsedBodyToEnrollmentExtra,
  isLikelyApplication,
} from '../../lib/bodyParser'
import type { ParsedBody } from '../../types'

// ====== 通常CSV列マッピング定義 ======
const TARGET_FIELDS: { key: keyof StudentInput; label: string; required?: boolean }[] = [
  { key: 'last_name',   label: '姓',               required: true },
  { key: 'first_name',  label: '名',               required: true },
  { key: 'last_kana',   label: 'せい（フリガナ）' },
  { key: 'first_kana',  label: 'めい（フリガナ）' },
  { key: 'birth_date',  label: '生年月日' },
  { key: 'gender',      label: '性別' },
  { key: 'postal_code', label: '郵便番号' },
  { key: 'prefecture',  label: '都道府県' },
  { key: 'city',        label: '市区町村' },
  { key: 'address1',    label: '番地・建物名' },
  { key: 'address2',    label: '住所2' },
  { key: 'phone',       label: '電話番号' },
  { key: 'mobile',      label: '携帯電話' },
  { key: 'email',       label: 'メールアドレス' },
  { key: 'note',        label: '備考' },
]

interface Props {
  onClose: () => void
  onImported: () => void
}

type Step = 'select' | 'mapping' | 'preview' | 'done'
type Mode = 'mailwise' | 'normal'

type AddressChoice = 'body' | 'zip' | 'later'

interface ParsedRow {
  parsed: ParsedBody
  student: StudentInput
  enrollment: Omit<EnrollmentInput, 'student_id'>
  addressMismatch: boolean
  addressNote: string | null
  /** 郵便番号APIで取得した住所（不一致時の選択肢用） */
  zipAddress: { prefecture: string; city: string; address1: string | null } | null
  /** 本文に書いてあった住所1の生テキスト */
  bodyRawAddress: string | null
  applicationType: ApplicationType
  /** 申込メールらしいか（返信・通知メールを自動検出） */
  likelyApplication: boolean
}

/** 本文住所テキストを都道府県・市区町村・番地に分割 */
function splitBodyAddress(raw: string): { prefecture: string | null; city: string | null; street: string | null } {
  const m = raw.match(/^(東京都|北海道|京都府|大阪府|.+?[県])(.+?[市区町村郡])(.*)$/)
  if (m) return { prefecture: m[1], city: m[2], street: m[3].trim() || null }
  return { prefecture: null, city: null, street: raw || null }
}

export default function CsvImportModal({ onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>('select')
  const [mode, setMode] = useState<Mode>('normal')
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([])
  // メールワイズ用
  const [bodyColumn, setBodyColumn] = useState<string>('')
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  // 通常CSV用
  const [mapping, setMapping] = useState<Partial<Record<keyof StudentInput, string>>>({})

  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [addressChoices, setAddressChoices] = useState<Record<number, AddressChoice>>({})
  const [excludedIndices, setExcludedIndices] = useState<Set<number>>(new Set())
  const [previewTab, setPreviewTab] = useState<ApplicationType | 'all'>('all')
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ────────────────────────────────────────
  // ファイル選択・自動モード判定
  // ────────────────────────────────────────
  const handleFile = (file: File) => {
    setError(null)

    // Shift-JIS / UTF-8 を自動判定してデコードしてから PapaParse に渡す
    const reader = new FileReader()
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer
      let text: string
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
      } catch {
        try {
          text = new TextDecoder('shift_jis').decode(buffer)
        } catch {
          setError('文字コードの読み込みに失敗しました（UTF-8 / Shift-JIS 以外は非対応）')
          return
        }
      }
      parseCsvText(text)
    }
    reader.readAsArrayBuffer(file)
  }

  const parseCsvText = (text: string) => {
    // BOM（\uFEFF）が先頭にある場合は除去（Excel/メールワイズ出力CSVで頻発）
    // 改行コードを \n に統一（ヘッダのみ \r\n で残りが \n の混在 CSV で PapaParse が1行と誤認するのを防ぐ）
    const cleanText = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
    Papa.parse<Record<string, string>>(cleanText, {
      header: true,
      skipEmptyLines: true,
      complete: (r) => {
        const headers = r.meta.fields ?? []

        // 「本文」列を自動検出
        const bodyCol = headers.find((h) =>
          /^(本文|body|message|内容|メール本文)$/i.test(h.trim())
        )

        if (bodyCol) {
          if (!r.data.length) { setError('データが空です'); return }
          setCsvHeaders(headers)
          setCsvRows(r.data)
          setMode('mailwise')
          setBodyColumn(bodyCol)
          setStep('mapping')
          return
        }

        // ヘッダ行自体がメール本文の場合（「本文」列ヘッダなしで本文から始まるCSV）
        // 例: 1級申込フォームはヘッダ行なしで直接メール本文が並ぶ
        const looksLikeMailBody = (s: string) =>
          /差出人[：:]|メニュー[：:]|氏名[：:]|講習日[：:]/.test(s)
        if (headers.length === 1 && looksLikeMailBody(headers[0])) {
          Papa.parse<string[]>(cleanText, {
            header: false,
            skipEmptyLines: true,
            complete: (r2) => {
              const bodies = (r2.data as string[][]).map((row) => row[0] ?? '')
              if (!bodies.length) { setError('データが空です'); return }
              const rows = bodies.map((b) => ({ '本文': b }))
              setCsvHeaders(['本文'])
              setCsvRows(rows)
              setMode('mailwise')
              setBodyColumn('本文')
              setStep('mapping')
            },
            error: (e: { message: string }) => setError(e.message),
          })
          return
        }

        // 通常モード
        if (!r.data.length) { setError('データが空です'); return }
        setCsvHeaders(headers)
        setCsvRows(r.data)
        setMode('normal')
        const autoMap: typeof mapping = {}
        for (const tf of TARGET_FIELDS) {
          const matched = headers.find((h) => h === tf.label || h === tf.key)
          if (matched) autoMap[tf.key] = matched
        }
        setMapping(autoMap)
        setStep('mapping')
      },
      error: (e: { message: string }) => setError(e.message),
    })
  }

  // ────────────────────────────────────────
  // メールワイズ: 本文を解析してプレビュー生成
  // ────────────────────────────────────────
  const handleParseBody = async () => {
    if (!bodyColumn) { setError('本文列を選択してください'); return }
    setError(null)
    setParsing(true)

    const rows: ParsedRow[] = []
    const autoExcluded = new Set<number>()
    for (const row of csvRows) {
      const body = row[bodyColumn] ?? ''
      const likelyApplication = isLikelyApplication(body)
      const parsed = parseMailwiseBody(body)
      const studentBase = parsedBodyToStudent(parsed)
      const extra = parsedBodyToEnrollmentExtra(parsed)

      // ── 郵便番号 → 住所を引いて都道府県・市区町村・番地を分割 ──
      const bodyRawAddress = (parsed.address1 ?? '').trim() || null
      let prefecture: string | null = null
      let city: string | null = null
      let address1street: string | null = studentBase.address1 ?? null
      let addressMismatch = false
      let addressNote: string | null = null
      let zipAddress: ParsedRow['zipAddress'] = null

      if (parsed.postal_code) {
        const zipResult = await fetchAddressByZip(parsed.postal_code)
        if (zipResult) {
          prefecture = zipResult.prefecture
          city = zipResult.city

          // 本文住所1から都道府県・市区町村を除いて番地以降を取り出す
          const rawAddr = bodyRawAddress ?? ''
          const prefCity = zipResult.prefecture + zipResult.city
          let street: string | null = rawAddr || null
          if (rawAddr.startsWith(prefCity)) {
            street = rawAddr.slice(prefCity.length).trim() || null
          } else if (rawAddr.startsWith(zipResult.prefecture)) {
            street = rawAddr.slice(zipResult.prefecture.length).trim() || null
          }
          address1street = street
          zipAddress = { prefecture: zipResult.prefecture, city: zipResult.city, address1: street }

          // ── 住所一致チェック: 本文の先頭が API の都道府県と異なれば不一致 ──
          const norm = (s: string) => s.replace(/\s/g, '')
          if (rawAddr && !norm(rawAddr).startsWith(norm(zipResult.prefecture))) {
            addressMismatch = true
            addressNote = `住所不一致：〒${parsed.postal_code} から「${zipResult.prefecture}${zipResult.city}」が期待されますが、本文には「${rawAddr}」と記載されています`
          }
        }
      }

      const student: StudentInput = {
        last_name: studentBase.last_name ?? '',
        first_name: studentBase.first_name ?? '',
        last_kana: studentBase.last_kana ?? null,
        first_kana: studentBase.first_kana ?? null,
        birth_date: studentBase.birth_date ?? null,
        gender: studentBase.gender ?? null,
        postal_code: studentBase.postal_code ?? null,
        prefecture,
        city,
        address1: address1street,
        address2: studentBase.address2 ?? null,
        phone: studentBase.phone ?? null,
        mobile: null,
        email: studentBase.email ?? null,
        note: null,
      }

      const typeMenuLabel: Record<ApplicationType, string> = {
        new: parsed.menu ?? '（未設定）',
        renewal: '更新講習',
        lapsed: '失効再交付',
      }
      const enrollment: Omit<EnrollmentInput, 'student_id'> = {
        menu: typeMenuLabel[parsed.application_type],
        course_date: parsed.course_date ?? null,
        venue: parsed.venue ?? null,
        status: 'pending',
        extra_json: JSON.stringify(extra),
        note: null,
      }

      if (!likelyApplication) autoExcluded.add(rows.length)
      rows.push({ parsed, student, enrollment, addressMismatch, addressNote, zipAddress, bodyRawAddress, applicationType: parsed.application_type, likelyApplication })
    }

    setParsedRows(rows)
    setAddressChoices({})
    setExcludedIndices(autoExcluded)
    setParsing(false)
    setStep('preview')
  }

  // ────────────────────────────────────────
  // 通常CSV: 行変換
  // ────────────────────────────────────────
  const convertNormalRows = (): StudentInput[] =>
    csvRows.map((row) => {
      const r: Partial<StudentInput> = {}
      for (const tf of TARGET_FIELDS) {
        const col = mapping[tf.key]
        if (col) {
          const val = row[col]?.trim() ?? ''
          if (tf.key === 'gender') {
            r.gender = /男/.test(val) ? 'male' : /女/.test(val) ? 'female' : val ? 'other' : null
          } else {
            ;(r as Record<string, unknown>)[tf.key] = val || null
          }
        } else {
          ;(r as Record<string, unknown>)[tf.key] = null
        }
      }
      return { last_name: r.last_name ?? '', first_name: r.first_name ?? '', ...r } as StudentInput
    })

  // ────────────────────────────────────────
  // インポート実行
  // ────────────────────────────────────────
  const handleImport = async () => {
    setImporting(true)
    try {
      if (mode === 'mailwise') {
        const resolvedRows = parsedRows
          .map((r, i) => ({ r, i }))
          .filter(({ i }) => !excludedIndices.has(i))
          .map(({ r, i }) => {
          if (!r.addressMismatch) return { student: r.student, enrollment: r.enrollment }
          const choice = addressChoices[i] ?? 'body'
          let addr: { prefecture: string | null; city: string | null; address1: string | null; note: string | null }
          if (choice === 'zip' && r.zipAddress) {
            addr = { ...r.zipAddress, note: null }
          } else if (choice === 'later') {
            addr = { prefecture: r.student.prefecture, city: r.student.city, address1: r.student.address1, note: '住所要確認（郵便番号と本文住所が一致しません）' }
          } else {
            // 'body': 本文住所をregexで分割
            const split = splitBodyAddress(r.bodyRawAddress ?? '')
            addr = { prefecture: split.prefecture, city: split.city, address1: split.street, note: null }
          }
          return { student: { ...r.student, ...addr }, enrollment: r.enrollment }
        })
        const res = await enrollmentsApi.importBatch(resolvedRows)
        setResult(res)
      } else {
        if (!mapping.last_name || !mapping.first_name) {
          setError('「姓」と「名」の列マッピングは必須です')
          setImporting(false)
          return
        }
        const res = await studentsApi.import(convertNormalRows())
        setResult(res)
      }
      setStep('done')
    } finally {
      setImporting(false)
    }
  }

  // ────────────────────────────────────────
  // ヘルパー
  // ────────────────────────────────────────
  const genderLabel = (g: string | null) =>
    g === 'male' ? '男性' : g === 'female' ? '女性' : g === 'other' ? 'その他' : '-'

  const Item = ({ label, value }: { label: string; value: string | null | boolean | undefined }) => {
    if (value === null || value === undefined || value === '') return null
    const display =
      typeof value === 'boolean' ? (value ? 'あり' : 'なし') : String(value)
    return (
      <div className="flex gap-1 text-xs">
        <span className="text-gray-400 shrink-0 w-28">{label}</span>
        <span className="text-gray-700 font-medium truncate">{display}</span>
      </div>
    )
  }

  // ────────────────────────────────────────
  // レンダリング
  // ────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        {/* ヘッダ */}
        <div className="border-b border-lavender-100 px-6 py-4 flex items-center justify-between rounded-t-2xl shrink-0">
          <h2 className="text-base font-semibold text-gray-700">
            CSVインポート
            {mode === 'mailwise' && step !== 'select' && (
              <span className="ml-2 text-xs font-normal text-lavender-400 bg-lavender-50 px-2 py-0.5 rounded-full">
                メールワイズ本文モード
              </span>
            )}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl" tabIndex={-1}>✕</button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
          )}

          {/* ── Step 1: ファイル選択 ── */}
          {step === 'select' && (
            <div
              className="border-2 border-dashed border-lavender-200 rounded-xl p-12 text-center cursor-pointer hover:bg-lavender-50 transition"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            >
              <div className="text-4xl mb-3">📂</div>
              <p className="text-sm text-gray-500">CSVファイルをここにドロップ</p>
              <p className="text-xs text-gray-400 mt-1">または クリックして選択</p>
              <div className="mt-4 text-left bg-lavender-50 border border-lavender-200 rounded-lg px-4 py-3 space-y-1.5 text-xs text-gray-500">
                <p className="font-semibold text-lavender-500 mb-1">📧 メールワイズCSVの推奨出力設定</p>
                <p>・列：<span className="font-medium text-gray-700">「本文」列のみ</span>（またはヘッダ行なし）</p>
                <p>・文字コード：<span className="font-medium text-gray-700">UTF-8</span>（BOMなしを推奨・BOMありも自動対応）</p>
                <p>・改行コード：<span className="font-medium text-gray-700">LF</span>（CRLF混在も自動正規化）</p>
                <p className="text-lavender-400 pt-0.5">✦ 上記以外の形式（通常の受講者CSV）にも対応しています</p>
              </div>
              <input ref={fileRef} type="file" accept=".csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </div>
          )}

          {/* ── Step 2: マッピング ── */}
          {step === 'mapping' && mode === 'mailwise' && (
            <>
              <div className="p-3 bg-lavender-50 border border-lavender-200 rounded-lg text-sm text-lavender-600">
                <p className="font-semibold mb-1">📧 メールワイズ本文列を検出しました</p>
                <p className="text-xs text-gray-500">
                  本文に含まれるメニュー・氏名・住所・生年月日などを自動解析して受講者＋申込レコードを作成します。
                </p>
              </div>
              <p className="text-sm text-gray-500">
                <span className="text-lavender-400 font-medium">{csvRows.length} 行</span> 読み込みました。
              </p>
              <div>
                <label className="field-label">本文列の選択</label>
                <select
                  value={bodyColumn}
                  onChange={(e) => setBodyColumn(e.target.value)}
                  className="field-select"
                >
                  <option value="">選択してください</option>
                  {csvHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setStep('select')} className="btn-secondary flex-1">戻る</button>
                <button onClick={handleParseBody} disabled={parsing} className="btn-primary flex-1">
                  {parsing ? '解析中（住所照合）…' : '本文を解析 →'}
                </button>
              </div>
            </>
          )}

          {step === 'mapping' && mode === 'normal' && (
            <>
              <p className="text-sm text-gray-500">
                CSVの列をシステムのフィールドに対応付けてください。
                <span className="text-lavender-400 font-medium ml-1">{csvRows.length} 行</span> 読み込みました。
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {TARGET_FIELDS.map((tf) => (
                  <div key={tf.key} className="grid grid-cols-2 gap-3 items-center">
                    <span className="text-sm text-gray-600">
                      {tf.label}{tf.required && <span className="text-red-400 ml-1">*</span>}
                    </span>
                    <select
                      value={mapping[tf.key] ?? ''}
                      onChange={(e) => setMapping((m) => ({ ...m, [tf.key]: e.target.value || undefined }))}
                      className="field-select text-sm py-1.5"
                    >
                      <option value="">（スキップ）</option>
                      {csvHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setStep('select')} className="btn-secondary flex-1">戻る</button>
                <button onClick={() => setStep('preview')} className="btn-primary flex-1">プレビュー →</button>
              </div>
            </>
          )}

          {/* ── Step 3: プレビュー ── */}
          {step === 'preview' && mode === 'mailwise' && (() => {
            const typeLabel: Record<ApplicationType, string> = { new: '受講申請', renewal: '更新講習', lapsed: '失効再交付' }
            const typeCounts = { new: 0, renewal: 0, lapsed: 0 }
            parsedRows.forEach((r) => typeCounts[r.applicationType]++)
            const tabs: { key: ApplicationType | 'all'; label: string; count: number }[] = [
              { key: 'all', label: '全件', count: parsedRows.length },
              ...(['new', 'renewal', 'lapsed'] as ApplicationType[])
                .filter((t) => typeCounts[t] > 0)
                .map((t) => ({ key: t, label: typeLabel[t], count: typeCounts[t] })),
            ]
            const visibleRows = parsedRows
              .map((r, i) => ({ r, i }))
              .filter(({ r }) => previewTab === 'all' || r.applicationType === previewTab)
            const importCount = parsedRows.length - excludedIndices.size
            const toggleExclude = (i: number) => {
              setExcludedIndices(prev => {
                const next = new Set(prev)
                if (next.has(i)) { next.delete(i) } else { next.add(i) }
                return next
              })
            }
            return (
            <>
              {/* 自動除外の警告バナー */}
              {excludedIndices.size > 0 && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700">
                  <p className="font-semibold mb-1">⚠ 申込以外のメールを自動検出しました（{excludedIndices.size}件）</p>
                  <p>返信・通知メールと思われる行はチェックを外しています。内容を確認してインポートするか決めてください。</p>
                </div>
              )}
              {/* タブ */}
              <div className="flex gap-1 border-b border-lavender-100 pb-0">
                {tabs.map(({ key, label, count }) => (
                  <button
                    key={key}
                    onClick={() => setPreviewTab(key)}
                    className={`px-3 py-1.5 text-xs rounded-t-lg border-b-2 transition ${
                      previewTab === key
                        ? 'border-lavender-400 text-lavender-600 font-semibold bg-lavender-50'
                        : 'border-transparent text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    {label} <span className="ml-0.5 text-gray-400">({count})</span>
                  </button>
                ))}
              </div>
              <p className="text-sm text-gray-500">
                各行のチェックで取り込む/除外するを選べます。全 {parsedRows.length} 件中 <span className="text-lavender-500 font-medium">{importCount} 件</span>をインポートします。
              </p>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {visibleRows.map(({ r, i }) => (
                  <div key={i} className={`card p-3 space-y-1 ${excludedIndices.has(i) ? 'opacity-50' : ''}`}>
                    <p className="text-xs font-semibold text-lavender-400 mb-2 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!excludedIndices.has(i)}
                        onChange={() => toggleExclude(i)}
                        className="w-4 h-4 accent-lavender-500 cursor-pointer"
                      />
                      <span>#{i + 1} {r.student.last_name} {r.student.first_name}</span>
                      <span className="text-gray-400 font-normal">{r.student.last_kana} {r.student.first_kana}</span>
                      {!r.likelyApplication && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-100 text-yellow-600">
                          申込外？
                        </span>
                      )}
                      <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        r.applicationType === 'new' ? 'bg-mint-50 text-mint-600' :
                        r.applicationType === 'renewal' ? 'bg-blue-50 text-blue-500' :
                        'bg-orange-50 text-orange-500'
                      }`}>
                        {typeLabel[r.applicationType]}
                      </span>
                    </p>
                    {r.addressMismatch && (() => {
                      const choice = addressChoices[i] ?? 'body'
                      const bodyS = splitBodyAddress(r.bodyRawAddress ?? '')
                      return (
                        <div className="text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-1 space-y-2">
                          <p className="text-red-600 font-semibold">⚠ 住所が一致しません</p>
                          <div className="text-gray-500 space-y-0.5">
                            <p>本文：{r.bodyRawAddress ?? '（なし）'}</p>
                            <p>郵便番号から：{r.zipAddress ? `${r.zipAddress.prefecture}${r.zipAddress.city}` : '（取得失敗）'}</p>
                          </div>
                          <div className="flex gap-1.5 flex-wrap">
                            {(['body', 'zip', 'later'] as AddressChoice[]).map((c) => {
                              const labels: Record<AddressChoice, string> = {
                                body: `本文を使う（${bodyS.prefecture ?? ''}${bodyS.city ?? ''}）`,
                                zip: `郵便番号に合わせる（${r.zipAddress?.prefecture ?? ''}${r.zipAddress?.city ?? ''}）`,
                                later: '後で編集する',
                              }
                              return (
                                <button
                                  key={c}
                                  onClick={() => setAddressChoices((prev) => ({ ...prev, [i]: c }))}
                                  className={`px-2 py-1 rounded-md text-xs border transition ${
                                    choice === c
                                      ? 'bg-lavender-500 text-white border-lavender-500 font-semibold'
                                      : 'bg-white text-gray-600 border-gray-300 hover:border-lavender-400'
                                  }`}
                                >
                                  {labels[c]}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })()}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
                      {/* 受講者フィールド */}
                      <Item label="メールアドレス" value={r.student.email} />
                      <Item label="電話番号" value={r.student.phone} />
                      <Item label="郵便番号" value={r.student.postal_code} />
                      <Item label="都道府県" value={r.student.prefecture} />
                      <Item label="市区町村" value={r.student.city} />
                      <Item label="番地・建物名" value={r.student.address1} />
                      <Item label="住所2" value={r.student.address2} />
                      <Item label="生年月日" value={r.student.birth_date} />
                      <Item label="性別" value={genderLabel(r.student.gender)} />
                      {/* 申込フィールド */}
                      <div className="col-span-2 border-t border-lavender-50 mt-1 pt-1">
                        <p className="text-xs text-mint-500 font-semibold mb-0.5">申込情報</p>
                      </div>
                      <Item label="メニュー" value={r.enrollment.menu} />
                      <Item label="日程（生）" value={r.parsed.raw_schedule} />
                      <Item label="講習日" value={r.enrollment.course_date} />
                      <Item label="試験日" value={r.parsed.exam_date} />
                      <Item label="会場" value={r.enrollment.venue} />
                      <Item label="現有免許" value={r.parsed.current_license} />
                      <Item label="免許番号" value={r.parsed.license_number} />
                      {r.applicationType === 'new' && <>
                        <Item label="ルビ希望" value={r.parsed.ruby_preference} />
                        <Item label="取得目的" value={r.parsed.purpose} />
                        <Item label="特殊小型" value={r.parsed.special_small} />
                      </>}
                      {(r.applicationType === 'renewal' || r.applicationType === 'lapsed') && <>
                        <Item label="有効期限日" value={r.parsed.license_expiry} />
                        <Item label="身体検査" value={r.parsed.physical_exam} />
                        <Item label="記載事項変更" value={r.parsed.record_change} />
                        {r.applicationType === 'renewal' && <Item label="乗船予定" value={r.parsed.boarding_plan} />}
                        <Item label="送付方法" value={r.parsed.delivery_method} />
                      </>}
                      <Item label="お支払方法" value={r.parsed.payment_method} />
                    </div>
                  </div>
                ))}
              </div>
              {parsedRows.some((r) => r.addressMismatch && !excludedIndices.has(parsedRows.indexOf(r))) && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  ⚠ 住所が一致しない件が {parsedRows.filter((r, i) => r.addressMismatch && !excludedIndices.has(i)).length} 件あります。インポート後、備考欄に記録されます。
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setStep('mapping')} className="btn-secondary flex-1">戻る</button>
                <button onClick={handleImport} disabled={importing || importCount === 0} className="btn-primary flex-1">
                  {importing ? 'インポート中…' : `${importCount} 件をインポート（受講者＋申込）`}
                </button>
              </div>
            </>
            )
          })()}

          {step === 'preview' && mode === 'normal' && (
            <>
              <p className="text-sm text-gray-500">先頭 5 件のプレビューです。</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="table-head-cell">姓</th>
                      <th className="table-head-cell">名</th>
                      <th className="table-head-cell">フリガナ</th>
                      <th className="table-head-cell">電話</th>
                      <th className="table-head-cell">メール</th>
                    </tr>
                  </thead>
                  <tbody>
                    {convertNormalRows().slice(0, 5).map((r, i) => (
                      <tr key={i}>
                        <td className="table-cell">{r.last_name}</td>
                        <td className="table-cell">{r.first_name}</td>
                        <td className="table-cell text-gray-400">{r.last_kana ?? '-'}</td>
                        <td className="table-cell text-gray-400">{r.phone ?? r.mobile ?? '-'}</td>
                        <td className="table-cell text-gray-400">{r.email ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {csvRows.length > 5 && <p className="text-xs text-gray-400">…他 {csvRows.length - 5} 件</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setStep('mapping')} className="btn-secondary flex-1">戻る</button>
                <button onClick={handleImport} disabled={importing} className="btn-primary flex-1">
                  {importing ? 'インポート中…' : `${csvRows.length} 件をインポート`}
                </button>
              </div>
            </>
          )}

          {/* ── Step 4: 完了 ── */}
          {step === 'done' && result && (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">✅</div>
              <p className="text-base font-semibold text-gray-700 mb-1">インポート完了</p>
              <p className="text-sm text-gray-500">
                追加：<span className="text-mint-500 font-bold">{result.inserted} 件</span>
                　スキップ：<span className="text-gray-400">{result.skipped} 件</span>
              </p>
              {mode === 'mailwise' && (
                <p className="text-xs text-gray-400 mt-1">受講者＋申込レコードを同時に作成しました</p>
              )}
              <button onClick={onImported} className="btn-primary mt-6">閉じる</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
