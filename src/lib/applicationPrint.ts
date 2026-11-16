/**
 * 申請書（OCR）の印刷：1人でも複数人でも同じ処理で、1つのPDFにまとめる
 *
 * - 申込種別ごとに書式を選ぶ（試験＝試験申請書、更新＝更新申請書、失効＝再交付申請書）
 * - 試験の同時申請は、試験日が早い方を①、後の方を②にして1枚にする（2人分としては数えない）
 */
import type { Enrollment, Student } from '../types'
import { enrollmentsApi, venuesApi } from './api'
import { buildFormData } from './formFieldMap'
import { printForms, type FieldDef, type FormPrintJob } from './formPrint'
import { findJointPartner, orderJoint } from './jointApplication'

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
  const layouts = new Map<string, FieldDef[]>()
  const loadLayout = async (url: string) => {
    if (!layouts.has(url)) layouts.set(url, await (await fetch(url)).json() as FieldDef[])
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
    jobs.push({ fields: await loadLayout(def.layout), data: buildFormData(student, first, null, venues, second), pageCount: def.pageCount })
  }

  if (jobs.length === 0) return 0
  const t = title ?? (targets.length === 1 ? PRINT_FORM_MAP[appTypeOf(targets[0].enrollment)]?.title ?? '申請書' : '申請書')
  await printForms(jobs, t)
  return jobs.length
}
