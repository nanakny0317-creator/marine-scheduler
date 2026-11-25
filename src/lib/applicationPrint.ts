/**
 * 申請書（OCR）の印刷：1人でも複数人でも同じ処理で、1つのPDFにまとめる
 *
 * - 申込種別ごとに書式を選ぶ（試験＝試験申請書、更新＝更新申請書、失効＝再交付申請書）
 * - 試験の同時申請は、試験日が早い方を①、後の方を②にして1枚にする（2人分としては数えない）
 */
import type { Enrollment, Student } from '../types'
import { enrollmentsApi, formLayoutsApi, venuesApi } from './api'
import { buildFormData } from './formFieldMap'
import { loadBirthDateStyle } from './birthDateStyle'
import { printForms, type FieldDef, type FormPrintJob } from './formPrint'
import { findJointPartner, orderJoint } from './jointApplication'
import { readCorrectionItems, type CorrectionItem } from './correctionItems'

export const PRINT_FORM_MAP: Record<string, { layout: string; title: string; pageCount: number }> = {
  new:     { layout: '/form-layouts/shiken.json',  title: '試験申請書',       pageCount: 1 },
  renewal: { layout: '/form-layouts/koshin.json',  title: '更新申請書',       pageCount: 1 },
  lapsed:  { layout: '/form-layouts/saikofu.json', title: '失効再交付申請書', pageCount: 1 },
}

export function appTypeOf(e: Enrollment): string {
  try { return (JSON.parse(e.extra_json).application_type as string) ?? 'new' } catch { return 'new' }
}

export interface PrintTarget { student: Student; enrollment: Enrollment }

