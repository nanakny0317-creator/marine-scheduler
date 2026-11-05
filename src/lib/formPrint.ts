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
  charWidth?: number
  maxChars?: number
  width?: number
  fontSize: number
  dataKey?: string
  matchValue?: string
  markChar?: string
}

export type FormData = Record<string, string>

// ── フォント ──────────────────────────────────────────────────────
// システムフォールバック順: Windows / Mac / Linux
const FONT_STACK = "'MS Gothic','ＭＳ ゴシック','Hiragino Kaku Gothic Pro','Noto Sans CJK JP',monospace"

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
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
    const ch = field.markChar ?? '●'
    return `<span style="position:absolute;left:${field.x}pt;bottom:${field.y}pt;font-size:${fs}pt;font-family:${FONT_STACK};color:#000;line-height:1;">${esc(ch)}</span>`
  }

  if (!value) return ''

  if (field.type === 'text') {
    const maxW = field.width ? `max-width:${field.width}pt;` : ''
    return `<span style="position:absolute;left:${field.x}pt;bottom:${field.y}pt;font-size:${fs}pt;font-family:${FONT_STACK};color:#000;line-height:1;white-space:nowrap;overflow:hidden;${maxW}">${esc(value)}</span>`
  }

  // chars: 1 文字ずつ配置
  const cw      = field.charWidth ?? fs * 1.2
  const chars   = Array.from(value).slice(0, field.maxChars ?? 20)
  return chars.map((ch, i) =>
    `<span style="position:absolute;left:${(field.x + i * cw).toFixed(2)}pt;bottom:${field.y}pt;width:${cw.toFixed(2)}pt;text-align:center;font-size:${fs}pt;font-family:${FONT_STACK};color:#000;line-height:1;">${esc(ch)}</span>`
  ).join('')
}

// ── 1 ページ分の HTML 生成 ──────────────────────────────────────
function buildPageHtml(
  pageNum: number,
  fields: FieldDef[],
  data: FormData,
  imageDataUrl: string,
): string {
  const fieldHtml = fields.map(f => fieldToHtml(f, data)).join('\n')
  return `
<div class="form-page">
  <img class="form-bg" src="${imageDataUrl}" alt="page ${pageNum}">
${fieldHtml}
</div>`
}

// ── PNG を fetch して base64 data URL に変換 ───────────────────
async function toDataUrl(src: string): Promise<string> {
  const res  = await fetch(src)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror   = reject
    reader.readAsDataURL(blob)
  })
}

// ── メイン: フォーム印刷 ────────────────────────────────────────
/**
 * @param fields       変換済み FieldDef[] (複数ページ対応)
 * @param data         フォームデータ { キー: 値 }
 * @param pageCount    印刷するページ数
 * @param formTitle    PDF のタイトル
 * @param imagePrefix  フォーム画像の URL プレフィックス (例: '/pdf-pages/page-')
 */
export async function printForm(
  fields: FieldDef[],
  data: FormData,
  pageCount: number,
  formTitle: string,
  imagePrefix = '/pdf-pages/page-',
): Promise<void> {
  // ページ別にグループ化
  const byPage = new Map<number, FieldDef[]>()
  for (const f of fields) {
    if (!byPage.has(f.page)) byPage.set(f.page, [])
    byPage.get(f.page)!.push(f)
  }

  // 使用するページ画像を先読み (base64)
  const imageUrls: string[] = await Promise.all(
    Array.from({ length: pageCount }, (_, i) =>
      toDataUrl(`${imagePrefix}${i + 1}.png`)
    )
  )

  const pagesHtml = Array.from({ length: pageCount }, (_, i) =>
    buildPageHtml(i + 1, byPage.get(i + 1) ?? [], data, imageUrls[i])
  ).join('\n')

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>${esc(formTitle)}</title>
<style>
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
.form-bg {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
}
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
