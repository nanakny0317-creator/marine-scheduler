/**
 * OCRフォーム 印字位置キャリブレーションツール
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

// ── PDF仕様定数 ──────────────────────────────────────────────
const PDF_W = 592.56
const PDF_H = 842.4
const TOTAL_PAGES = 5

// ── 型定義 ─────────────────────────────────────────────────

type FieldType = 'chars' | 'text' | 'mark'

interface FieldDef {
  id: string
  key: string
  label: string
  page: number
  type: FieldType
  x: number
  y: number
  charWidth?: number
  maxChars?: number
  width?: number
  fontSize: number
  // mark型専用
  dataKey?: string    // 参照するデータキー（例: exam_qual_type）
  matchValue?: string // この値のときにマークする（例: 一級）
  markChar?: string   // 印字する文字（デフォルト: ●）
}

interface ClickPoint { x: number; y: number }

const STORAGE_KEY = 'formCalibration_v1'
const FIELD_TYPES: { value: FieldType; label: string; desc: string }[] = [
  { value: 'chars', label: '文字マス', desc: 'OCRマス目（1文字ずつ配置）' },
  { value: 'text',  label: 'テキスト', desc: '連続テキスト（住所など）' },
  { value: 'mark',  label: 'マーク',   desc: '条件付きチェック・丸印' },
]

// 使用可能なデータキー一覧
const DATA_KEY_OPTIONS: { value: string; label: string; values?: string[] }[] = [
  // ── チェックボックス系 ──
  { value: 'exam_qual_type',          label: '免許の種類',               values: ['一級', '二級', '湖川', '二級若年', '特殊'] },
  { value: 'physical_exam_cert',      label: '身体検査証明書',           values: ['あり', 'なし'] },
  { value: 'written_exam',            label: '学科試験',                 values: ['受験'] },
  { value: 'practical_exam',          label: '実技試験',                 values: ['受験'] },
  { value: 'birth_era',               label: '生年月日（元号/世紀）',    values: ['明治', '大正', '昭和', '平成', '令和', '1900', '2000'] },
  { value: 'gender',                  label: '性別',                     values: ['male', 'female'] },
  { value: 'nationality',             label: '国籍',                     values: ['韓国', '朝鮮', '米国'] },
  { value: 'license_name_changed',    label: '現有免許：氏名変更あり',   values: ['true'] },
  { value: 'license_domicile_changed',label: '現有免許：本籍/国籍変更あり', values: ['true'] },
  { value: 'current_license_marine',  label: '現有海技免許',             values: ['航海', '機関'] },
  // ── テキスト系 ──
  { value: 'last_name',       label: '姓' },
  { value: 'first_name',      label: '名' },
  { value: 'last_kana',       label: '姓（カナ）' },
  { value: 'first_kana',      label: '名（カナ）' },
  { value: 'birth_date',      label: '生年月日' },
  { value: 'domicile_pref',   label: '本籍地（都道府県）' },
  { value: 'postal_code',     label: '郵便番号' },
  { value: 'address1',        label: '住所' },
  { value: 'phone',           label: '電話番号' },
  { value: 'mobile',          label: '携帯番号' },
  { value: 'exam_date',       label: '試験日' },
  { value: 'exam_location',   label: '試験地' },
  { value: 'exam_id',         label: '試験ID' },
  { value: 'menu',            label: 'メニュー' },
  { value: 'application_type',label: '申込種別',  values: ['new', 'renewal', 'lapsed'] },
  { value: 'status',          label: 'ステータス',values: ['pending', 'confirmed', 'completed', 'cancelled'] },
]

// デフォルトプレビューテキスト（種別ごと）
const DEFAULT_PREVIEW: Record<FieldType, string> = {
  chars: 'アイウエオカキクケコ',
  text:  '大阪府大阪市北区梅田１丁目',
  mark:  '●',
}

function uid() { return Math.random().toString(36).slice(2, 8) }

function loadFields(): FieldDef[] {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    if (s) return JSON.parse(s) as FieldDef[]
  } catch { /* ignore */ }
  return []
}