/** 申請書を印刷する。印刷した枚数を返す */
export async function printApplicationForms(targets: PrintTarget[], title?: string): Promise<number> {
  const venues = await venuesApi.list(false).catch(() => [])
  const birthStyle = await loadBirthDateStyle()
  const layouts = new Map<string, FieldDef[]>()
  // 書式は印字位置設定で保存したものがあればそちら（'/form-layouts/shiken.json' → 'shiken'）
  const loadLayout = async (url: string) => {
    const name = url.replace(/^.*\//, '').replace(/\.json$/, '')
    if (!layouts.has(url)) layouts.set(url, await formLayoutsApi.read<FieldDef[]>(name))
    return layouts.get(url)!
  }
  const siblingsCache = new Map<number, Enrollment[]>()
  const done = new Set<number>()   // 同時申請の相手として印刷済みの申込
  const jobs: FormPrintJob[] = []

  for (const { student, enrollment } of targets) {
    if (done.has(enrollment.id)) continue
    const appType = appTypeOf(enrollment)
    const def = PRINT_FORM_MAP[appType]
    if (!def) continue
    let first = enrollment, second: Enrollment | null = null
    if (appType === 'new') {
      if (!siblingsCache.has(student.id)) siblingsCache.set(student.id, await enrollmentsApi.list(student.id).catch(() => []))
      const partner = findJointPartner(enrollment, siblingsCache.get(student.id)!)
      if (partner) {
        [first, second] = orderJoint(enrollment, partner)
        done.add(partner.id)
      }
    }
    done.add(enrollment.id)
    jobs.push({ fields: await loadLayout(def.layout), data: buildFormData(student, first, null, venues, second, birthStyle), pageCount: def.pageCount })
  }

  if (jobs.length === 0) return 0
  const t = title ?? (targets.length === 1 ? PRINT_FORM_MAP[appTypeOf(targets[0].enrollment)]?.title ?? '申請書' : '申請書')
  await printForms(jobs, t)

  // 裏面（変更前の氏名・本籍・国籍）は手書き、住所変更は住民票の確認。漏れないよう、必ず続けてメモを出す
  const memo = backSideMemoTargets(targets)
  if (memo.length > 0) {
    alert(`訂正（変更）がある人が ${memo.length} 人います（裏面の手書き・住民票の確認）。

続けて「訂正の確認メモ」を開きます。コピー用紙に印刷して、申請書と一緒に置いてください。`)
    await printBackSideMemo(memo)
  }
  return jobs.length
}

// ── 訂正の確認メモ ──────────────────────────────────────────────
/** 確認すること（住所は裏面に欄がないので、住民票の確認だけ） */
const BACK_SIDE_ITEMS: { item: CorrectionItem; label: string }[] = [
  { item: 'name',        label: '裏面：変更前の氏名（カナ・漢字）' },
  { item: 'address',     label: '住所変更：住民票があるか確認' },
  { item: 'domicile',    label: '裏面：変更前の本籍' },
  { item: 'nationality', label: '裏面：変更前の国籍' },
]

interface MemoTarget { student: Student; enrollment: Enrollment; items: string[] }

/** 更新・失効で訂正あり（変更の項目がある）の人 */
export function backSideMemoTargets(targets: PrintTarget[]): MemoTarget[] {
  const out: MemoTarget[] = []
  for (const { student, enrollment } of targets) {
    const t = appTypeOf(enrollment)
    if (t !== 'renewal' && t !== 'lapsed') continue
    let ex: Record<string, unknown> = {}
    try { ex = JSON.parse(enrollment.extra_json) as Record<string, unknown> } catch { /* 空 */ }
    if (ex.correction !== 'yes') continue
    const changes = readCorrectionItems(ex.correction_items)
    const items = BACK_SIDE_ITEMS.filter(b => changes.includes(b.item)).map(b => b.label)
    if (items.length) out.push({ student, enrollment, items })
  }
  return out
}

const escHtml = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

/** 訂正の確認メモ（コピー用紙用のA4） */
export async function printBackSideMemo(memo: MemoTarget[]): Promise<void> {
  const rows = memo.map(({ student: s, enrollment: e, items }) => {
    const name = `${s.last_name ?? ''} ${s.first_name ?? ''}`.trim()
    const kana = `${s.last_kana ?? ''} ${s.first_kana ?? ''}`.trim()
    const form = PRINT_FORM_MAP[appTypeOf(e)]?.title ?? ''
    return `<tr>
  <td class="chk">☐</td>
  <td><div class="name">${escHtml(name)}</div><div class="kana">${escHtml(kana)}</div></td>
  <td>${escHtml(form)}<div class="sub">${escHtml(e.course_date ?? '')}</div></td>
  <td>${items.map(i => `<div>☐ ${escHtml(i)}</div>`).join('')}</td>
</tr>`
  }).join('\n')
  const today = new Date().toLocaleDateString('ja-JP')
  const html = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><title>訂正の確認メモ</title>
<style>
@page { size: A4 portrait; margin: 15mm; }
body { font-family: 'Yu Gothic', 'Meiryo', sans-serif; font-size: 11pt; color: #000; }
h1 { font-size: 16pt; margin: 0 0 2mm; }
.lead { margin: 0 0 5mm; font-size: 10pt; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #000; padding: 2.5mm 3mm; vertical-align: top; text-align: left; }
th { background: #eee; font-size: 10pt; }
td.chk { width: 10mm; text-align: center; font-size: 14pt; }
.name { font-size: 13pt; font-weight: bold; }
.kana, .sub { font-size: 9pt; }
tr { page-break-inside: avoid; }
</style></head><body>
<h1>訂正の確認メモ（${memo.length}人）</h1>
<p class="lead">印刷日 ${escHtml(today)}　裏面に変更前の内容を手書きし、住所変更の人は住民票を確認してください。済んだら左の欄に印を付けます。</p>
<table>
<thead><tr><th>済</th><th>氏名</th><th>申請書・講習日</th><th>手書き・確認すること</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</body></html>`
  // 申請書のPDF（receipt.pdf）を上書きしないよう、別の名前で保存
  if (window.api?.print?.html) await window.api.print.html(html, 'backside-memo')
  else { const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print() } }
}
