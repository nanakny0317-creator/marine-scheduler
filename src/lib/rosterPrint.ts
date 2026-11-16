/**
 * 試験申請者名簿（海レ協の様式・A4横）
 *
 * 旧うーみーくん（トライセンスマネジャー）が白紙に罫線ごと印刷していた様式を再現する。
 * 1ページ7名。試験日程（試験開始日・試験地・資格・試験ID）ごとに1部。
 * 寸法はスキャンから mm に換算した値。
 */
import type { Enrollment, ExamSession, Student } from '../types'
import { examFeesForQual, type ExamFees } from './examFees'

export interface RosterEntry {
  student: Student
  enrollment: Enrollment
}

const ROWS_PER_PAGE = 7

// ── 文字の整形 ───────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const FULL = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンァィゥェォッャュョーヴガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポ'
const HALF = ['ｱ','ｲ','ｳ','ｴ','ｵ','ｶ','ｷ','ｸ','ｹ','ｺ','ｻ','ｼ','ｽ','ｾ','ｿ','ﾀ','ﾁ','ﾂ','ﾃ','ﾄ','ﾅ','ﾆ','ﾇ','ﾈ','ﾉ','ﾊ','ﾋ','ﾌ','ﾍ','ﾎ','ﾏ','ﾐ','ﾑ','ﾒ','ﾓ','ﾔ','ﾕ','ﾖ','ﾗ','ﾘ','ﾙ','ﾚ','ﾛ','ﾜ','ｦ','ﾝ','ｧ','ｨ','ｩ','ｪ','ｫ','ｯ','ｬ','ｭ','ｮ','ｰ','ｳﾞ',
  'ｶﾞ','ｷﾞ','ｸﾞ','ｹﾞ','ｺﾞ','ｻﾞ','ｼﾞ','ｽﾞ','ｾﾞ','ｿﾞ','ﾀﾞ','ﾁﾞ','ﾂﾞ','ﾃﾞ','ﾄﾞ','ﾊﾞ','ﾋﾞ','ﾌﾞ','ﾍﾞ','ﾎﾞ','ﾊﾟ','ﾋﾟ','ﾌﾟ','ﾍﾟ','ﾎﾟ']

/** カナ（ひらがな・全角カタカナ）→ 半角カタカナ（旧アプリの名簿と同じ表記） */
export function toHalfKana(s: string): string {
  const kata = s.normalize('NFKC').replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60))
  return Array.from(kata).map(c => {
    const i = FULL.indexOf(c)
    if (i >= 0) return HALF[i]
    if (c === '　') return ' '
    return c
  }).join('')
}

const ERA_INITIAL: [number, string][] = [[2019, 'R'], [1989, 'H'], [1926, 'S'], [1912, 'T'], [1868, 'M']]
const ERA_START: Record<string, number> = { R: 2018, H: 1988, S: 1925, T: 1911, M: 1867 }

