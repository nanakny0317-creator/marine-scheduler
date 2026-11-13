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
  width?: number
  fontSize: number
  dataKey?: string
  matchValue?: string
  markChar?: string
  /** 文字マスの基準点。'center' = x,y が1枠目の中心（枠方式）。未指定は旧形式（x=左端, y=文字の下端） */
  anchor?: 'center'
}

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
// システムフォールバック順: Windows / Mac / Linux
const FONT_STACK = "'MS Gothic','ＭＳ ゴシック','Hiragino Kaku Gothic Pro','Noto Sans CJK JP',monospace"

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
    return `<span style="position:absolute;left:${px(field.x)}pt;bottom:${py(field.y)}pt;font-size:${fs}pt;font-family:${FONT_STACK};color:#000;line-height:1;">${esc(ch)}</span>`
  }

  if (!value) return ''

  if (field.type === 'text') {
    const maxW = field.width ? `max-width:${px(field.width)}pt;` : ''
    return `<span style="position:absolute;left:${px(field.x)}pt;bottom:${py(field.y)}pt;font-size:${fs}pt;font-family:${FONT_STACK};color:#000;line-height:1;white-space:nowrap;overflow:hidden;${maxW}">${esc(value)}</span>`
  }

  // chars: 1 文字ずつ、各枠の中心に配置（縦も中央）
  const f       = toCenterAnchor(field)
  const cw      = f.charWidth ?? fs * 1.2
  const chars   = Array.from(value).slice(0, f.maxChars ?? 20)
  return chars.map((ch, i) => {
    const cx = f.x + i * cw
    return `<span style="position:absolute;left:${px(cx - cw / 2)}pt;bottom:${py(f.y - fs / 2)}pt;width:${px(cw)}pt;height:${fs}pt;text-align:center;font-size:${fs}pt;font-family:${FONT_STACK};color:#000;line-height:${fs}pt;">${esc(ch)}</span>`
  }).join('')
}

// ── 1 ページ分の HTML 生成 ──────────────────────────────────────
// OCR 用紙に文字だけを印字するので、背景画像は出さない（画像は位置調整用）
function buildPageHtml(fields: FieldDef[], data: FormData): string {
  const fieldHtml = fields.map(f => fieldToHtml(f, data)).join('\n')
  return `
<div class="form-page">
${fieldHtml}
</div>`
}

// ── メイン: フォーム印刷 ────────────────────────────────────────
/**
 * @param fields       変換済み FieldDef[] (複数ページ対応)
 * @param data         フォームデータ { キー: 値 }
 * @param pageCount    印刷するページ数
 * @param formTitle    PDF のタイトル
 */
export async function printForm(
  fields: FieldDef[],
  data: FormData,
  pageCount: number,
  formTitle: string,
): Promise<void> {
  // ページ別にグループ化
  const byPage = new Map<number, FieldDef[]>()
  for (const f of fields) {
    if (!byPage.has(f.page)) byPage.set(f.page, [])
    byPage.get(f.page)!.push(f)
  }

  const pagesHtml = Array.from({ length: pageCount }, (_, i) =>
    buildPageHtml(byPage.get(i + 1) ?? [], data)
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
