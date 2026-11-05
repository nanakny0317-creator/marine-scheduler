/**
 * Student / Enrollment / ExamSession → フォームフィールドキー値 Record への変換
 *
 * printForm() の第2引数 FormData として渡す。
 * フォームのキーは public/form-layouts/*.json の "key" フィールドと対応している。
 */
import type { Student, Enrollment, ExamSession } from '../types'

export type FormData = Record<string, string>

// ── 生年月日パース ───────────────────────────────────────────────
function parseBirthDate(bd: string | null): {
  year: string; month: string; day: string; era: string; eraYear: string
} {
  const empty = { year: '', month: '', day: '', era: '', eraYear: '' }
  if (!bd) return empty
  const m = bd.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return empty
  const y = parseInt(m[1]), mo = m[2], d = m[3]
  let era = '', eraYear = ''
  if (y >= 2019) { era = '令和'; eraYear = String(y - 2018) }
  else if (y >= 1989) { era = '平成'; eraYear = String(y - 1988) }
  else if (y >= 1926) { era = '昭和'; eraYear = String(y - 1925) }
  else if (y >= 1912) { era = '大正'; eraYear = String(y - 1911) }
  else                { era = '明治'; eraYear = String(y - 1867) }
  return { year: String(y), month: mo, day: d, era, eraYear }
}

// ── 試験日パース ─────────────────────────────────────────────────
function parseExamDate(d: string | null): { year: string; month: string; day: string } {
  if (!d) return { year: '', month: '', day: '' }
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return { year: '', month: '', day: '' }
  return { year: m[1], month: m[2], day: m[3] }
}

// ── extra_json から安全に取得 ────────────────────────────────────
function getExtra(enrollment: Enrollment): Record<string, unknown> {
  try { return JSON.parse(enrollment.extra_json) as Record<string, unknown> }
  catch { return {} }
}

// ── メイン変換関数 ───────────────────────────────────────────────
/**
 * 申請書印刷用のフィールドマップを生成する。
 *
 * @param student    受講者情報
 * @param enrollment 申込情報
 * @param examSession 試験日程（任意）
 */
export function buildFormData(
  student: Student,
  enrollment: Enrollment,
  examSession?: ExamSession | null,
): FormData {
  const extra  = getExtra(enrollment)
  const bd     = parseBirthDate(student.birth_date)
  const exDate = parseExamDate(examSession?.exam_date ?? (extra.exam_date as string | null) ?? null)

  const address = [
    student.prefecture ?? '',
    student.city       ?? '',
    student.address1   ?? '',
  ].join('')

  const appType = (extra.application_type as string) ?? enrollment.menu

  return {
    // ── 氏名 ──
    last_name:    student.last_name  ?? '',
    first_name:   student.first_name ?? '',
    last_kana:    student.last_kana  ?? '',
    first_kana:   student.first_kana ?? '',

    // ── 生年月日 ──
    birth_date:       student.birth_date ?? '',
    birth_year:       bd.year,
    birth_month:      bd.month,
    birth_day:        bd.day,
    birth_era:        bd.era,
    birth_era_year:   bd.eraYear,

    // ── 性別 ──
    gender: student.gender ?? '',

    // ── 住所 ──
    postal_code: student.postal_code ?? '',
    address1:    address,
    address2:    student.address2    ?? '',

    // ── 連絡先 ──
    phone:  student.phone  ?? '',
    mobile: student.mobile ?? '',
    email:  student.email  ?? '',

    // ── 免許番号 ──
    license_number: student.license_number ?? '',

    // ── 本籍・国籍 ──
    domicile_pref: (extra.domicile as string) ?? '',
    nationality:   (extra.nationality as string) ?? '',

    // ── 申込種別 ──
    application_type: appType,
    menu:             enrollment.menu ?? '',

    // ── 試験情報 ──
    exam_date:          examSession?.exam_date      ?? (extra.exam_date as string) ?? '',
    exam_date_year:     exDate.year,
    exam_date_month:    exDate.month,
    exam_date_day:      exDate.day,
    exam_location:      examSession?.exam_location  ?? (extra.exam_location as string) ?? enrollment.venue ?? '',
    exam_id:            examSession?.exam_id        ?? (extra.exam_id as string)       ?? '',
    exam_qual_type:     examSession?.qualification_type ?? (extra.exam_qual_type as string) ?? '',

    // ── mark 型対応（条件チェック） ──
    // 性別チェック
    gender_male:   student.gender === 'male'   ? '●' : '',
    gender_female: student.gender === 'female' ? '●' : '',

    // 申込種別チェック
    app_new:     appType === 'new'     ? '●' : '',
    app_renewal: appType === 'renewal' ? '●' : '',
    app_lapsed:  appType === 'lapsed'  ? '●' : '',
  }
}