/** 生年月日：日本国籍は「S 44.09.18」、外国籍は「1987.05.13」 */
function birthText(s: Student): string {
  const m = (s.birth_date ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ''
  const y = Number(m[1])
  const foreign = !!s.nationality && s.nationality !== '日本'
  if (foreign) return `${m[1]}.${m[2]}.${m[3]}`
  const e = ERA_INITIAL.find(([start]) => y >= start)?.[1] ?? 'M'
  return `${e} ${String(y - ERA_START[e]).padStart(2, '0')}.${m[2]}.${m[3]}`
}

/** 'YYYY-MM-DD' → 令和の { yy, mm, dd }（2桁） */
function reiwa(iso: string): { yy: string; mm: string; dd: string } | null {
  const m = (iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const y = Number(m[1])
  const [era, base] = y >= 2019 ? ['令和', 2018] : y >= 1989 ? ['平成', 1988] : ['昭和', 1925]
  return { yy: `${era} ${String(y - base).padStart(2, '0')}`, mm: m[2], dd: m[3] }
}

/** 「令和 08.10.18」 */
function shortDate(iso: string): string {
  const r = reiwa(iso)
  return r ? `${r.yy}.${r.mm}.${r.dd}` : ''
}

/** 資格種別 → 名簿の表記（「２級」「２級小型船舶操縦士」） */
function qualShort(q: string): string {
  const n = q.normalize('NFKC')
  if (/湖川/.test(n)) return '２級湖川'
  if (/特殊/.test(n)) return '特殊'
  if (/1級|一級/.test(n)) return '１級'
  if (/2級|二級/.test(n)) return '２級'
  return q
}
function qualLong(q: string): string {
  const s = qualShort(q)
  return s === '２級湖川' ? '２級小型船舶操縦士（湖川小出力限定）' : `${s}小型船舶操縦士`
}

const yen = (n: number) => n.toLocaleString('ja-JP')

function extraOf(e: Enrollment): Record<string, unknown> {
  try { return JSON.parse(e.extra_json) as Record<string, unknown> } catch { return {} }
}
const str = (v: unknown) => (typeof v === 'string' ? v : '')

// ── 1人分のデータ ───────────────────────────────────────────

interface PassCell { date: string; location: string; number: string; mark?: string }
interface RosterRow {
  kana: string
  birth: string
  shintai: '' | 'need' | 'have' | 'omit'
  physical: PassCell | null   // 身体検査の合格
  gakka: PassCell | null      // 学科試験の合格（学科免除の根拠）
  jitsugi: PassCell | null    // 実技試験の合格（実技免除の根拠）
}

/** 過去に合格した試験の資格 → 「Ⅰ・Ⅱ・湖・特」のどれに○を付けるか */
function qualMark(q: string): string {
  const n = q.normalize('NFKC')
  if (/湖川/.test(n)) return '湖'
  if (/特殊/.test(n)) return '特'
  if (/1級|一級/.test(n)) return 'Ⅰ'
  if (/2級|二級/.test(n)) return 'Ⅱ'
  return ''
}

function toRow({ student, enrollment }: RosterEntry): RosterRow {
  const x = extraOf(enrollment)
  const shintai = x.shintai === 'need' || x.shintai === 'have' || x.shintai === 'omit' ? x.shintai : ''
  const sp = (x.shintai_pass ?? {}) as Record<string, unknown>
  const pe = (x.prev_exam ?? {}) as Record<string, unknown>
  // 学科・実技の合格は合格発表の日（判定日）。身体検査の合格は受検した試験の日
  const prev: PassCell = { date: str(pe.result_date), location: str(pe.location), number: str(pe.number), mark: qualMark(str(pe.qual)) }
  // 学科を受けない＝学科免除（過去に学科合格）、実技を受けない＝実技免除
  const exemptGakka = x.exam_gakka === false
  const exemptJitsugi = x.exam_jitsugi === false
  return {
    kana: toHalfKana([student.last_kana, student.first_kana].filter(Boolean).join(' ')),
    birth: birthText(student),
    shintai,
    physical: shintai === 'omit' ? { date: str(sp.date), location: str(sp.location), number: str(sp.number) } : null,
    gakka: exemptGakka ? prev : null,
    jitsugi: exemptJitsugi ? prev : null,
  }
}

// ── HTML ────────────────────────────────────────────────────

// 本表の列幅（mm）：※受験番号／氏名／身体検査／合格の履歴／身体の合格／学科の合格／実技の合格／（二重線）／最後に申請した試験／返却書類／受有免許
const COLS = [13.8, 46.3, 13.4, 16.0, 31.2, 30.0, 34.5, 1.2, 32.6, 25.9, 28.6]
const SUB_H = 5.29   // 1人3段の1段の高さ（mm）

const CSS = `
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; -webkit-text-stroke: 0.35px #000; font-family: 'MS PGothic','ＭＳ Ｐゴシック','MS Gothic','Hiragino Kaku Gothic Pro','Noto Sans CJK JP',sans-serif; color: #000; }
.page { position: relative; width: 297mm; height: 210mm; overflow: hidden; page-break-after: always; }
.page:last-child { page-break-after: auto; }
.abs { position: absolute; white-space: nowrap; }
.title { left: 13.2mm; top: 13.5mm; font-size: 16pt; letter-spacing: 1pt; }
.info { left: 13.2mm; font-size: 9.5pt; }
.info b { display: inline-block; width: 23mm; font-weight: normal; letter-spacing: 0.5pt; }
.pageno { right: 12mm; top: 11.5mm; font-size: 9.5pt; }
table { border-collapse: collapse; table-layout: fixed; }
td { border: 0.3mm solid #000; padding: 0 0.8mm; font-size: 9.5pt; vertical-align: middle; overflow: hidden; white-space: nowrap; }
.fee { left: 143mm; top: 17.5mm; }
.fee td { height: 8.6mm; font-size: 12pt; }
.fee .lbl { text-align: center; font-size: 12.5pt; }
.fee .num { text-align: right; }
.slash { padding: 0; }
.slash svg { display: block; width: 100%; height: 8.6mm; }
.main { left: 13.2mm; top: 63.3mm; }
.main td { height: ${SUB_H}mm; }
.c { text-align: center; }
.r { text-align: right; }
.small { font-size: 8.5pt; }
.nb { border-top: none !important; border-bottom: none !important; }
.nbt { border-top: none !important; }
.nbb { border-bottom: none !important; }
.dbl { border-top: none !important; border-bottom: none !important; padding: 0; }
.circle { display: inline-block; border: 0.25mm solid #000; border-radius: 50%; padding: 0 0.3mm; margin: -0.4mm -0.4mm; }
.note { left: 20mm; top: 200mm; font-size: 9.5pt; }
`

/** 料金欄。複数ページのときは1ページ目に全員分の合計を印字し、2ページ目以降は枠だけ（blank） */
function feeBox(entries: RosterRow[], src: RosterEntry[], qual: string, fees: ExamFees, blank = false): string {
  const xs = src.map(e => extraOf(e.enrollment))
  const nHave = entries.filter(r => r.shintai === 'have').length
  const nNone = entries.filter(r => r.shintai === 'need').length
  const nGakka = xs.filter(x => x.exam_gakka !== false).length
  const nJitsugi = xs.filter(x => x.exam_jitsugi !== false).length
  const q = examFeesForQual(qual, fees)
  const line = (price: number, n: number) => blank
    ? `<td class="num" style="width:36mm;border-right:none">円×</td><td class="num" style="width:21mm;border-left:none;border-right:none">名＝</td><td class="num" style="width:29.5mm;border-left:none">円</td>`
    : `<td class="num" style="width:36mm;border-right:none">${yen(price)} 円×</td><td class="num" style="width:21mm;border-left:none;border-right:none">${n}名＝</td><td class="num" style="width:29.5mm;border-left:none">${yen(price * n)} 円</td>`
  const total = fees.physical_have * nHave + fees.physical_none * nNone + q.gakka * nGakka + q.jitsugi * nJitsugi
  return `<table class="abs fee">
<tr><td class="lbl" rowspan="2" style="width:28.3mm">身体検査料金</td><td class="lbl" style="width:19.2mm">証明書</td><td class="lbl" style="width:10mm">有</td>${line(fees.physical_have, nHave)}</tr>
<tr><td class="lbl">証明書</td><td class="lbl">無</td>${line(fees.physical_none, nNone)}</tr>
<tr><td class="lbl">学科試験料金</td><td class="slash" colspan="2"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="0" y1="100" x2="100" y2="0" stroke="#000" stroke-width="0.9" vector-effect="non-scaling-stroke"/></svg></td>${line(q.gakka, nGakka)}</tr>
<tr><td class="lbl">実技試験料金</td><td class="slash" colspan="2"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="0" y1="100" x2="100" y2="0" stroke="#000" stroke-width="0.9" vector-effect="non-scaling-stroke"/></svg></td>${line(q.jitsugi, nJitsugi)}</tr>
<tr><td style="border:none" colspan="3"></td><td style="text-align:left;border-right:none">　合計</td><td class="num" style="border-left:none;border-right:none">${blank ? '' : entries.length}名＝</td><td class="num" style="border-left:none">${blank ? '' : yen(total)} 円</td></tr>
</table>`
}

function passCells(p: PassCell | null, suffix: string): [string, string, string] {
  const sfx = p?.mark ? suffix.replace(p.mark, `<span class="circle">${p.mark}</span>`) : suffix
  return [
    p?.date ? esc(shortDate(p.date)) : '',
    p?.location ? esc(p.location) : '',
    `${p?.number ? esc(p.number) + ' ' : ''}<span class="small">${sfx}</span>`,
  ]
}

function personBlock(r: RosterRow | null): string {
  const mark = (v: 'need' | 'have' | 'omit', label: string) =>
    r && r.shintai === v ? `<span class="circle">${label}</span>` : label
  const ph = passCells(r?.physical ?? null, '番(合格・２種)')
  const gk = passCells(r?.gakka ?? null, '番(5限有・無)')
  const jg = passCells(r?.jitsugi ?? null, '番(Ⅰ・Ⅱ・湖・特)')
  const last = ['', '', '<span class="small">番(5限・湖・特)</span>']
  const ret = ['1.身体検査証明書', '2.住民票のコピー', '3.その他']
  const labels = ['試験開始日', '試験地', '受験番号']
  const rows: string[] = []
  for (let i = 0; i < 3; i++) {
    const b = i === 0 ? 'nbb' : i === 2 ? 'nbt' : 'nb'
    rows.push(`<tr>
${i === 0 ? `<td rowspan="3"></td><td rowspan="3" class="c">${r ? `<div>${esc(r.kana)}</div><div style="margin-top:2.4mm">${esc(r.birth)}</div>` : ''}</td>` : ''}
<td class="c ${b}">${mark((['need', 'have', 'omit'] as const)[i], ['当日検査', '提出', '省略'][i])}</td>
<td class="c small">${labels[i]}</td>
<td class="${i === 2 ? 'r' : 'c'}">${ph[i]}</td>
<td class="${i === 2 ? 'r' : 'c'}">${gk[i]}</td>
<td class="${i === 2 ? 'r' : 'c'}">${jg[i]}</td>
<td class="dbl"></td>
<td class="${i === 2 ? 'r' : 'c'}">${last[i]}</td>
<td class="small ${b}">${ret[i]}</td>
${i === 0 ? '<td rowspan="3"></td>' : ''}
</tr>`)
  }
  return rows.join('\n')
}

function mainTable(rows: (RosterRow | null)[], session: ExamSession): string {
  const d = reiwa(session.exam_date)
  const dateText = d ? `${d.yy}年　${d.mm}月　${d.dd}日` : ''
  const colgroup = `<colgroup>${COLS.map(w => `<col style="width:${w}mm">`).join('')}</colgroup>`
  return `<table class="abs main">${colgroup}
<tr><td colspan="3" class="c">資格別の試験の種別</td><td colspan="2" class="c">試験開始期日</td><td colspan="2" class="c">試験地</td><td class="dbl"></td>
  <td colspan="2" rowspan="2" class="c" style="font-size:13pt">書類の返却希望者記入</td><td rowspan="3" class="c" style="font-size:13pt;line-height:1.7;white-space:normal">受有免許<br>海技士<br>操縦士</td></tr>
<tr><td colspan="3" class="c" style="height:9mm">${esc(qualLong(session.qualification_type))}</td><td colspan="2" class="c">${dateText}</td><td colspan="2" class="c">${esc(session.exam_location)}</td><td class="dbl"></td></tr>
<tr><td class="c small" style="height:9.2mm;padding:0">※受験番号</td><td class="c small" style="white-space:normal;line-height:1.25;font-size:8pt">申請者氏名(カタカナで記入)<br>/生年月日</td><td class="c small">身体検査</td><td class="c small">合格の履歴</td>
  <td class="c small">身体検査の合格</td><td class="c small">学科試験の合格</td><td class="c small">実技試験の合格</td><td class="dbl"></td><td class="c small">最後に申請した試験</td><td class="c small" style="white-space:normal;line-height:1.2">返却が必要な書類<br>に○印</td></tr>
${rows.map(personBlock).join('\n')}
</table>`
}

function pageHtml(rows: (RosterRow | null)[], allRows: RosterRow[], src: RosterEntry[], session: ExamSession, fees: ExamFees, orgName: string, pageNo: number, pageCount: number): string {
  const d = reiwa(session.exam_date)
  const info = (top: number, label: string, value: string) =>
    `<div class="abs info" style="top:${top}mm"><b>${label}</b>：　${esc(value)}</div>`
  return `<div class="page">
<div class="abs pageno">${pageNo}/${pageCount}　（項/総項）</div>
<div class="abs title">試験申請者名簿</div>
${info(25, '試 験 開 始 日', d ? `${d.yy}年　${d.mm}月　${d.dd}日` : '')}
${info(32.6, '試　 験　 地', session.exam_location)}
${info(40.2, '試 験 種 別', qualShort(session.qualification_type))}
${info(47.8, '試　験　Ｉ　Ｄ', session.exam_id)}
${info(58.4, '団　　体　　名', orgName)}
${feeBox(allRows, src, session.qualification_type, fees, pageNo > 1)}
${mainTable(rows, session)}
<div class="abs note">※印欄は記入しないで下さい。身体検査の欄は、必ず記入(選択)してください。</div>
</div>`
}

/** 名簿のHTML（全ページ）を作る */
export function buildRosterHtml(session: ExamSession, entries: RosterEntry[], fees: ExamFees, orgName: string): string {
  const rows = entries.map(toRow)
  const pageCount = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE))
  const pages: string[] = []
  for (let p = 0; p < pageCount; p++) {
    const slice: (RosterRow | null)[] = rows.slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE)
    while (slice.length < ROWS_PER_PAGE) slice.push(null)
    pages.push(pageHtml(slice, rows, entries, session, fees, orgName, p + 1, pageCount))
  }
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>試験申請者名簿</title><style>${CSS}</style></head><body>${pages.join('\n')}</body></html>`
}

/** 試験日程に申し込んでいる受験者（試験申請の申込）を集める */
export function rosterEntriesFor(session: ExamSession, all: RosterEntry[]): RosterEntry[] {
  return all.filter(({ enrollment }) => {
    const x = extraOf(enrollment)
    if ((x.application_type ?? 'new') !== 'new') return false
    if (x.exam_session_id === session.id) return true
    return str(x.exam_date) === session.exam_date
      && str(x.exam_location) === session.exam_location
      && str(x.exam_qual_type) === session.qualification_type
  }).sort((a, b) => (a.student.last_kana ?? '').localeCompare(b.student.last_kana ?? '', 'ja'))
}
