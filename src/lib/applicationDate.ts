/**
 * 申請日（申請書の「申請日」「申請月日」欄に印字する日付）
 *
 * 書類を事前に作ることがあるので、印刷日ではなく申込ごとに設定した日付を使う。
 * 申込の extra_json.application_date に 'YYYY-MM-DD' で保存する（未設定なら空欄で印字）。
 */
import type { Enrollment } from '../types'
import { enrollmentsApi } from './api'

function parseExtra(e: Enrollment): Record<string, unknown> {
  try { return JSON.parse(e.extra_json) as Record<string, unknown> } catch { return {} }
}

export function getApplicationDate(e: Enrollment): string {
  const v = parseExtra(e).application_date
  return typeof v === 'string' ? v : ''
}

/** 申請日を設定する（空文字で解除）。更新後の申込を返す */
export async function setApplicationDate(e: Enrollment, iso: string): Promise<Enrollment> {
  const extra = parseExtra(e)
  if (iso) extra.application_date = iso
  else delete extra.application_date
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
export async function setApplicationDates(list: Enrollment[], iso: string): Promise<void> {
  for (const e of list) await setApplicationDate(e, iso)
}

/** 'YYYY-MM-DD' → 「2026/11/16」表示用（未設定は ''） */
export function formatApplicationDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}/${m[2]}/${m[3]}` : ''
}
