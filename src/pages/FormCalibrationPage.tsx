/**
 * OCRフォーム 印字位置キャリブレーションツール
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toCenterAnchor } from '../lib/formPrint'

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
  // 文字マス：'center' = x,y が1枠目の中心（枠方式）。旧形式は読み込み時に変換する
  anchor?: 'center'
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
  { value: 'prev_exam_qual_type',     label: '過去合格試験：資格',       values: ['一級', '二級', '湖川', '二級若年', '特殊'] },
  { value: 'birth_era',               label: '生年月日（元号/世紀）',    values: ['明治', '大正', '昭和', '平成', '令和', '1900', '2000'] },
  { value: 'gender',                  label: '性別',                     values: ['male', 'female'] },
  { value: 'nationality',             label: '国籍',                     values: ['韓国', '朝鮮', '米国'] },
  { value: 'license_name_changed',    label: '現有免許：氏名変更あり',   values: ['true'] },
  { value: 'license_domicile_changed',label: '現有免許：本籍/国籍変更あり', values: ['true'] },
  { value: 'current_license_marine',  label: '現有海技免許',             values: ['航海', '機関'] },
  { value: 'license_class',           label: '現有免許：種類',           values: ['一級', '二級', '湖川', '旧一級', '旧二級', '旧三級', '旧四級', '旧五級', '旧湖川'] },
  { value: 'license_1kairi',          label: '現有免許：限定1海里',      values: ['true'] },
  { value: 'license_tokushu',         label: '現有免許：特殊',           values: ['true'] },
  { value: 'license_tokutei',         label: '現有免許：特定',           values: ['true'] },
  { value: 'license_equipment_limited', label: '現有免許：設備限定',     values: ['true'] },
  { value: 'license_issue_era',       label: '現有免許：交付日（元号）', values: ['昭和', '平成', '令和'] },
  { value: 'license_expiry_era',      label: '現有免許：有効期限（元号）', values: ['平成', '令和'] },
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
  { value: 'license_number',          label: '免許証番号' },
  { value: 'current_license',         label: '現有免許（まとめ表記）' },
  { value: 'license_issue_era_year',  label: '交付日：和暦年' },
  { value: 'license_issue_year',      label: '交付日：西暦年' },
  { value: 'license_issue_month',     label: '交付日：月' },
  { value: 'license_issue_day',       label: '交付日：日' },
  { value: 'license_expiry_era_year', label: '有効期限：和暦年' },
  { value: 'license_expiry_year',     label: '有効期限：西暦年' },
  { value: 'license_expiry_month',    label: '有効期限：月' },
  { value: 'license_expiry_day',      label: '有効期限：日' },
  { value: 'exam_date',       label: '試験日' },
  { value: 'exam_location',   label: '試験地' },
  { value: 'exam_id',         label: '試験ID' },
  { value: 'prev_exam_year',     label: '過去合格試験：開始日 年' },
  { value: 'prev_exam_month',    label: '過去合格試験：開始日 月' },
  { value: 'prev_exam_day',      label: '過去合格試験：開始日 日' },
  { value: 'prev_exam_location', label: '過去合格試験：試験地' },
  { value: 'prev_exam_number',   label: '過去合格試験：受験番号' },
  { value: 'prev_exam_id',       label: '過去合格試験：試験ID' },
  { value: 'course_org_code',      label: '更新講習：講習機関コード（2桁）' },
  { value: 'course_pref_code',     label: '更新講習：講習実施都道府県コード（2桁）' },
  { value: 'course_date_era_year', label: '更新講習：講習実施日 和暦年（2桁）' },
  { value: 'course_date_month',    label: '更新講習：講習実施日 月' },
  { value: 'course_date_day',      label: '更新講習：講習実施日 日' },
  { value: 'bureau_code',          label: '本局コード（2桁）' },
  { value: 'branch_code',          label: '支局コード（2桁）' },
  { value: 'license_return_yes',   label: '免許証返納：有（●）' },
  { value: 'license_return_no',    label: '免許証返納：無（●）' },
  { value: 'license_return',       label: '免許証返納', values: ['yes', 'no'] },
  { value: 'training_req_1',       label: '講習要件：一号乗船履歴（●）' },
  { value: 'training_req_2',       label: '講習要件：二号特別（●）' },
  { value: 'training_req_3',       label: '講習要件：三号講習（●・更新は自動）' },
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

// ラベル先頭の欄番号（①〜⑳）でグループ分けする。番号がなければ「その他」
const OTHER_GROUP = 'その他'
function fieldGroup(label: string): string {
  const m = label.match(/^[①-⑳]/)
  return m ? m[0] : OTHER_GROUP
}

function uid() { return Math.random().toString(36).slice(2, 8) }

function loadFields(): FieldDef[] {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    if (s) return (JSON.parse(s) as FieldDef[]).map(toCenterAnchor)
  } catch { /* ignore */ }
  return []
}