function saveFields(fields: FieldDef[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fields))
}

// ── ポイント表示バッジ ────────────────────────────────────────
function PtBadge({ label, pt }: { label: string; pt: ClickPoint | null }) {
  if (!pt) return <span className="text-gray-300 text-xs">{label}：未取得</span>
  return (
    <span className="text-xs font-mono bg-lavender-50 border border-lavender-200 rounded px-2 py-0.5 text-lavender-700">
      {label}：({pt.x.toFixed(1)}, {pt.y.toFixed(1)})
    </span>
  )
}

// ── フィールド行 ──────────────────────────────────────────────
function FieldRow({ field, onEdit, onDelete, highlighted }: {
  field: FieldDef
  onEdit: () => void
  onDelete: () => void
  highlighted: boolean
}) {
  return (
    <div className={`px-3 py-2 border-b border-gray-50 last:border-0 text-xs flex items-center gap-2 hover:bg-lavender-50/40 ${highlighted ? 'bg-lavender-50' : ''}`}>
      <span className="font-mono text-gray-400 w-4">{field.page}</span>
      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
        field.type === 'chars' ? 'bg-mint-50 text-mint-600' :
        field.type === 'text'  ? 'bg-blue-50 text-blue-500' :
                                  'bg-orange-50 text-orange-500'
      }`}>{field.type}</span>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-700 truncate">{field.label}</div>
        {field.type === 'mark' && field.dataKey && (
          <div className="text-[10px] text-orange-500 truncate">
            {field.dataKey} = {field.matchValue} → {field.markChar ?? '●'}
          </div>
        )}
      </div>
      <span className="font-mono text-gray-400 shrink-0">({field.x.toFixed(0)},{field.y.toFixed(0)})</span>
      {field.type === 'chars' && <span className="text-gray-300 shrink-0">w{field.charWidth?.toFixed(1)}</span>}
      <button onClick={onEdit}   className="text-lavender-400 hover:text-lavender-600">編集</button>
      <button onClick={onDelete} className="text-red-400 hover:text-red-600">×</button>
    </div>
  )
}

// ── メインコンポーネント ──────────────────────────────────────
export default function FormCalibrationPage() {
  const navigate = useNavigate()
  const imgRef      = useRef<HTMLImageElement>(null)
  const imgWrapRef  = useRef<HTMLDivElement>(null)
  const importRef   = useRef<HTMLInputElement>(null)

  const [page,    setPage]    = useState(1)
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })
  const [fields,  setFields]  = useState<FieldDef[]>(loadFields)
  const [hover,   setHover]   = useState<ClickPoint | null>(null)
  const [ptA,     setPtA]     = useState<ClickPoint | null>(null)
  const [ptB,     setPtB]     = useState<ClickPoint | null>(null)
  const [clickSeq, setClickSeq] = useState<0 | 1 | 2>(0)  // 0=待機 1=A取得済 2=B取得済
  const [editId,  setEditId]  = useState<string | null>(null)
  const [copied,       setCopied]      = useState(false)
  const [previewText,  setPreviewText] = useState('アイウエオカキクケコ')
  const [showPreview,  setShowPreview] = useState(true)
  const [dragging,     setDragging]    = useState<'A' | 'B' | null>(null)

  // フォーム状態
  const [fKey,        setFKey]        = useState('')
  const [fLabel,      setFLabel]      = useState('')
  const [fType,       setFType]       = useState<FieldType>('chars')
  const [fMaxChars,   setFMaxChars]   = useState(20)
  const [fFontSize,   setFFontSize]   = useState(7)
  const [fWidth,      setFWidth]      = useState(200)
  const [fDataKey,    setFDataKey]    = useState('')
  const [fMatchValue, setFMatchValue] = useState('')
  const [fMarkChar,   setFMarkChar]   = useState('●')

  // 編集フォームへ読み込み
  const startEdit = (f: FieldDef) => {
    setEditId(f.id)
    setFKey(f.key); setFLabel(f.label); setFType(f.type)
    setFMaxChars(f.maxChars ?? 20); setFFontSize(f.fontSize)
    setFWidth(f.width ?? 200)
    setFDataKey(f.dataKey ?? ''); setFMatchValue(f.matchValue ?? ''); setFMarkChar(f.markChar ?? '●')
    setPtA({ x: f.x, y: f.y })
    if (f.type === 'chars' && f.charWidth) {
      setPtB({ x: f.x + f.charWidth, y: f.y })
    }
  }

  const cancelEdit = () => {
    setEditId(null); setFKey(''); setFLabel(''); setFType('chars')
    setFDataKey(''); setFMatchValue(''); setFMarkChar('●')
    setPtA(null); setPtB(null); setClickSeq(0)
  }

  // 画像クリック → PDF座標計算（ドラッグ直後は無視）
  const handleImgClick = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    if (dragging) return   // ドラッグ中はクリック無視
    const rect = imgRef.current!.getBoundingClientRect()
    const rx = (e.clientX - rect.left) / rect.width
    const ry = (e.clientY - rect.top)  / rect.height
    const px: ClickPoint = {
      x: parseFloat((rx * PDF_W).toFixed(2)),
      y: parseFloat(((1 - ry) * PDF_H).toFixed(2)),
    }
    if (clickSeq === 0) {
      setPtA(px); setPtB(null)
      setClickSeq(fType === 'chars' ? 1 : 2)
    } else if (clickSeq === 1) {
      setPtB(px); setClickSeq(2)
    }
  }, [clickSeq, fType, dragging])

  // ホバー座標
  const handleImgMove = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    const rect = imgRef.current!.getBoundingClientRect()
    const rx = (e.clientX - rect.left) / rect.width
    const ry = (e.clientY - rect.top)  / rect.height
    setHover({
      x: parseFloat((rx * PDF_W).toFixed(2)),
      y: parseFloat(((1 - ry) * PDF_H).toFixed(2)),
    })
  }, [])

  // フィールド保存
  const handleSave = () => {
    if (!ptA || !fKey.trim() || !fLabel.trim()) return

    const charWidth = (ptA && ptB && fType === 'chars')
      ? parseFloat(Math.abs(ptB.x - ptA.x).toFixed(2))
      : undefined

    const fieldData: Omit<FieldDef, 'id'> = {
      key: fKey.trim(),
      label: fLabel.trim(),
      page,
      type: fType,
      x: ptA.x, y: ptA.y,
      fontSize: fFontSize,
      ...(fType === 'chars' ? { charWidth, maxChars: fMaxChars } : {}),
      ...(fType === 'text'  ? { width: fWidth } : {}),
      ...(fType === 'mark'  ? {
        dataKey:    fDataKey.trim()    || undefined,
        matchValue: fMatchValue.trim() || undefined,
        markChar:   fMarkChar.trim()   || '●',
      } : {}),
    }

    setFields(prev => {
      const next = editId
        ? prev.map(f => f.id === editId ? { id: editId, ...fieldData } : f)
        : [...prev, { id: uid(), ...fieldData }]
      saveFields(next)
      return next
    })
    cancelEdit()
  }

  const deleteField = (id: string) => {
    setFields(prev => { const n = prev.filter(f => f.id !== id); saveFields(n); return n })
  }

  // JSON出力
  const exportJson = () => {
    const grouped: Record<number, FieldDef[]> = {}
    for (const f of fields) {
      (grouped[f.page] ??= []).push(f)
    }
    return JSON.stringify(grouped, null, 2)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(exportJson()).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target!.result as string)
        // grouped形式 { "1": [...], "2": [...] } またはフラット配列どちらも受け付ける
        let flat: FieldDef[]
        if (Array.isArray(parsed)) {
          flat = parsed as FieldDef[]
        } else {
          flat = Object.values(parsed as Record<string, FieldDef[]>).flat()
        }
        setFields(flat)
        saveFields(flat)
        alert(`${flat.length} 件のフィールドを読み込みました`)
      } catch {
        alert('JSONの読み込みに失敗しました。ファイルを確認してください。')
      }
      e.target.value = ''
    }
    reader.readAsText(file)
  }

  // ページ切り替え or 種別切り替え時にリセット
  useEffect(() => {
    setPtA(null); setPtB(null); setClickSeq(0)
  }, [page, fType])

  // 種別切り替え時にデフォルトプレビューテキストを更新
  useEffect(() => {
    setPreviewText(DEFAULT_PREVIEW[fType])
  }, [fType])

  // ドラッグ開始
  const startDrag = useCallback((e: React.MouseEvent, which: 'A' | 'B') => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(which)
  }, [])

  // ドラッグ中の mousemove / mouseup をwindowで追跡
  useEffect(() => {
    if (!dragging) return

    const onMove = (e: MouseEvent) => {
      if (!imgRef.current) return
      const rect = imgRef.current.getBoundingClientRect()
      const rx = Math.max(0, Math.min(1, (e.clientX - rect.left)  / rect.width))
      const ry = Math.max(0, Math.min(1, (e.clientY - rect.top)   / rect.height))
      const pt: ClickPoint = {
        x: parseFloat((rx * PDF_W).toFixed(2)),
        y: parseFloat(((1 - ry) * PDF_H).toFixed(2)),
      }
      if (dragging === 'A') setPtA(pt)
      else                  setPtB(pt)
    }

    const onUp = () => setDragging(null)

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [dragging])

  // 画像サイズを追跡（ResizeObserver）
  useEffect(() => {
    const el = imgRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      const r = entries[0].contentRect
      setImgSize({ w: r.width, h: r.height })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const pageFields  = fields.filter(f => f.page === page)
  const charWidthCalc = ptA && ptB && fType === 'chars'
    ? Math.abs(ptB.x - ptA.x).toFixed(2)
    : null

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">

      {/* ── ヘッダー ── */}
      <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-4 shrink-0">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600 text-sm">← 戻る</button>
        <h1 className="font-bold text-gray-700">印字位置キャリブレーション</h1>
        <div className="flex gap-1 ml-4">
          {Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1).map(p => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-8 h-8 rounded text-sm font-semibold transition ${
                page === p
                  ? 'bg-lavender-400 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-lavender-100'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-gray-400">
          定義済: {fields.length} フィールド（ページ{page}: {pageFields.length} 件）
        </span>
      </div>

      {/* ── メイン ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* 左：PDF画像 */}
        <div className="flex-1 overflow-auto bg-gray-200 p-4 flex justify-center">
          <div ref={imgWrapRef} className="relative inline-block shadow-xl">
            <img
              ref={imgRef}
              src={`/pdf-pages/page-${page}.png`}
              alt={`Page ${page}`}
              className={`block max-w-[700px] w-full select-none ${dragging ? 'cursor-grabbing' : 'cursor-crosshair'}`}
              onClick={handleImgClick}
              onMouseMove={handleImgMove}
              onMouseLeave={() => setHover(null)}
              draggable={false}
            />

            {/* ホバー座標オーバーレイ */}
            {hover && (
              <div className="absolute top-2 left-2 pointer-events-none bg-black/60 text-white text-xs font-mono px-2 py-1 rounded">
                x:{hover.x} y:{hover.y}
              </div>
            )}


            {/* 保存済みフィールドのマーカー */}
            {imgRef.current && pageFields.map(f => {
              const rect = imgRef.current!.getBoundingClientRect()
              const dispX = (f.x / PDF_W) * rect.width
              const dispY = ((PDF_H - f.y) / PDF_H) * rect.height
              return (
                <div
                  key={f.id}
                  className="absolute pointer-events-none"
                  style={{ left: dispX, top: dispY }}
                >
                  <div className={`w-2 h-2 -translate-x-1 -translate-y-1 rounded-full ${
                    f.type === 'chars' ? 'bg-mint-500' :
                    f.type === 'text'  ? 'bg-blue-500' : 'bg-orange-500'
                  } opacity-70`} />
                  <div className="absolute left-2.5 -top-0.5 text-[9px] font-bold text-white bg-black/50 rounded px-1 whitespace-nowrap">
                    {f.label}
                  </div>
                </div>
              )
            })}
            {/* ── 設定中フィールドのプレビューオーバーレイ ── */}
            {showPreview && ptA && imgSize.w > 0 && (() => {
              const sx = imgSize.w / PDF_W   // px per pt (X)
              const sy = imgSize.h / PDF_H   // px per pt (Y)
              const dispX = ptA.x * sx
              const dispY = (PDF_H - ptA.y) * sy
              const fontPx = fFontSize * sx
              const cwPx   = charWidthCalc ? parseFloat(charWidthCalc) * sx : fontPx * 1.4

              return (
                <div className="absolute inset-0 pointer-events-none">
                  {fType === 'chars' && (
                    <div
                      onMouseDown={e => startDrag(e, 'A')}
                      className={`absolute flex items-end pointer-events-auto select-none
                        ${dragging === 'A' ? 'cursor-grabbing' : 'cursor-grab'}`}
                      style={{ left: dispX, top: dispY - fontPx * 1.1 }}
                    >
                      {previewText.slice(0, fMaxChars).split('').map((ch, i) => (
                        <span
                          key={i}
                          className="text-red-500 font-bold leading-none"
                          style={{
                            fontSize: fontPx,
                            width: cwPx,
                            textAlign: 'center',
                            display: 'inline-block',
                            opacity: 0.85,
                          }}
                        >
                          {ch}
                        </span>
                      ))}
                    </div>
                  )}
                  {fType === 'text' && (
                    <div
                      onMouseDown={e => startDrag(e, 'A')}
                      className={`absolute text-red-500 font-bold leading-none whitespace-nowrap overflow-hidden pointer-events-auto select-none
                        ${dragging === 'A' ? 'cursor-grabbing' : 'cursor-grab'}`}
                      style={{
                        left: dispX,
                        top: dispY - fontPx * 1.1,
                        fontSize: fontPx,
                        maxWidth: (fWidth * sx),
                        opacity: 0.85,
                      }}
                    >
                      {previewText}
                    </div>
                  )}
                  {fType === 'mark' && (
                    <div
                      onMouseDown={e => startDrag(e, 'A')}
                      className={`absolute text-red-500 font-bold leading-none pointer-events-auto select-none
                        ${dragging === 'A' ? 'cursor-grabbing' : 'cursor-grab'}`}
                      style={{
                        left: dispX - fontPx * 0.5,
                        top: dispY - fontPx * 1.0,
                        fontSize: fontPx,
                        opacity: 0.85,
                      }}
                    >
                      {previewText}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>

        {/* 右：操作パネル */}
        <div className="w-96 bg-white border-l border-gray-200 flex flex-col overflow-hidden shrink-0">

          {/* クリック操作ガイド */}
          <div className="px-4 py-3 bg-lavender-50 border-b border-lavender-100">
            <p className="text-xs font-semibold text-lavender-600 mb-1">クリック操作</p>
            <div className="space-y-0.5 text-xs text-gray-600">
              <div className={`flex items-center gap-2 ${clickSeq === 0 ? 'font-semibold text-red-500' : 'text-gray-400'}`}>
                <span className="w-4 h-4 rounded-full bg-red-400 inline-block shrink-0" />
                {clickSeq === 0 ? '← 1クリック目：フィールド開始位置（左端）' : '点A 取得済'}
              </div>
              {fType === 'chars' && (
                <div className={`flex items-center gap-2 ${clickSeq === 1 ? 'font-semibold text-blue-500' : 'text-gray-400'}`}>
                  <span className="w-4 h-4 rounded-full bg-blue-400 inline-block shrink-0" />
                  {clickSeq === 1 ? '← 2クリック目：2文字目の位置（文字間隔の計算用）' : clickSeq === 2 ? '点B 取得済' : '2クリック目'}
                </div>
              )}
              {fType !== 'chars' && (
                <div className="flex items-center gap-2 text-gray-400">
                  <span className="w-4 h-4 rounded-full bg-gray-300 inline-block shrink-0" />
                  {fType === 'text' ? 'テキスト：1クリックのみでOK（幅は右パネルで入力）' : 'マーク：1クリックのみでOK'}
                </div>
              )}
            </div>
            <div className="mt-2 flex gap-2">
              <PtBadge label="A" pt={ptA} />
              <PtBadge label="B" pt={ptB} />
            </div>
            {charWidthCalc && (
              <p className="mt-1 text-xs font-mono text-mint-700 bg-mint-50 border border-mint-200 rounded px-2 py-0.5">
                文字間隔 = {charWidthCalc} pt
              </p>
            )}
            <button
              onClick={() => { setPtA(null); setPtB(null); setClickSeq(0) }}
              className="mt-2 text-xs text-gray-400 hover:text-gray-600 underline"
            >
              リセット
            </button>
          </div>

          {/* フィールド定義フォーム */}
          <div className="px-4 py-3 border-b border-gray-100 space-y-2.5">
            <p className="text-xs font-semibold text-gray-600">
              {editId ? '✎ フィールド編集' : '＋ フィールド追加'}
            </p>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-gray-400 mb-0.5">キー名 (英数字)</label>
                <input
                  value={fKey}
                  onChange={e => setFKey(e.target.value)}
                  placeholder="例: name_kana"
                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-lavender-400"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 mb-0.5">ラベル</label>
                <input
                  value={fLabel}
                  onChange={e => setFLabel(e.target.value)}
                  placeholder="例: 氏名フリガナ"
                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-lavender-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-gray-400 mb-0.5">フィールド種別</label>
              <div className="flex gap-1">
                {FIELD_TYPES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setFType(t.value)}
                    title={t.desc}
                    className={`flex-1 py-1 text-xs rounded border transition ${
                      fType === t.value
                        ? 'bg-lavender-400 text-white border-lavender-400'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-lavender-300'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-gray-400 mb-0.5">フォントサイズ(pt)</label>
                <input
                  type="number"
                  value={fFontSize}
                  onChange={e => setFFontSize(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-lavender-400"
                />
              </div>
              {fType === 'chars' && (
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">最大文字数</label>
                  <input
                    type="number"
                    value={fMaxChars}
                    onChange={e => setFMaxChars(Number(e.target.value))}
                    className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-lavender-400"
                  />
                </div>
              )}
              {fType === 'text' && (
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">フィールド幅(pt)</label>
                  <input
                    type="number"
                    value={fWidth}
                    onChange={e => setFWidth(Number(e.target.value))}
                    className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-lavender-400"
                  />
                </div>
              )}
              {fType === 'mark' && (
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">印字文字</label>
                  <input
                    value={fMarkChar}
                    onChange={e => setFMarkChar(e.target.value)}
                    className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-lavender-400"
                    placeholder="●"
                  />
                </div>
              )}
            </div>

            {/* マーク型：データリンク設定 */}
            {fType === 'mark' && (
              <div className="rounded-xl border border-orange-100 bg-orange-50/40 p-3 space-y-2">
                <p className="text-[10px] font-semibold text-orange-600">データリンク（条件一致でマークを印字）</p>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">参照するデータ項目</label>
                  <select
                    value={fDataKey}
                    onChange={e => { setFDataKey(e.target.value); setFMatchValue('') }}
                    className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-orange-300 bg-white"
                  >
                    <option value="">-- 選択 --</option>
                    {DATA_KEY_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}（{o.value}）</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">この値のときにマーク</label>
                  {DATA_KEY_OPTIONS.find(o => o.value === fDataKey)?.values ? (
                    <div className="flex flex-wrap gap-1">
                      {DATA_KEY_OPTIONS.find(o => o.value === fDataKey)!.values!.map(v => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setFMatchValue(v)}
                          className={`px-2.5 py-1 rounded border text-xs font-medium transition ${
                            fMatchValue === v
                              ? 'bg-orange-400 text-white border-orange-400'
                              : 'bg-white text-gray-500 border-gray-200 hover:border-orange-300'
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <input
                      value={fMatchValue}
                      onChange={e => setFMatchValue(e.target.value)}
                      placeholder="一致させる値を入力"
                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-orange-300"
                    />
                  )}
                </div>
                {fDataKey && fMatchValue && (
                  <p className="text-[10px] text-orange-600 bg-orange-100 rounded px-2 py-1">
                    「{DATA_KEY_OPTIONS.find(o => o.value === fDataKey)?.label}」が
                    <strong> {fMatchValue} </strong>
                    のとき、この位置に <strong>{fMarkChar || '●'}</strong> を印字
                  </p>
                )}
              </div>
            )}

            {/* プレビューテキスト */}
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <label className="block text-[10px] text-gray-400">プレビューテキスト（画像に赤字で表示）</label>
                <button
                  type="button"
                  onClick={() => setShowPreview(v => !v)}
                  className={`text-[10px] px-2 py-0.5 rounded border transition ${
                    showPreview
                      ? 'bg-red-50 border-red-200 text-red-500'
                      : 'bg-gray-50 border-gray-200 text-gray-400'
                  }`}
                >
                  {showPreview ? '表示中' : '非表示'}
                </button>
              </div>
              <input
                value={previewText}
                onChange={e => setPreviewText(e.target.value)}
                className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-lavender-400"
                placeholder="ここに入力した文字が画像上にプレビューされます"
              />
            </div>

            {/* 座標プレビュー */}
            {ptA && (
              <div className="bg-gray-50 rounded p-2 text-xs font-mono text-gray-600 space-y-0.5">
                <div>x: <span className="text-lavender-600">{ptA.x}</span>　y: <span className="text-lavender-600">{ptA.y}</span>　page: <span className="text-lavender-600">{page}</span></div>
                {fType === 'chars' && charWidthCalc && <div>charWidth: <span className="text-mint-600">{charWidthCalc}</span></div>}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              {editId && (
                <button onClick={cancelEdit} className="flex-1 py-1.5 text-xs border border-gray-200 rounded text-gray-500 hover:bg-gray-50">
                  キャンセル
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={!ptA || !fKey.trim() || !fLabel.trim()}
                className="flex-1 py-1.5 text-xs bg-lavender-400 text-white rounded font-semibold hover:bg-lavender-500 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {editId ? '更新' : '保存'}
              </button>
            </div>
          </div>

          {/* 定義済みフィールド一覧 */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500">
                定義済みフィールド（ページ{page}）
              </p>
              <span className="text-xs text-gray-400">{pageFields.length} 件</span>
            </div>
            {pageFields.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">このページにフィールドがありません</p>
            ) : (
              pageFields.map(f => (
                <FieldRow
                  key={f.id}
                  field={f}
                  highlighted={editId === f.id}
                  onEdit={() => startEdit(f)}
                  onDelete={() => deleteField(f.id)}
                />
              ))
            )}
          </div>

          {/* JSON エクスポート／インポート */}
          <div className="px-4 py-3 border-t border-gray-200 shrink-0 space-y-2">
            <p className="text-[10px] text-gray-400">設定の保存・読み込み（JSONファイル）</p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const blob = new Blob([exportJson()], { type: 'application/json' })
                  const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
                  a.download = 'calibration.json'; a.click()
                }}
                className="flex-1 py-2 text-xs bg-gray-700 text-white rounded font-semibold hover:bg-gray-800"
              >
                保存（ダウンロード）
              </button>
              <button
                onClick={() => importRef.current?.click()}
                className="flex-1 py-2 text-xs border border-lavender-300 text-lavender-600 rounded font-semibold hover:bg-lavender-50"
              >
                読み込む
              </button>
              <input
                ref={importRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImport}
              />
            </div>
            <button
              onClick={handleCopy}
              className="w-full py-1.5 text-xs border border-gray-200 text-gray-500 rounded hover:bg-gray-50"
            >
              {copied ? '✓ クリップボードにコピー済' : 'JSONをクリップボードにコピー'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
