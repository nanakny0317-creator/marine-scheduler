/**
 * 合否の入力・判定（試験申請の「合格確認」と免許申請の画面で共用）
 *
 * 合否は試験記録（exam_records）に保存する。受けない科目（免除）は '免'。
 * 試験日程の result_checked ＝「合否を確定した」。確定した試験の合格者だけが免許申請の対象になる。
 */
import type { Enrollment, ExamRecord, ExamRecordInput, ExamResult, ExamSession } from '../types'
import { examRecordsApi } from './api'
import { resultDateOf } from './examResult'
import type { RosterEntry } from './rosterPrint'

function extraOf(e: Enrollment): Record<string, unknown> {
  try { return JSON.parse(e.extra_json) as Record<string, unknown> } catch { return {} }
}

/** この申込・試験日程の試験記録 */
export function recordFor(x: RosterEntry, s: ExamSession, records: ExamRecord[]): ExamRecord | null {
  return records.find(r => r.enrollment_id === x.enrollment.id)
    ?? records.find(r => r.student_id === x.student.id && (r.gakka_session_id === s.id || r.jitsugi_session_id === s.id))
    ?? null
}

export interface ResultStatus {
  takesGakka: boolean
  takesJitsugi: boolean
  gakka: ExamResult      // 受けない科目は '免'
  jitsugi: ExamResult
  passed: boolean
  pending: boolean       // まだ入力していない科目がある
}

export function statusOf(x: RosterEntry, rec: ExamRecord | null): ResultStatus {
  const ex = extraOf(x.enrollment)
  const takesGakka = ex.exam_gakka !== false
  const takesJitsugi = ex.exam_jitsugi !== false
  const gakka = takesGakka ? rec?.gakka_result ?? null : '免'
  const jitsugi = takesJitsugi ? rec?.jitsugi_result ?? null : '免'
  const ok = (r: ExamResult) => r === '合' || r === '免'
  return { takesGakka, takesJitsugi, gakka, jitsugi, passed: ok(gakka) && ok(jitsugi), pending: gakka == null || jitsugi == null }
}

/** 合否・受験番号を保存して、保存後の試験記録を返す */
export async function saveResult(
  x: RosterEntry, session: ExamSession, records: ExamRecord[], patch: Partial<ExamRecordInput>,
): Promise<ExamRecord> {
  const rec = recordFor(x, session, records)
  const st = statusOf(x, rec)
  const rd = resultDateOf(session) || null
  const base: ExamRecordInput = rec
    ? { ...rec }
    : {
        student_id: x.student.id, enrollment_id: x.enrollment.id, qualification_type: session.qualification_type,
        shintai_cert: false, shintai_valid_until: null,
        gakka_session_id: st.takesGakka ? session.id : null, gakka_exam_number: null,
        gakka_result: st.takesGakka ? null : '免', gakka_result_date: null,
        jitsugi_session_id: st.takesJitsugi ? session.id : null, jitsugi_exam_number: null,
        jitsugi_result: st.takesJitsugi ? null : '免', jitsugi_result_date: null,
        note: null,
      }
  const next: ExamRecordInput = { ...base, enrollment_id: base.enrollment_id ?? x.enrollment.id, ...patch }
  // 合否を入れたら合格日（＝発表日）も入れる
  if (patch.gakka_result !== undefined) next.gakka_result_date = patch.gakka_result ? (base.gakka_result_date || rd) : null
  if (patch.jitsugi_result !== undefined) next.jitsugi_result_date = patch.jitsugi_result ? (base.jitsugi_result_date || rd) : null
  const { id: _i, created_at: _c, updated_at: _u, ...input } = next as ExamRecordInput & Partial<ExamRecord>
  return rec ? examRecordsApi.update(rec.id, input) : examRecordsApi.create(input)
}

/** 合否確認が残っている試験か（試験日が過ぎた・受験者がいる・まだ確定していない） */
export function needsResultCheck(s: ExamSession, applicantCount: number, today: string): boolean {
  return s.exam_date < today && !s.result_checked && applicantCount > 0
}
