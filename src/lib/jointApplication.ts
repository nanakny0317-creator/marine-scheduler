/**
 * 試験の同時申請
 *
 * 2つの試験（例：特殊と2級）を1枚の試験申請書で申請するときは、2つの申込を互いに結びつける。
 * 申請書では試験日が早い方を①、後の方を②（同時申請）に印字する。
 * 別々に申し込む場合は結びつけない（それぞれ①だけの申請書になる）。
 *
 * 申込の extra_json.joint_enrollment_id に相手の申込IDを持たせる（両方向に保存する）。
 */
import type { Enrollment } from '../types'
import { enrollmentsApi } from './api'

function parseExtra(e: Enrollment): Record<string, unknown> {
  try { return JSON.parse(e.extra_json) as Record<string, unknown> } catch { return {} }
}

export function jointIdOf(e: Enrollment): number | null {
  const v = parseExtra(e).joint_enrollment_id
  return typeof v === 'number' ? v : null
}

export function examDateOf(e: Enrollment): string {
  const v = parseExtra(e).exam_date
  return typeof v === 'string' ? v : ''
}

export function isExamEnrollment(e: Enrollment): boolean {
  return (parseExtra(e).application_type ?? 'new') === 'new'
}

/** 同時申請の相手（相手側だけにリンクが残っている場合も拾う） */
export function findJointPartner(e: Enrollment, siblings: Enrollment[]): Enrollment | null {
  const id = jointIdOf(e)
  const others = siblings.filter(x => x.id !== e.id && isExamEnrollment(x))
  return (id != null ? others.find(x => x.id === id) : undefined)
    ?? others.find(x => jointIdOf(x) === e.id)
    ?? null
}

/** 試験日が早い方を①、後の方を②に並べる（日付が無い方は後ろ） */
export function orderJoint(a: Enrollment, b: Enrollment): [Enrollment, Enrollment] {
  const da = examDateOf(a) || '9999', db = examDateOf(b) || '9999'
  return da <= db ? [a, b] : [b, a]
}

async function writeJoint(e: Enrollment, partnerId: number | null): Promise<void> {
  const extra = parseExtra(e)
  if ((typeof extra.joint_enrollment_id === 'number' ? extra.joint_enrollment_id : null) === partnerId) return
  if (partnerId != null) extra.joint_enrollment_id = partnerId
  else delete extra.joint_enrollment_id
  await enrollmentsApi.update(e.id, {
    student_id: e.student_id, menu: e.menu, course_date: e.course_date, venue: e.venue,
    status: e.status, extra_json: JSON.stringify(extra), note: e.note,
  })
}

/**
 * 申込を保存した後に、相手側のリンクを合わせる。
 * - 新しい相手には、この申込へのリンクを付ける（相手が別の申込と結ばれていたら、その申込のリンクは外す）
 * - 以前の相手で、今回外したものはリンクを外す
 */
export async function syncJointLinks(saved: Enrollment): Promise<void> {
  const siblings = await enrollmentsApi.list(saved.student_id)
  const partnerId = isExamEnrollment(saved) ? jointIdOf(saved) : null
  for (const x of siblings) {
    if (x.id === saved.id) continue
    if (x.id === partnerId) {
      const old = jointIdOf(x)
      if (old != null && old !== saved.id) {
        const third = siblings.find(y => y.id === old)
        if (third && jointIdOf(third) === x.id) await writeJoint(third, null)
      }
      await writeJoint(x, saved.id)
    } else if (jointIdOf(x) === saved.id) {
      await writeJoint(x, null)
    }
  }
}
