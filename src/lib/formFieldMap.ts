/**
 * Student / Enrollment / ExamSession → フォームフィールドキー値 Record への変換
 *
 * printForm() の第2引数 FormData として渡す。
 * フォームのキーは public/form-layouts/*.json の "key" フィールドと対応している。
 */
import type { Student, Enrollment, ExamSession, Venue } from '../types'
import { readCorrectionItems, readLicenseDiff, readReissueReasons, readTeiseiItems } from './correctionItems'
import { MARINE_LICENSE_VALUES, PREFECTURES, courseOrgCode2, licenseSummary, nationalityCode, readMarineLicenses } from '../data/masterData'
import { examLocationForForm } from './examLocation'
import { birthDateModeFor, type BirthDateStyle } from './birthDateStyle'

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

// ── 氏名（OCR欄の書き方） ─────────────────────────────────────────
// 申請書の記入要領：
//  ・氏と名は1マスあける
//  ・全てカタカナの大文字で記入し、小文字にあたる文字は直上の小文字区分欄に×
//  ・濁点、半濁点は1マスに記入（例：ジュン → シ゛ユン、ユの上に×）
const SMALL_TO_LARGE: Record<string, string> = {
  'ァ': 'ア', 'ィ': 'イ', 'ゥ': 'ウ', 'ェ': 'エ', 'ォ': 'オ',
  'ッ': 'ツ', 'ャ': 'ヤ', 'ュ': 'ユ', 'ョ': 'ヨ', 'ヮ': 'ワ',
  'ヵ': 'カ', 'ヶ': 'ケ',
}

/** カナ1語をOCR欄の並び（マスごとの文字と、小文字区分の×）に変換する */
function kanaCells(s: string): { kana: string[]; small: string[] } {
  const kana: string[] = [], small: string[] = []
  // 半角カナ→全角、ひらがな→カタカナ、濁点・半濁点を分解
  const norm = s.normalize('NFKC')
    .replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .normalize('NFD')
  for (const ch of norm.trim()) {
    // 単語の間（ミドルネームなど）は1マスあける。続けて空白があっても1マス
    if (/\s/.test(ch)) { if (kana.length && kana[kana.length - 1] !== ' ') { kana.push(' '); small.push(' ') } continue }
    if (ch === '゙' || ch === '゛') { kana.push('゛'); small.push(' '); continue }
    if (ch === '゚' || ch === '゜') { kana.push('゜'); small.push(' '); continue }
    const large = SMALL_TO_LARGE[ch]
    kana.push(large ?? ch)
    small.push(large ? '×' : ' ')
  }
  return { kana, small }
}

/** 姓・名カナ → { kana: OCR欄のカナ, small: 小文字区分（×の位置） }。姓と名の間は1マスあける */
export function ocrKanaName(lastKana: string | null | undefined, firstKana: string | null | undefined): { kana: string; small: string } {
  const a = kanaCells(lastKana ?? '')
  const b = kanaCells(firstKana ?? '')
  const sep = a.kana.length && b.kana.length ? [' '] : []
  const kana  = [...a.kana,  ...sep, ...b.kana].join('')
  const small = [...a.small, ...sep, ...b.small].join('')
  return { kana, small: small.includes('×') ? small : '' }
}

/**
 * 姓・名（漢字） → 「姓 名」（1マスあける）。
 * 外国籍の方は書類の順に入力するので、欄の中の空白（ミドルネームなど）も1マスとして残す。
 * アルファベットは半角の大文字にする（申請書は大文字で記入）
 */
