/**
 * 有効期限の計算
 *   - 学科・実技の合格：合格から2年
 *   - 身体検査：受検日から1年
 * 期限日は「N年後の前日」まで有効（例：2025/07/01 受検 → 2026/06/30 まで）
 */
export const PASS_VALID_YEARS = 2
export const PHYSICAL_VALID_YEARS = 1

const pad = (n: number) => String(n).padStart(2, '0')

/** 'YYYY-MM-DD' の N 年後の前日（'YYYY-MM-DD'）。読めなければ '' */
export function expiryAfterYears(iso: string | null | undefined, years: number): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ''
  const d = new Date(Number(m[1]) + years, Number(m[2]) - 1, Number(m[3]))
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayIso(): string {
  const t = new Date()
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`
}

/** 期限日 until が基準日 on（省略時は今日）まで有効か */
export function isValidOn(until: string | null | undefined, on?: string | null): boolean {
  if (!until) return false
  return until >= (on || todayIso())
}

/** 状態：有効／まもなく期限（90日以内）／期限切れ */
export function validityStatus(until: string | null | undefined, on?: string | null): 'valid' | 'soon' | 'expired' | 'unknown' {
  if (!until) return 'unknown'
  const base = on || todayIso()
  if (until < base) return 'expired'
  const soon = new Date(base)
  soon.setDate(soon.getDate() + 90)
  const soonIso = `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}`
  return until <= soonIso ? 'soon' : 'valid'
}

/** 'YYYY-MM-DD' → 'YYYY/M/D' */
export function fmtYmd(iso: string | null | undefined): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}/${Number(m[2])}/${Number(m[3])}` : ''
}
