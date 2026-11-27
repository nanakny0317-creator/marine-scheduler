/**
 * 免許申請書（操縦免許申請書・OCR）の印刷
 *
 * 合格発表の前日ごろに書類を作り、合格した人だけ当日運輸局へ持っていく。発表前でも誰の分でも印刷できる。
 * - ①資格種別：受けた試験の種類に×（同時申請は両方）。設備等限定は試験の申込で選んだときだけ。特定（旅客）は別枠なので印字しない
 * - ②〜④：一級・二級等の行と特殊の行。それぞれの試験の試験事務所番号・試験ID・受験番号
 * - 同時申請（例：二級と特殊）は1枚にまとめて、2行とも書く
 * - ⑬申請月日：免許申請の画面で設定した申請日（extra.license_application_date）。未設定は空欄。不備などで後日になることもある
 * - そのほか（氏名・住所・生年月日など）は試験申請書と同じ印字データ（buildFormData）
 */
import type { Enrollment, ExamRecord, ExamSession, Student } from '../types'
import { formLayoutsApi, venuesApi } from './api'
import { buildFormData, type FormData } from './formFieldMap'
import { loadBirthDateStyle } from './birthDateStyle'
import { printForms, type FieldDef, type FormPrintJob } from './formPrint'
import { findJointPartner } from './jointApplication'
import { recordFor } from './examResultEntry'
import { getApplicationDate } from './applicationDate'
import { examOfficeNumber, loadExamOffices } from './examOffices'
import { normalizeExamId } from './examId'
import type { RosterEntry } from './rosterPrint'

function extraOf(e: Enrollment): Record<string, unknown> {
  try { return JSON.parse(e.extra_json) as Record<string, unknown> } catch { return {} }
}

const X = (b: boolean) => (b ? '×' : '')

/** 試験の種類 → 申請書①の枠（若年は二級） */
function classOf(qual: string): '1' | '2' | 'kokawa' | 'tokushu' | '' {
  const q = qual.normalize('NFKC')
  if (q === '特殊') return 'tokushu'
  if (/湖川/.test(q)) return 'kokawa'
  if (/1級|一級/.test(q)) return '1'
  if (/2級|二級/.test(q)) return '2'
  return ''
}

/** 1つの試験（申込＋試験日程＋試験記録） */
export interface LicenseExam { entry: RosterEntry; session: ExamSession; record: ExamRecord | null }

/** 免許申請書1枚分の印字データ。exams は1つ（単独）か2つ（同時申請：一級・二級等＋特殊） */
export function buildMenkyoData(
  exams: LicenseExam[], base: FormData, offices: Awaited<ReturnType<typeof loadExamOffices>>,
): FormData {
  const tokushu = exams.find(e => classOf(e.session.qualification_type) === 'tokushu')
  const main = exams.find(e => e !== tokushu)
  const classes = exams.map(e => classOf(e.session.qualification_type))
  const examNo = (e?: LicenseExam) => (e?.record?.gakka_exam_number ?? e?.record?.jitsugi_exam_number ?? '').normalize('NFKC').trim()
  const row = (e?: LicenseExam) => e
    ? { office: examOfficeNumber(e.session, offices), id: normalizeExamId(e.session.exam_id), no: examNo(e) }
    : { office: '', id: '', no: '' }
  const r1 = row(main), rt = row(tokushu)
  // ⑬申請月日：設定した免許申請の申請日（同時申請は、印刷した方→相手の順で入っている方）
  const appDate = exams.map(e => getApplicationDate(e.entry.enrollment, 'license')).find(Boolean) ?? ''
  const [, am = '', ad = ''] = appDate.match(/^\d{4}-(\d{2})-(\d{2})/) ?? []
  const equipment = exams.some(e => extraOf(e.entry.enrollment).equipment_limited === true)
  const name = exams
    .slice().sort((a, b) => (a === tokushu ? 1 : 0) - (b === tokushu ? 1 : 0))
    .map(e => e.session.qualification_type).filter(Boolean).join('・')

  return {
    ...base,
    menkyo_qual_name: name,
    menkyo_class_1:       X(classes.includes('1')),
    menkyo_class_2:       X(classes.includes('2')),
    menkyo_class_kokawa:  X(classes.includes('kokawa')),
    menkyo_class_tokushu: X(classes.includes('tokushu')),
    menkyo_equipment_limited: X(equipment),
    menkyo_tokutei: '',   // 特定操縦免許は国家試験とは別枠（別の入口で作る）
    menkyo_office_1:  r1.office, menkyo_exam_id_1: r1.id, menkyo_exam_no_1: r1.no,
    menkyo_office_t:  rt.office, menkyo_exam_id_t: rt.id, menkyo_exam_no_t: rt.no,
    app_date_era_year: '',   // 免許申請書の申請月日に年の欄はない（試験の申請日が残らないように消す）
    app_date_month: am,
    app_date_day:   ad,
  }
}

/** 印刷する人（免許申請の画面で選んだ人）。同じ人の同時申請の相手は、ほかの試験日程から探す */
export interface LicensePrintInput {
  targets: LicenseExam[]
  /** すべての試験日程・試験申請の申込・試験記録（同時申請の相手を探す用） */
  sessions: ExamSession[]
  applicants: RosterEntry[]
  records: ExamRecord[]
  rosterFor: (s: ExamSession) => RosterEntry[]
}

/** 同時申請の相手（一級・二級等と特殊の組み合わせのときだけ1枚にまとめる） */
function partnerOf(t: LicenseExam, input: LicensePrintInput): LicenseExam | null {
  const siblings = input.applicants.filter(a => a.student.id === t.entry.student.id).map(a => a.enrollment)
  const p = findJointPartner(t.entry.enrollment, siblings)
  if (!p) return null
  for (const s of input.sessions) {
    const entry = input.rosterFor(s).find(x => x.enrollment.id === p.id)
    if (!entry) continue
    const pair = [classOf(t.session.qualification_type), classOf(s.qualification_type)]
    // 片方が特殊・もう片方が特殊以外のときだけ（2行に分けて書ける組み合わせ）
    if (pair.filter(c => c === 'tokushu').length !== 1) return null
    return { entry, session: s, record: recordFor(entry, s, input.records) }
  }
  return null
}

/** 免許申請書を印刷する。印刷した枚数を返す */
export async function printLicenseApplications(input: LicensePrintInput): Promise<number> {
  const [venues, birthStyle, offices, fields] = await Promise.all([
    venuesApi.list(false).catch(() => []),
    loadBirthDateStyle(),
    loadExamOffices(),
    formLayoutsApi.read<FieldDef[]>('menkyo'),
  ])
  const done = new Set<number>()
  const jobs: FormPrintJob[] = []
  for (const t of input.targets) {
    if (done.has(t.entry.enrollment.id)) continue
    const partner = partnerOf(t, input)
    const exams = partner ? [t, partner] : [t]
    exams.forEach(e => done.add(e.entry.enrollment.id))
    const base = buildFormData(t.entry.student as Student, t.entry.enrollment, t.session, venues, null, birthStyle)
    jobs.push({ fields, data: buildMenkyoData(exams, base, offices), pageCount: 1 })
  }
  if (jobs.length === 0) return 0
  await printForms(jobs, '免許申請書')
  return jobs.length
}