function saveFields(fields: FieldDef[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fields))
}

// 書式レイアウトJSONの page は「その書式内のページ（1=表面）」。
// キャリブレーション画面の画像ページ（pdf-pages/page-N.png）とは別なので、読み込み時に対応付ける。
const FORM_IMAGE_PAGE: Record<string, number> = {
  shiken: 1, menkyo: 2, koshin: 3, saikofu: 4, teisei: 5,
}
const LOADED_FORM_KEY = 'formCalibration_loadedForm'

function loadLoadedForm(): string | null {
  try { return localStorage.getItem(LOADED_FORM_KEY) } catch { return null }
}
function saveLoadedForm(form: string | null) {
  try {
    if (form) localStorage.setItem(LOADED_FORM_KEY, form)
    else localStorage.removeItem(LOADED_FORM_KEY)
  } catch { /* ignore */ }
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
    <div id={`field-row-${field.id}`} className={`px-3 py-2 border-b border-gray-50 last:border-0 text-xs flex items-center gap-2 hover:bg-lavender-50/40 ${highlighted ? 'bg-lavender-50' : ''}`}>
      <span className="font-mono text-gray-400 w-4">{field.page}</span>
      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[11px] font-medium ${
        field.type === 'chars' ? 'bg-mint-50 text-mint-600' :
        field.type === 'text'  ? 'bg-blue-50 text-blue-500' :
                                  'bg-orange-50 text-orange-500'
      }`}>{field.type}</span>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-700 truncate">{field.label}</div>
        {field.type === 'mark' && field.dataKey && (
          <div className="text-[11px] text-orange-500 truncate">
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
  const [groupTab, setGroupTab] = useState<string>('all')   // 一覧の欄番号タブ
  const [listQuery, setListQuery] = useState('')            // 一覧の絞り込み
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })
  const [fields,  setFields]  = useState<FieldDef[]>(loadFields)
  // 書式レイアウトから読み込んだ場合、その書式名（書き出し時に page を書式内ページへ戻すため）
  const [loadedForm, setLoadedForm] = useState<string | null>(loadLoadedForm)
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
  // 編集読み込みで種別が変わるとき、下の「種別切り替えでリセット」を1回スキップする
  const skipTypeResetRef = useRef(false)
  // 枠が1つだけの文字マスを編集するとき、元の枠幅を保持する（B点がないため）
  const editCharWidthRef = useRef<number | undefined>(undefined)

  const startEdit = (f: FieldDef) => {
    if (f.type !== fType) skipTypeResetRef.current = true
    setEditId(f.id)
    setFKey(f.key); setFLabel(f.label); setFType(f.type)
    setFMaxChars(f.maxChars ?? 20); setFFontSize(f.fontSize)
    setFWidth(f.width ?? 200)
    setFDataKey(f.dataKey ?? ''); setFMatchValue(f.matchValue ?? ''); setFMarkChar(f.markChar ?? '●')
    setPtA({ x: f.x, y: f.y })
    const n = f.maxChars ?? 1
    if (f.type === 'chars' && f.charWidth && n > 1) {
      setPtB({ x: parseFloat((f.x + f.charWidth * (n - 1)).toFixed(2)), y: f.y })
    } else {
      setPtB(null)
    }
    editCharWidthRef.current = f.charWidth
  }

  // 画像上のマーカーから選択：編集フォームに読み込み、一覧の該当行を表示
  const selectFromImage = (f: FieldDef) => {
    startEdit(f)
    setClickSeq(0)
    setGroupTab(fieldGroup(f.label))
    setListQuery('')
    setTimeout(() => {
      document.getElementById(`field-row-${f.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 0)
  }

  const cancelEdit = () => {
    setEditId(null); setFKey(''); setFLabel(''); setFType('chars')
    setFDataKey(''); setFMatchValue(''); setFMarkChar('●')
    setPtA(null); setPtB(null); setClickSeq(0)
    editCharWidthRef.current = undefined
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
      setClickSeq(fType === 'chars' && fMaxChars > 1 ? 1 : 2)
    } else if (clickSeq === 1) {
      // 最後の枠：縦位置は1枠目に揃える
      setPtB({ x: px.x, y: ptA?.y ?? px.y }); setClickSeq(2)
    }
  }, [clickSeq, fType, fMaxChars, dragging, ptA])

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

    // 枠の間隔 = (最後の枠 − 1枠目) ÷ (枠の数 − 1)。枠が1つなら元の値（なければ文字サイズから）
    const charWidth = fType === 'chars'
      ? (ptB && fMaxChars > 1
          ? parseFloat((Math.abs(ptB.x - ptA.x) / (fMaxChars - 1)).toFixed(3))
          : editCharWidthRef.current ?? parseFloat((fFontSize * 1.4).toFixed(2)))
      : undefined

    const fieldData: Omit<FieldDef, 'id'> = {
      key: fKey.trim(),
      label: fLabel.trim(),
      page,
      type: fType,
      x: ptA.x, y: ptA.y,
      fontSize: fFontSize,
      ...(fType === 'chars' ? { charWidth, maxChars: fMaxChars, anchor: 'center' as const } : {}),
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
    // 書式レイアウト読み込み中は、画像ページ → 書式内ページ（表面=1）に戻して書き出す
    const imgPage = loadedForm ? FORM_IMAGE_PAGE[loadedForm] : undefined
    const out = imgPage ? fields.map(f => (f.page === imgPage ? { ...f, page: 1 } : f)) : fields
    const grouped: Record<number, FieldDef[]> = {}
    for (const f of out) {
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
        flat = flat.map(toCenterAnchor)
        setFields(flat)
        saveFields(flat)
        setLoadedForm(null)
        saveLoadedForm(null)
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
    if (skipTypeResetRef.current) { skipTypeResetRef.current = false; return }
    setPtA(null); setPtB(null); setClickSeq(0)
  }, [page, fType])

  // 矢印キーで位置を微調整（A・B を一緒に移動）。0.5pt、Shift で 5pt
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!ptA) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      const step = e.shiftKey ? 5 : 0.5
      let dx = 0, dy = 0
      switch (e.key) {
        case 'ArrowLeft':  dx = -step; break
        case 'ArrowRight': dx =  step; break
        case 'ArrowUp':    dy =  step; break   // PDF座標は上向きが +y
        case 'ArrowDown':  dy = -step; break
        default: return
      }
      e.preventDefault()
      const mv = (p: ClickPoint): ClickPoint => ({
        x: parseFloat(Math.max(0, Math.min(PDF_W, p.x + dx)).toFixed(2)),
        y: parseFloat(Math.max(0, Math.min(PDF_H, p.y + dy)).toFixed(2)),
      })
      setPtA(p => (p ? mv(p) : p))
      setPtB(p => (p ? mv(p) : p))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ptA])

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
  // 欄番号タブ（①→⑳、その他は最後）
  const groupCounts = new Map<string, number>()
  for (const f of pageFields) {
    const g = fieldGroup(f.label)
    groupCounts.set(g, (groupCounts.get(g) ?? 0) + 1)
  }
  const groups = Array.from(groupCounts.keys()).sort((a, b) =>
    a === OTHER_GROUP ? 1 : b === OTHER_GROUP ? -1 : a.localeCompare(b))
  const activeGroup = groupTab !== 'all' && groupCounts.has(groupTab) ? groupTab : 'all'
  const q = listQuery.trim()
  const listFields = pageFields.filter(f =>
    (activeGroup === 'all' || fieldGroup(f.label) === activeGroup) &&
    (!q || f.label.includes(q) || f.key.includes(q) || (f.dataKey ?? '').includes(q) || (f.matchValue ?? '').includes(q)))
  const charWidthCalc = ptA && ptB && fType === 'chars' && fMaxChars > 1
    ? (Math.abs(ptB.x - ptA.x) / (fMaxChars - 1)).toFixed(2)
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
              const selected = editId === f.id
              // 2点目（B）を指定中はマーカーをクリック不可にして、画像へのクリックを優先
              const clickable = clickSeq !== 1 && !dragging
              return (
                <div
                  key={f.id}
                  className={`absolute ${selected ? 'z-20' : 'z-10'} ${clickable ? 'cursor-pointer' : 'pointer-events-none'}`}
                  style={{ left: dispX, top: dispY }}
                  onClick={e => { e.stopPropagation(); selectFromImage(f) }}
                  title={`${f.label}（クリックで編集）`}
                >
                  <div className={`w-2 h-2 -translate-x-1 -translate-y-1 rounded-full ${
                    f.type === 'chars' ? 'bg-mint-500' :
                    f.type === 'text'  ? 'bg-blue-500' : 'bg-orange-500'
                  } ${selected ? 'ring-2 ring-lavender-500 opacity-100' : 'opacity-70'}`} />
                  <div className={`absolute left-2.5 -top-0.5 text-[10px] font-bold text-white rounded px-1 whitespace-nowrap ${
                    selected ? 'bg-lavender-500' : 'bg-black/50 hover:bg-lavender-500/90'
                  }`}>
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
                  {fType === 'chars' && (() => {
                    const n = Math.max(1, fMaxChars)
                    const pitchPx = n > 1 && ptB ? ((ptB.x - ptA.x) / (n - 1)) * sx : cwPx
                    const boxW = Math.max(Math.abs(pitchPx), fontPx)
                    const boxH = fontPx * 1.4
                    const chars = Array.from(previewText)
                    return (
                      <>
                        {Array.from({ length: n }, (_, i) => {
                          const cx = dispX + i * pitchPx
                          return (
                            <div
                              key={i}
                              onMouseDown={i === 0 ? (e => startDrag(e, 'A')) : undefined}
                              className={`absolute flex items-center justify-center border border-dashed border-red-300 select-none ${
                                i === 0 ? `pointer-events-auto ${dragging === 'A' ? 'cursor-grabbing' : 'cursor-grab'}` : ''
                              }`}
                              style={{ left: cx - boxW / 2, top: dispY - boxH / 2, width: boxW, height: boxH }}
                            >
                              <span className="text-red-500 font-bold leading-none" style={{ fontSize: fontPx, opacity: 0.85 }}>
                                {chars[i] ?? ''}
                              </span>
                            </div>
                          )
                        })}
                        {/* 最後の枠（B）：ドラッグで間隔を調整 */}
                        {n > 1 && ptB && (
                          <div
                            onMouseDown={e => startDrag(e, 'B')}
                            className={`absolute w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500 ring-2 ring-white pointer-events-auto ${
                              dragging === 'B' ? 'cursor-grabbing' : 'cursor-ew-resize'
                            }`}
                            style={{ left: ptB.x * sx, top: dispY }}
                            title="最後の枠（ドラッグで間隔を調整）"
                          />
                        )}
                      </>
                    )
                  })()}
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
                {clickSeq === 0
                  ? (fType === 'chars' ? '← 1クリック目：1枠目の中心' : '← 1クリック目：フィールド開始位置（左端）')
                  : '点A 取得済'}
              </div>
              {fType === 'chars' && (
                <div className={`flex items-center gap-2 ${clickSeq === 1 ? 'font-semibold text-blue-500' : 'text-gray-400'}`}>
                  <span className="w-4 h-4 rounded-full bg-blue-400 inline-block shrink-0" />
                  {fMaxChars <= 1
                    ? '枠が1つなので2クリック目は不要'
                    : clickSeq === 1 ? '← 2クリック目：最後の枠の中心（枠の数で均等に割ります）' : clickSeq === 2 ? '点B 取得済' : '2クリック目：最後の枠の中心'}
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
              {ptA && (
                <span className="text-[11px] text-gray-400">矢印キーで移動（Shift で大きく）</span>
              )}
            </div>
            {charWidthCalc && (
              <p className="mt-1 text-xs font-mono text-mint-700 bg-mint-50 border border-mint-200 rounded px-2 py-0.5">
                枠の間隔 = {charWidthCalc} pt（{fMaxChars} 枠）
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
                <label className="block text-[11px] text-gray-400 mb-0.5">キー名 (英数字)</label>
                <input
                  value={fKey}
                  onChange={e => setFKey(e.target.value)}
                  placeholder="例: name_kana"
                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-lavender-400"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 mb-0.5">ラベル</label>
                <input
                  value={fLabel}
                  onChange={e => setFLabel(e.target.value)}
                  placeholder="例: 氏名フリガナ"
                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-lavender-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-gray-400 mb-0.5">フィールド種別</label>
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
                <label className="block text-[11px] text-gray-400 mb-0.5">フォントサイズ(pt)</label>
                <input
                  type="number"
                  value={fFontSize}
                  onChange={e => setFFontSize(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-lavender-400"
                />
              </div>
              {fType === 'chars' && (
                <div>
                  <label className="block text-[11px] text-gray-400 mb-0.5">枠の数</label>
                  <input
                    type="number"
                    min={1}
                    value={fMaxChars}
                    onChange={e => setFMaxChars(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-lavender-400"
                  />
                </div>
              )}
              {fType === 'text' && (
                <div>
                  <label className="block text-[11px] text-gray-400 mb-0.5">フィールド幅(pt)</label>
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
                  <label className="block text-[11px] text-gray-400 mb-0.5">印字文字</label>
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
                <p className="text-[11px] font-semibold text-orange-600">データリンク（条件一致でマークを印字）</p>
                <div>
                  <label className="block text-[11px] text-gray-400 mb-0.5">参照するデータ項目</label>
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
                  <label className="block text-[11px] text-gray-400 mb-0.5">この値のときにマーク</label>
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
                  <p className="text-[11px] text-orange-600 bg-orange-100 rounded px-2 py-1">
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
                <label className="block text-[11px] text-gray-400">プレビューテキスト（画像に赤字で表示）</label>
                <button
                  type="button"
                  onClick={() => setShowPreview(v => !v)}
                  className={`text-[11px] px-2 py-0.5 rounded border transition ${
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
              <span className="text-xs text-gray-400">
                {listFields.length !== pageFields.length && `${listFields.length} / `}{pageFields.length} 件
              </span>
            </div>
            {pageFields.length > 0 && (
              <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-3 py-2 space-y-2">
                <div className="flex flex-wrap gap-1">
                  {['all', ...groups].map(g => (
                    <button
                      key={g}
                      onClick={() => setGroupTab(g)}
                      className={`px-2 py-0.5 rounded text-xs font-medium transition ${
                        activeGroup === g
                          ? 'bg-lavender-400 text-white'
                          : 'bg-gray-100 text-gray-500 hover:bg-lavender-100'
                      }`}
                    >
                      {g === 'all' ? 'すべて' : g}
                      <span className="ml-1 opacity-70 text-[10px]">{g === 'all' ? pageFields.length : groupCounts.get(g)}</span>
                    </button>
                  ))}
                </div>
                <input
                  value={listQuery}
                  onChange={e => setListQuery(e.target.value)}
                  placeholder="ラベル・キーで絞り込み（例：東京、郵便）"
                  className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-lavender-300"
                />
              </div>
            )}
            {pageFields.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">このページにフィールドがありません</p>
            ) : listFields.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">該当するフィールドがありません</p>
            ) : (
              listFields.map(f => (
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

          {/* 事前定義フォームの読み込み */}
          <div className="px-4 py-3 border-t border-gray-200 shrink-0 space-y-2">
            <p className="text-[11px] text-gray-400 font-semibold">書式レイアウトを読み込む</p>
            <div className="flex gap-2">
              {[
                { label: '試験申請書',       file: 'shiken'  },
                { label: '免許申請書',       file: 'menkyo'  },
                { label: '更新申請書',       file: 'koshin'  },
                { label: '失効再交付申請書', file: 'saikofu' },
                { label: '訂正申請書',       file: 'teisei'  },
              ].map(({ label, file }) => (
                <button
                  key={file}
                  onClick={async () => {
                    try {
                      const res  = await fetch(`/form-layouts/${file}.json`)
                      const raw  = await res.json() as FieldDef[]
                      // 表面（page 1）をこの書式の画像ページに割り当てる
                      const imgPage = FORM_IMAGE_PAGE[file]
                      const data = raw.map(toCenterAnchor).map(f => (f.page === 1 ? { ...f, page: imgPage } : f))
                      setFields(data)
                      saveFields(data)
                      setLoadedForm(file)
                      saveLoadedForm(file)
                      setPage(imgPage)
                      alert(`${label}：${data.length} 件読み込みました（ページ${imgPage}）`)
                    } catch {
                      alert('読み込みに失敗しました')
                    }
                  }}
                  className="flex-1 py-1.5 text-[11px] border border-lavender-200 text-lavender-600 rounded hover:bg-lavender-50 leading-tight text-center"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* JSON エクスポート／インポート */}
          <div className="px-4 py-3 border-t border-gray-200 shrink-0 space-y-2">
            <p className="text-[11px] text-gray-400">手動保存・読み込み（JSONファイル）</p>
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
