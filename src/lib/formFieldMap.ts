/**
 * Student / Enrollment / ExamSession → フォームフィールドキー値 Record への変換
 *
 * printForm() の第2引数 FormData として渡す。
 * フォームのキーは public/form-layouts/*.json の "key" フィールドと対応している。
 */
import type { Student, Enrollment, ExamSession } from '../types'
import { licenseSummary } from '../data/masterData'

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


// ── 住所の組み立て ─────────────────────────────────────────────
/** 申込書用：「番地-部屋番号」（部屋番号が無ければ番地のみ） */
export function joinRoom(a1: string | null | undefined, room: string | null | undefined): string {
  const b = (a1 ?? '').trim()
  const r = (room ?? '').trim()
  if (!r) return b
  return b ? `${b}-${r}` : r
}

/** 宛名ラベル用：送付先住所があれば送付先、無ければ申請住所。2行目は「建物名 部屋番号」 */
export function labelAddress(s: Student): { postal_code: string; line1: string; line2: string } {
  const useMail = [s.mail_postal_code, s.mail_prefecture, s.mail_city, s.mail_address1, s.mail_address2, s.mail_address_room]
    .some(v => v && v.trim())
  const zip  = (useMail ? s.mail_postal_code : s.postal_code) ?? ''
  const pref = (useMail ? s.mail_prefecture  : s.prefecture)  ?? ''
  const city = (useMail ? s.mail_city        : s.city)        ?? ''
  const a1   = (useMail ? s.mail_address1    : s.address1)    ?? ''
  const bld  = ((useMail ? s.mail_address2   : s.address2)    ?? '').trim()
  const room = ((useMail ? s.mail_address_room : s.address_room) ?? '').trim()
  // 建物名が無い場合は「番地-部屋番号」、ある場合は「建物名 部屋番号」を2行目に
  const line1 = pref + city + (bld ? a1 : joinRoom(a1, room))
  const line2 = bld ? [bld, room].filter(Boolean).join(' ') : ''
  return { postal_code: zip, line1, line2 }
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
  const prevRaw = (extra.prev_exam ?? {}) as Record<string, unknown>
  const prev = {
    qual:     typeof prevRaw.qual === 'string' ? prevRaw.qual : '',
    date:     typeof prevRaw.date === 'string' ? prevRaw.date : '',
    location: typeof prevRaw.location === 'string' ? prevRaw.location : '',
    number:   typeof prevRaw.number === 'string' ? prevRaw.number : '',
    examId:   typeof prevRaw.exam_id === 'string' ? prevRaw.exam_id : '',
  }
  const prevDate = parseExamDate(prev.date || null)
  const exDate = parseExamDate(examSession?.exam_date ?? (extra.exam_date as string | null) ?? null)

  // 申込書用：建物名は入れず「番地-部屋番号」
  const address = [
    student.prefecture ?? '',
    student.city       ?? '',
    joinRoom(student.address1, student.address_room),
  ].join('')
  // 宛名ラベル用：送付先があれば送付先、無ければ申請住所（建物名・部屋番号つき）
  const label = labelAddress(student)

  const appType = (extra.application_type as string) ?? enrollment.menu

  // 現有免許
  const licExp   = parseBirthDate(student.license_expiry ?? null)      // 和暦変換を流用
  const licIssue = parseBirthDate(student.license_issue_date ?? null)
  const licOpts  = (student.license_options ?? '').split(',').map(x => x.trim())
  const flag = (b: boolean) => (b ? 'true' : '')

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
    address2:    student.address2    ?? '',   // 建物名
    address_room: student.address_room ?? '',

    // ── 宛名ラベル用（送付先優先・建物名つき） ──
    label_postal_code: label.postal_code,
    label_address1:    label.line1,
    label_address2:    label.line2,

    // ── 連絡先 ──
    phone:  student.phone  ?? '',
    mobile: student.mobile ?? '',
    email:  student.email  ?? '',

    // ── 免許番号 ──
    license_number: student.license_number ?? '',
    // 帳票レイアウト（PDFから変換）側のキー名でもそのまま印字できるように
    '免許証番号':   student.license_number ?? '',
    '免許':         student.license_number ?? '',

    // ── 現有免許 ──
    current_license:           licenseSummary(student),
    license_class:             student.license_class ?? '',
    license_1kairi:            flag(licOpts.includes('限定1海里')),
    license_tokushu:           flag(licOpts.includes('特殊')),
    license_tokutei:           flag(licOpts.includes('特定')),
    license_equipment_limited: flag(!!student.license_equipment_limited),
    license_expiry:            student.license_expiry ?? '',
    license_expiry_year:       licExp.year,
    license_expiry_month:      licExp.month,
    license_expiry_day:        licExp.day,
    license_expiry_era:        licExp.era,
    license_expiry_era_year:   licExp.eraYear,
    license_issue_date:        student.license_issue_date ?? '',
    license_issue_year:        licIssue.year,
    license_issue_month:       licIssue.month,
    license_issue_day:         licIssue.day,
    license_issue_era:         licIssue.era,
    license_issue_era_year:    licIssue.eraYear,

    // ── 本籍・国籍 ──
    domicile_pref: student.domicile    || (extra.domicile as string)    || '',
    nationality:   student.nationality || (extra.nationality as string) || '',

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
    // 受験する試験（未設定の古い申込は両方受験）
    written_exam:       extra.exam_gakka   === false ? '' : '受験',
    practical_exam:     extra.exam_jitsugi === false ? '' : '受験',
    // 身体検査証明書（申請書③欄）：有効な証明書あり→あり／受検が必要→なし
    physical_exam_cert: extra.shintai === 'have' ? 'あり' : extra.shintai === 'need' ? 'なし' : '',
    // 免除の根拠：過去に合格した試験（申請書②欄）
    prev_exam_qual_type: prev.qual,
    prev_exam_date:      prev.date,
    prev_exam_year:      prevDate.year,
    prev_exam_month:     prevDate.month,
    prev_exam_day:       prevDate.day,
    prev_exam_location:  prev.location,
    prev_exam_number:    prev.number,
    prev_exam_id:        prev.examId,

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
