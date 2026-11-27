/**
 * 申請日（申請書の「申請日」「申請月日」欄に印字する日付）
 *
 * 書類を事前に作ることがあるので、印刷日ではなく申込ごとに設定した日付を使う。
 * 申込の extra_json.application_date に 'YYYY-MM-DD' で保存する（未設定なら空欄で印字）。
 * 免許申請書の申請月日は試験の申込に別に持つ（extra_json.license_application_date）。
 * 試験申請書の申請日とは別の日で、不備などで後日になることもあるので、免許申請の画面で設定する。
 */
import type { Enrollment } from '../types'
import { enrollmentsApi } from './api'

/** 'application' = 試験・更新・失効・訂正の申請書の申請日、'license' = 免許申請書の申請月日 */
export type AppDateKind = 'application' | 'license'
const KEY: Record<AppDateKind, string> = { application: 'application_date', license: 'license_application_date' }

function parseExtra(e: Enrollment): Record<string, unknown> {
  try { return JSON.parse(e.extra_json) as Record<string, unknown> } catch { return {} }
}

export function getApplicationDate(e: Enrollment, kind: AppDateKind = 'application'): string {
  const v = parseExtra(e)[KEY[kind]]
  return typeof v === 'string' ? v : ''
}

/** 申請日を設定する（空文字で解除）。更新後の申込を返す */
export async function setApplicationDate(e: Enrollment, iso: string, kind: AppDateKind = 'application'): Promise<Enrollment> {
  const extra = parseExtra(e)
  if (iso) extra[KEY[kind]] = iso
  else delete extra[KEY[kind]]
  return enrollmentsApi.update(e.id, {
    student_id: e.student_id,
    menu: e.menu,
    course_date: e.course_date,
    venue: e.venue,
    status: e.status,
    extra_json: JSON.stringify(extra),
    note: e.note,
  })
}

/** 複数の申込にまとめて設定する */
export async function setApplicationDates(list: Enrollment[], iso: string, kind: AppDateKind = 'application'): Promise<void> {
  for (const e of list) await setApplicationDate(e, iso, kind)
}

/** 'YYYY-MM-DD' → 「2026/11/16」表示用（未設定は ''） */
export function formatApplicationDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}/${m[2]}/${m[3]}` : ''
}
