/**
 * 免除（学科のみ／実技のみの受験）の根拠になる「過去に合格した試験」（申請書②欄）
 * 本人が覚えていないことが多く、試験機関に問い合わせてから後で入力するため、
 * 申込時点では必須にしない。その代わり、未入力の項目を各画面で目立たせる。
 */
import type { Enrollment } from '../types'

export const PREV_EXAM_FIELDS = [
  { key: 'qual',     label: '資格' },
  { key: 'date',     label: '試験開始日' },
  { key: 'location', label: '試験地' },
  { key: 'number',   label: '受験番号' },
  { key: 'exam_id',  label: '試験ID' },
] as const

function parseExtra(e: Enrollment | Record<string, unknown>): Record<string, unknown> {
  if ('extra_json' in e && typeof e.extra_json === 'string') {
    try { return JSON.parse(e.extra_json) as Record<string, unknown> } catch { return {} }
  }
  return e as Record<string, unknown>
}

/** 免除する科目（学科のみ受験なら「実技」）。両方受験・試験申請以外は null */
export function exemptSubjectOf(e: Enrollment | Record<string, unknown>): '学科' | '実技' | null {
  const x = parseExtra(e)
  if ((x.application_type ?? 'new') !== 'new') return null
  if (x.exam_gakka === false) return '学科'
  if (x.exam_jitsugi === false) return '実技'
  return null
}

/** 過去合格歴のうち未入力の項目名（免除が無い申込は空配列） */
export function missingPrevExam(e: Enrollment | Record<string, unknown>): string[] {
  if (!exemptSubjectOf(e)) return []
  const prev = (parseExtra(e).prev_exam ?? {}) as Record<string, unknown>
  return PREV_EXAM_FIELDS
    .filter(f => !(typeof prev[f.key] === 'string' && (prev[f.key] as string).trim()))
    .map(f => f.label)
}
