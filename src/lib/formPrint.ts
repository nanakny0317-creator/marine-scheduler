/**
 * 申請書 HTML/CSS 印刷エンジン
 *
 * 変換済みレイアウト JSON (FieldDef[]) + データ Record を受け取り、
 * 申請書 PDF 画像の上にテキストを重ねた HTML を生成して印刷する。
 *
 * 座標系: PDF ポイント (1pt = 1/72 inch) 、左下原点
 *   → CSS print では bottom: Ypt / left: Xpt が 1:1 で対応する
 */


export type FieldType = 'chars' | 'text' | 'mark'

export interface FieldDef {
  id: string
  key: string
  label: string
  page: number
  type: FieldType
  x: number      // PDF points from left
  y: number      // PDF points from bottom
  charWidth?: number   // 文字マス：枠の間隔（枠の中心から次の枠の中心まで）
  maxChars?: number    // 文字マス：枠の数
  startChar?: number   // 文字マス：値の何文字目（0始まり）から印字するか（複数行・複数ブロックに分かれた欄用）
  width?: number
  fontSize: number
  dataKey?: string
  matchValue?: string
  markChar?: string
  /** 文字マスの基準点。'center' = x,y が1枠目の中心（枠方式）。未指定は旧形式（x=左端, y=文字の下端） */
  anchor?: 'center'
  /** 文字欄（text）の横幅の倍率（例 0.7 = 70%の幅の縦長の字）。旧アプリの住所欄に合わせる用 */
  scaleX?: number
}

// ── 全体の位置補正（プリンターの癖） ────────────────────────────────
// 書式の位置データとは別に、印刷全体を mm 単位で動かす。プラスは右・下。
// プリンターごとに違うので、パソコンごとに保存する（共有のデータベースには入れない）。
export interface PrintOffset { xMm: number; yMm: number }
/** 基本設定：まだ保存していないパソコンはこれを使う。
 *  2026-11-24 に親機（手差し・本番のOCR用紙）で合わせた値＝右へ0.7mm・上へ0.9mm */
export const DEFAULT_PRINT_OFFSET: PrintOffset = { xMm: 0.7, yMm: -0.9 }
const MM = 72 / 25.4

/** 旧形式の文字マスを枠方式（1枠目の中心）に変換する。印字結果は変わらない */
export function toCenterAnchor<T extends FieldDef>(f: T): T {
  if (f.type !== 'chars' || f.anchor === 'center') return f
  const cw = f.charWidth ?? f.fontSize * 1.2
  return {
    ...f,
    x: parseFloat((f.x + cw / 2).toFixed(2)),
    y: parseFloat((f.y + f.fontSize / 2).toFixed(2)),
    anchor: 'center',
  }
}

export type FormData = Record<string, string>

// ── フォント ──────────────────────────────────────────────────────
// 数字・英字・カタカナ（大文字・゛゜・ー）は OCR-HK（旧うーみーくんと同じOCR用フォント。public/fonts/ocr-hk.ttf を同梱）。
// OCR-HK に無い文字（漢字・× など）は、文字ごとに自動でゴシック体になる。
// 小さいカナ・濁音は formFieldMap 側で「大文字＋小文字区分の×」「清音＋゛」に分けてあるので、すべて OCR-HK で出る。
export const OCR_FONT_FAMILY = 'OCRHK'
export const FONT_STACK = `'${OCR_FONT_FAMILY}','MS Gothic','ＭＳ ゴシック','Hiragino Kaku Gothic Pro','Noto Sans CJK JP',monospace`
const OCR_FONT_URL = '/fonts/ocr-hk.ttf'

// 印刷用HTMLは data URL で開くので、フォントは base64 で埋め込む（読み込みは1回だけ）
let ocrFontDataUrl: Promise<string> | null = null
function loadOcrFont(): Promise<string> {
  if (!ocrFontDataUrl) {
    ocrFontDataUrl = fetch(OCR_FONT_URL)
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer() })
      .then(buf => {
        let bin = ''
        const bytes = new Uint8Array(buf)
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
        return `data:font/ttf;base64,${btoa(bin)}`
      })
      .catch(e => { ocrFontDataUrl = null; throw new Error(`OCR用フォント（${OCR_FONT_URL}）を読み込めませんでした: ${e instanceof Error ? e.message : e}`) })
  }
  return ocrFontDataUrl
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ── 座標の換算 ──────────────────────────────────────────────────
// 印字位置は調整画面の画像（申請書スキャン：幅 592.56pt × 高さ 842.4pt として扱う）上の座標。
// 実際の用紙は A4（595.28pt × 841.89pt）なので、用紙に対する割合が同じになるよう換算する。
const CAL_W = 592.56, CAL_H = 842.4
const A4_W  = 595.28, A4_H  = 841.89
const SX = A4_W / CAL_W
const SY = A4_H / CAL_H
const px = (x: number) => (x * SX).toFixed(2)
const py = (y: number) => (y * SY).toFixed(2)

/** 文字列の幅の目安（全角＝1文字分、半角＝半分） */
function textWidthPt(v: string, fs: number): number {
  let w = 0
  for (const ch of v) w += /[ -~｡-ﾟ]/.test(ch) ? fs * 0.5 : fs
  return w
}
/** 欄の幅に入らないときの横の縮め率（入るなら 1） */
function autoSqueeze(v: string, fs: number, width?: number): number {
  if (!width) return 1
  const w = textWidthPt(v, fs)
  return w > width ? Math.max(0.5, width / w) : 1
}