export function ocrKanjiName(last: string | null | undefined, first: string | null | undefined): string {
  return [last ?? '', first ?? '']
    .map(x => x.replace(/[Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).toUpperCase().trim().replace(/\s+/g, ' '))
    .filter(Boolean).join(' ')
}

/** 氏名のOCR欄のマス数（カナ22・漢字12）。入りきらない分は氏名欄の下に続けて印字する */
export const NAME_KANA_CELLS = 22
export const NAME_KANJI_CELLS = 12

// ── OCR欄のチェック（×）・文字マス用の小物 ───────────────────────────
const X = (b: boolean) => (b ? '×' : '')

/** 「京都府」→「京都」、「北海道」→「北海」（OCR欄は後ろに「都道府県」が印刷済み） */
export function prefStem(pref: string | null | undefined): string {
  const p = (pref ?? '').trim()
  if (!p) return ''
  if (p === '北海道') return '北海'
  return p.replace(/[都府県]$/, '')
}

/** 資格の表記（'１級特殊'・'2級' など）→ 申請書の「受験する試験」のどれに当たるか */
function examClassOf(qual: string): { c1: boolean; c2: boolean; kokawa: boolean; jakunen: boolean; tokushu: boolean } {
  const q = qual.normalize('NFKC')
  const jakunen = /若年/.test(q)
  return {
    c1: /1級|一級/.test(q),
    c2: /2級|二級/.test(q) && !jakunen,
    kokawa: /湖川/.test(q),
    jakunen,
    // 「1級特殊」などの組み合わせは①に1級・②（同時申請）に特殊なので、特殊単独のときだけ
    tokushu: q === '特殊',
  }
}

// ── 試験日パース ─────────────────────────────────────────────────
function parseExamDate(d: string | null): { year: string; month: string; day: string; eraYear: string } {
  const empty = { year: '', month: '', day: '', eraYear: '' }
  if (!d) return empty
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return empty
  // 試験日はこれから（令和）なので、令和の年
  const y = Number(m[1])
  return { year: m[1], month: m[2], day: m[3], eraYear: y >= 2019 ? String(y - 2018) : '' }
}

// ── 更新講習：講習実施日（和暦・申請書は年2桁） ───────────────────────
function parseCourseDate(d: string | null): { eraYear: string; month: string; day: string } {
  const m = (d ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return { eraYear: '', month: '', day: '' }
  const y = parseInt(m[1])
  const ey = y >= 2019 ? y - 2018 : y >= 1989 ? y - 1988 : y - 1925
  return { eraYear: String(ey).padStart(2, '0'), month: m[2], day: m[3] }
}

/** 講習地（会場名）→ 都道府県コード（JIS 2桁）。会場マスターの都道府県から引く */
function coursePrefCode(venueName: string, venues: Venue[]): string {
  const pref = venues.find(v => v.name === venueName)?.prefecture
    // 会場マスターにない場合は名称の先頭の都道府県名で判定（例：「大阪府大阪市」）
    ?? PREFECTURES.find(p => venueName.startsWith(p))
  const i = pref ? PREFECTURES.indexOf(pref) : -1
  return i >= 0 ? String(i + 1).padStart(2, '0') : ''
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
 * @param venues      会場マスター（任意。更新講習の講習実施都道府県コードに使う）
 * @param joint       同時申請で後に受験する試験の申込（任意。試験申請書の②欄に印字）
 * @param birthStyle  生年月日を和暦・西暦のどちらで書くか（任意。既定は日本国籍＝和暦、外国籍＝西暦）
 */
export function buildFormData(
  student: Student,
  enrollment: Enrollment,
  examSession?: ExamSession | null,
  venues: Venue[] = [],
  joint: Enrollment | null = null,
  birthStyle?: BirthDateStyle,
): FormData {
  const extra  = getExtra(enrollment)
  const jx     = joint ? getExtra(joint) : null
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
  const kana = ocrKanaName(student.last_kana, student.first_kana)

  // OCR欄用の住所：都道府県は別欄なので、市区町村から（建物名は入れず「番地-部屋番号」）
  const addrBody = [student.city ?? '', joinRoom(student.address1, student.address_room)].join('').replace(/\s/g, '')
  const postalDigits = (student.postal_code ?? '').normalize('NFKC').replace(/\D/g, '')
  const licenseDigits = (student.license_number ?? '').normalize('NFKC').replace(/[^0-9A-Za-z]/g, '')
  const domicile = student.domicile || (extra.domicile as string) || ''
  const nationality = student.nationality || (extra.nationality as string) || ''
  const seireki = birthDateModeFor(nationality, birthStyle) === 'seireki'
  const natCode = nationality && !['日本', '韓国', '朝鮮', '米国'].includes(nationality)
    ? String(nationalityCode(nationality) ?? '') : ''
  const domicileIdx = PREFECTURES.findIndex(p => domicile && (domicile === p || prefStem(domicile) === prefStem(p)))
  const examQual = examSession?.qualification_type ?? (extra.exam_qual_type as string) ?? ''
  const ex  = examClassOf(examQual)
  // 試験申請書②欄：同時申請（後に受験する試験）だけ。免除の根拠（過去に合格した試験）は
  // OCR申請書には印字せず、試験申請者名簿に記入する
  const exam2 = jx
    ? { qual: String(jx.exam_qual_type ?? ''), date: String(jx.exam_date ?? ''), location: String(jx.exam_location ?? ''), number: '' }
    : { qual: '', date: '', location: '', number: '' }
  const pex = examClassOf(exam2.qual)
  const exam2Date = parseExamDate(exam2.date || null)
  // 旧免許（旧一級〜旧五級・旧湖川）は今の種類への読み替えが要るので、ここでは印字しない
  const licClass = student.license_class ?? ''

  // 現有免許
  const licExp   = parseBirthDate(student.license_expiry ?? null)      // 和暦変換を流用
  const licIssue = parseBirthDate(student.license_issue_date ?? null)
  const licOpts  = (student.license_options ?? '').split(',').map(x => x.trim())
  const marine   = readMarineLicenses(student.marine_licenses)
  const flag = (b: boolean) => (b ? 'true' : '')

  // 更新講習（更新申請書 ⑫〜⑮・⑰）
  const courseVenue = (typeof extra.course_location === 'string' ? extra.course_location : enrollment.venue) ?? ''
  const courseDate  = parseCourseDate(enrollment.course_date)
  // 申請日：申込ごとに設定した日付（未設定は空欄）。年は和暦
  const appDateIso = typeof extra.application_date === 'string' ? extra.application_date
    : typeof jx?.application_date === 'string' ? jx.application_date : null
  const appDate = parseBirthDate(appDateIso)
  // 免許証返納 有／無：申込で選んだもの。選ぶ欄のない申請（免許申請など）は、免許証を持っているか（免許番号があるか）で決める
  const licReturn   = extra.license_return === 'yes' || extra.license_return === 'no' ? extra.license_return
    : appType === 'renewal' || appType === 'lapsed' || appType === 'correction' ? ''
    : licenseDigits ? 'yes' : 'no'
  // 訂正（同時申請）：変更のある項目。訂正なしなら何も印字しない
  const changes = extra.correction === 'yes' ? readCorrectionItems(extra.correction_items) : []
  // 訂正申請書①（訂正だけの人）
  const teisei = readTeiseiItems(extra.teisei_items)
  // 失効再交付申請書①再交付の事由（失効再交付の申込だけ。未設定は期限切）
  const reissue = appType === 'lapsed' ? readReissueReasons(extra.reissue_reasons) : []
  // 試験申請書⑩：現有免許証の氏名・本籍国籍が今と違う（同時申請はどちらかに入っていれば）
  const licDiff = appType === 'new' ? [...new Set([...readLicenseDiff(extra.license_diff), ...readLicenseDiff(jx?.license_diff)])] : []

  return {
    // ── 氏名 ──
    last_name:    student.last_name  ?? '',
    first_name:   student.first_name ?? '',
    last_kana:    student.last_kana  ?? '',
    first_kana:   student.first_kana ?? '',
    // OCR欄用：姓と名の間を1マスあけた氏名・カナ、小文字区分
    full_name:       ocrKanjiName(student.last_name, student.first_name),
    full_kana:       kana.kana,
    full_kana_small: kana.small,
    // 帳票レイアウト（PDFから変換）側のキー名
    'カナ':   kana.kana,
    '小文字': kana.small,

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
    // 試験申請書の試験開始日は令和の年2桁（旧うーみーくんと同じ。例：2026年 → 08）
    exam_date_year:     exDate.eraYear ? exDate.eraYear.padStart(2, '0') : '',
    exam_date_month:    exDate.month,
    exam_date_day:      exDate.day,
    exam_location:      examLocationForForm(examSession?.exam_location  ?? (extra.exam_location as string) ?? enrollment.venue ?? ''),
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

    // ── 更新講習（更新申請書） ──
    course_org_code:       typeof extra.course_org_code === 'number' ? courseOrgCode2(extra.course_org_code) : '',
    course_pref_code:      courseVenue ? coursePrefCode(courseVenue, venues) : '',
    course_date_era_year:  courseDate.eraYear,
    course_date_month:     courseDate.month,
    course_date_day:       courseDate.day,
    bureau_code:           typeof extra.bureau_code === 'string' ? extra.bureau_code : '',
    branch_code:           typeof extra.branch_code === 'string' ? extra.branch_code : '',
    license_return:        licReturn,
    license_return_yes:    licReturn === 'yes' ? '×' : '',
    license_return_no:     licReturn === 'no'  ? '×' : '',
    // 「変更」欄（更新・失効再交付申請書の氏名・住所・本籍・国籍の下）
    change_name:           changes.includes('name')        ? '×' : '',
    change_address:        changes.includes('address')     ? '×' : '',
    change_domicile:       changes.includes('domicile')    ? '×' : '',
    change_nationality:    changes.includes('nationality') ? '×' : '',
    // 訂正申請書①訂正項目
    teisei_name:           teisei.includes('name')     ? '×' : '',
    teisei_birth:          teisei.includes('birth')    ? '×' : '',
    teisei_domicile:       teisei.includes('domicile') ? '×' : '',
    teisei_address:        teisei.includes('address')  ? '×' : '',
    teisei_other:          teisei.includes('other')    ? '×' : '',
    // 講習要件（⑪ 一号乗船履歴／二号特別／三号講習）：更新講習の受講者は三号
    training_req_1:        '',
    training_req_2:        '',
    training_req_3:        appType === 'renewal' ? '×' : '',

    // ── 申請日（申請書の申請日・申請月日） ──
    app_date_era_year: appDate.eraYear ? appDate.eraYear.padStart(2, '0') : '',   // 令和の年2桁（例：08）
    app_date_month:    appDate.month,
    app_date_day:      appDate.day,

    // ── OCR欄（文字マス）用 ──
    postal_digits:     postalDigits,              // 上3桁は1文字目から、下4桁は4文字目から
    address_body:      addrBody,                  // 都道府県の後ろから。2行目以降は「何文字目から」でつなぐ
    address_pref_stem: prefStem(student.prefecture),
    domicile_stem:     prefStem(domicile),
    nationality_code:  natCode,                   // 韓国・朝鮮・米国以外の国籍のコード番号
    license_digits:    licenseDigits,
    phone_any:         student.phone || student.mobile || '',
    // 年の欄：和暦なら元号の年、西暦なら西暦の下2桁
    birth_era_year2:   seireki ? bd.year.slice(2) : bd.eraYear ? bd.eraYear.padStart(2, '0') : '',
    birth_year_1:      bd.year.slice(0, 1),       // 西暦の千の位
    birth_year_2:      bd.year.slice(1, 2),       // 西暦の百の位
    birth_year_last2:  bd.year.slice(2),          // 西暦の下2桁

    // ── チェック欄（×） ──
    // 生年月日の元号（和暦のとき）／西暦の1900・2000（西暦のとき）
    birth_era_heisei: X(!seireki && bd.era === '平成'),
    birth_era_showa:  X(!seireki && bd.era === '昭和'),
    birth_era_taisho: X(!seireki && bd.era === '大正'),
    birth_era_meiji:  X(!seireki && bd.era === '明治'),
    birth_century_1900: X(seireki && bd.year.startsWith('19')),
    birth_century_2000: X(seireki && bd.year.startsWith('20')),
    // 国籍
    nat_kankoku: X(nationality === '韓国'),
    nat_chosen:  X(nationality === '朝鮮'),
    nat_beikoku: X(nationality === '米国'),
    // 本籍（都道府県ごとの枠）：domicile_mark_01（北海道）〜 domicile_mark_47（沖縄県）
    ...Object.fromEntries(PREFECTURES.map((_, i) =>
      [`domicile_mark_${String(i + 1).padStart(2, '0')}`, X(i === domicileIdx)])),
    // 受験する試験（試験申請書①）
    exam_class_1:       X(ex.c1),
    exam_class_2:       X(ex.c2),
    exam_class_kokawa:  X(ex.kokawa),
    exam_class_jakunen: X(ex.jakunen),
    exam_class_tokushu: X(ex.tokushu),
    // 試験申請書②：同時申請（後に受験する試験）
    exam2_class_1:       X(pex.c1),
    exam2_class_2:       X(pex.c2),
    exam2_class_kokawa:  X(pex.kokawa),
    exam2_class_jakunen: X(pex.jakunen),
    exam2_class_tokushu: X(pex.tokushu),
    exam2_year:          exam2Date.eraYear ? exam2Date.eraYear.padStart(2, '0') : '',   // 令和の年2桁
    exam2_month:         exam2Date.month,
    exam2_day:           exam2Date.day,
    exam2_location:      examLocationForForm(exam2.location),
    exam2_number:        exam2.number,
    // 受験内容（試験申請書③）：同時申請はどちらかで受けるものに×
    shintai_none:  X(extra.shintai === 'need' || jx?.shintai === 'need'),
    shintai_have:  X(extra.shintai === 'have' && (!jx || jx.shintai !== 'need')),
    exam_gakka_x:  X(extra.exam_gakka !== false || (!!jx && jx.exam_gakka !== false)),
    exam_jitsugi_x: X(extra.exam_jitsugi !== false || (!!jx && jx.exam_jitsugi !== false)),
    // 現有免許の種類（更新・失効再交付①②）
    lic_class_1:      X(licClass === '一級'),
    lic_class_2:      X(licClass === '二級'),
    lic_class_kokawa: X(licClass === '湖川'),
    lic_class_tokushu: X(licOpts.includes('特殊')),
    // 現有の海技免許：免許申請書⑫（key は「航海一級」「機関二級内」など、保存値と同じ）
    ...Object.fromEntries(MARINE_LICENSE_VALUES.map(v => [v, X(marine.includes(v))])),
    // 試験申請書⑪：航海・機関の免許を持っているか
    '航海有': X(marine.some(v => v.startsWith('航海'))),
    '機関有': X(marine.some(v => v.startsWith('機関'))),
    // 試験申請書⑩ 現有免許証の確認事項
    license_diff_name:     X(licDiff.includes('name')),
    license_diff_domicile: X(licDiff.includes('domicile')),
    // 再交付の事由（失効再交付①）
    reissue_expired: X(reissue.includes('expired')),
    reissue_washed:  X(reissue.includes('washed')),
    reissue_burned:  X(reissue.includes('burned')),
    reissue_lost:    X(reissue.includes('lost')),
    reissue_stolen:  X(reissue.includes('stolen')),
    reissue_damaged: X(reissue.includes('damaged')),

    // ── mark 型対応（条件チェック） ──
    // 性別チェック
    gender_male:   student.gender === 'male'   ? '×' : '',
    gender_female: student.gender === 'female' ? '×' : '',

    // 申込種別チェック
    app_new:     appType === 'new'     ? '×' : '',
    app_renewal: appType === 'renewal' ? '×' : '',
    app_lapsed:  appType === 'lapsed'  ? '×' : '',
  }
}
