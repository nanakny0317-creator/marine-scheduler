/**
 * 国家試験の合格発表日
 *
 * 基本ルール（例外は試験日程ごとに手で変更する）：
 *   水〜日曜日の試験 → その週の日曜日の後の木曜日に発表（例：11/22(日) → 11/26(木)）
 *   月・火曜日の試験 → 翌週の月曜日に発表
 */
import type { ExamSession } from '../types'

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 試験日 'YYYY-MM-DD' → 基本ルールの合格発表日（読めなければ ''） */
export function defaultResultDate(examDate: string): string {
  const m = (examDate ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ''
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const dow = d.getDay()   // 0=日 … 6=土
  let add: number
  if (dow === 1) add = 7          // 月 → 翌週月曜
  else if (dow === 2) add = 6     // 火 → 翌週月曜
  else add = (dow === 0 ? 0 : 7 - dow) + 4   // 水〜日 → その週の日曜の4日後（木曜）
  d.setDate(d.getDate() + add)
  return iso(d)
}

/** 試験日程の合格発表日（手で決めた日があればそれ、無ければ基本ルール） */
export function resultDateOf(s: Pick<ExamSession, 'exam_date' | 'result_date'>): string {
  return s.result_date || defaultResultDate(s.exam_date)
}

/** 今日 'YYYY-MM-DD' */
export function todayIsoLocal(): string { return iso(new Date()) }

/** a から b までの日数（b − a） */
export function daysBetween(a: string, b: string): number {
  const p = (x: string) => { const [y, mo, d] = x.split('-').map(Number); return Date.UTC(y, mo - 1, d) }
  return Math.round((p(b) - p(a)) / 86400000)
}