// ── フィールドを HTML スパンに変換 ──────────────────────────────
function fieldToHtml(field: FieldDef, data: FormData): string {
  const value = data[field.key] ?? ''
  const fs    = field.fontSize

  if (field.type === 'mark') {
    const dk  = field.dataKey
    const hit = dk
      ? data[dk] === field.matchValue
      : Boolean(value)
    if (!hit) return ''
    const ch = field.markChar ?? '×'
    return `<span style="position:absolute;left:${px(field.x)}pt;bottom:${py(field.y)}pt;font-size:${fs}pt;font-family:${FONT_STACK};color:#000;line-height:1;">${esc(ch)}</span>`
  }

  if (!value) return ''

  if (field.type === 'text') {
    // 横の縮め：指定があればそれ、無ければ欄の幅に入らないときだけ自動で縮める
    const sxr = field.scaleX && field.scaleX > 0 && field.scaleX !== 1 ? field.scaleX : autoSqueeze(value, fs, field.width)
    // 横に縮めるときは、縮めた後の幅が欄の幅に収まるよう、縮める前の幅で切る
    const maxW = field.width ? `max-width:${(Number(px(field.width)) / sxr).toFixed(2)}pt;` : ''
    const squeeze = sxr !== 1 ? `transform:scaleX(${sxr});transform-origin:left bottom;` : ''
    return `<span style="position:absolute;left:${px(field.x)}pt;bottom:${py(field.y)}pt;font-size:${fs}pt;font-family:${FONT_STACK};color:#000;line-height:1;white-space:nowrap;overflow:hidden;${maxW}${squeeze}">${esc(value)}</span>`
  }

  // chars: 1 文字ずつ、各枠の中心に配置（縦も中央）
  const f       = toCenterAnchor(field)
  const cw      = f.charWidth ?? fs * 1.2
  const start   = f.startChar ?? 0
  const chars   = Array.from(value).slice(start, start + (f.maxChars ?? 20))
  return chars.map((ch, i) => {
    const cx = f.x + i * cw
    return `<span style="position:absolute;left:${px(cx - cw / 2)}pt;bottom:${py(f.y - fs / 2)}pt;width:${px(cw)}pt;height:${fs}pt;text-align:center;font-size:${fs}pt;font-family:${FONT_STACK};color:#000;line-height:${fs}pt;">${esc(ch)}</span>`
  }).join('')
}

// ── 1 ページ分の HTML 生成 ──────────────────────────────────────
// OCR 用紙に文字だけを印字するので、背景画像は出さない（画像は位置調整用）
function buildPageHtml(fields: FieldDef[], data: FormData): string {
  const fieldHtml = fields.map(f => fieldToHtml(f, data)).join('\n')
  // 全体の位置補正は、中身をまとめて動かす（.form-shift の left/top）
  return `
<div class="form-page"><div class="form-shift">
${fieldHtml}
</div></div>`
}

// ── メイン: フォーム印刷 ────────────────────────────────────────
/** 1枚分（1人分）の印刷ジョブ */
export interface FormPrintJob {
  fields: FieldDef[]
  data: FormData
  pageCount: number
}

function jobPagesHtml({ fields, data, pageCount }: FormPrintJob): string {
  const byPage = new Map<number, FieldDef[]>()
  for (const f of fields) {
    if (!byPage.has(f.page)) byPage.set(f.page, [])
    byPage.get(f.page)!.push(f)
  }
  return Array.from({ length: pageCount }, (_, i) =>
    buildPageHtml(byPage.get(i + 1) ?? [], data)
  ).join('\n')
}

/**
 * 複数人分の申請書を1つのPDFにまとめて印刷する
 * @param jobs      1人分ずつの { 位置データ, フォームデータ, ページ数 }
 * @param formTitle PDF のタイトル
 */
export async function printForms(jobs: FormPrintJob[], formTitle: string, offset?: PrintOffset): Promise<void> {
  const pagesHtml = jobs.map(jobPagesHtml).join('\n')
  const fontUrl = await loadOcrFont()
  const off = offset ?? await loadPrintOffset()

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>${esc(formTitle)}</title>
<style>
@font-face { font-family: '${OCR_FONT_FAMILY}'; src: url(${fontUrl}) format('truetype'); font-display: block; }
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; padding: 0; }
.form-page {
  position: relative;
  width: 210mm;
  height: 297mm;
  overflow: hidden;
  page-break-after: always;
}
.form-page:last-child { page-break-after: auto; }
.form-shift { position: absolute; left: ${(off.xMm * MM).toFixed(2)}pt; top: ${(off.yMm * MM).toFixed(2)}pt; width: 210mm; height: 297mm; }
</style>
</head>
<body>
${pagesHtml}
</body>
</html>`

  if (window.api?.print?.html) {
    await window.api.print.html(html)
  } else {
    // ブラウザモード fallback
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.onload = () => win.print()
  }
}

/** このパソコンの全体の位置補正（保存していなければ基本設定） */
export async function loadPrintOffset(): Promise<PrintOffset> {
  let v: Partial<PrintOffset> = DEFAULT_PRINT_OFFSET
  try {
    const raw = await window.api.printOffset.get()
    if (raw) v = JSON.parse(raw) as Partial<PrintOffset>
  } catch { /* 読めなければ基本設定 */ }
  const n = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d)
  return { xMm: n(v.xMm, DEFAULT_PRINT_OFFSET.xMm), yMm: n(v.yMm, DEFAULT_PRINT_OFFSET.yMm) }
}
/** このパソコンだけに保存する */
export const savePrintOffset = (o: PrintOffset) => window.api.printOffset.set(JSON.stringify(o))

/** 1人分の申請書を印刷する */
export function printForm(fields: FieldDef[], data: FormData, pageCount: number, formTitle: string): Promise<void> {
  return printForms([{ fields, data, pageCount }], formTitle)
}
