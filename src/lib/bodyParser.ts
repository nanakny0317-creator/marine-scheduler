/**
 * メールワイズ 本文テキスト解析エンジン
 *
 * フォーマット例:
 *   メニュー：アップグレードメニュー大阪茨木-
 *   日程：9月21日講習/27日大阪試験
 *   ルビを希望しない
 *   差出人：大上良平
 *   ふりがな：おおうえりょうへい
 *   〒639-3806
 *   住所1：奈良県吉野郡下北山村下池原438
 *   ...
 */
import type { ApplicationType, ParsedBody } from '../types'

// ====== 申込種別判定 ======

/** 本文から申込種別を判定する */
function detectApplicationType(body: string): ApplicationType {
  if (/失効再交付/.test(body)) return 'lapsed'
  if (/更新講習/.test(body)) return 'renewal'
  return 'new'
}

/** 全角数字→半角数字に変換 */
function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
}

/** 「4月15日」「４月１５日（水）」→「YYYY-MM-DD」 */
function parseMonthDay(text: string, year = new Date().getFullYear()): string | null {
  const normalized = toHalfWidth(text).replace(/[（(][^）)]*[）)]/g, '')
  const m = normalized.match(/(\d{1,2})月\s*(\d{1,2})日/)
  if (!m) return null
  return `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
}

// ====== 日付パーサ群 ======

/** 「1978年3月18日」→「1978-03-18」 */
function parseJapaneseDate(text: string): string | null {
  const m = text.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/)
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

/**
 * 日程フィールドを講習日・試験日・会場に分解
 *
 * 例1: "9月21日講習/27日大阪試験"
 * 例2: "10月5日(日)大阪試験"
 * 例3: "9月21日大阪講習"
 */
function parseCourseSchedule(
  text: string,
  currentYear = new Date().getFullYear()
): { course_date: string | null; exam_date: string | null; venue: string | null; raw_schedule: string } {
  const result = { course_date: null as string | null, exam_date: null as string | null, venue: null as string | null, raw_schedule: text }

  // スラッシュで分割して複数日程を処理
  const parts = text.split('/')

  for (const part of parts) {
    const trimmed = part.trim()

    // 月を取得（前のパートから引き継ぐ）
    const fullDateM = trimmed.match(/(\d{1,2})月\s*(\d{1,2})日/)
    const dayOnlyM = trimmed.match(/^(\d{1,2})日/)

    let month = 0, day = 0
    if (fullDateM) {
      month = parseInt(fullDateM[1])
      day = parseInt(fullDateM[2])
    } else if (dayOnlyM) {
      // 月が省略されている場合は前のパートの月を引き継ぐ想定
      // 簡易対応: 直近の月を探す
      const prevMonth = text.match(/(\d{1,2})月/)
      month = prevMonth ? parseInt(prevMonth[1]) : new Date().getMonth() + 1
      day = parseInt(dayOnlyM[1])
    }

    if (!month || !day) continue

    const dateStr = `${currentYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

    // 会場キーワード
    const venueM = trimmed.match(/([^\d（(）)日月講習試験]+)(講習|試験)/)
    const venue = venueM ? venueM[1].replace(/[()（）\[\]]/g, '').trim() : null

    if (/講習/.test(trimmed)) {
      result.course_date = dateStr
      if (venue) result.venue = venue
    } else if (/試験/.test(trimmed)) {
      result.exam_date = dateStr
      if (venue && !result.venue) result.venue = venue
    } else {
      // 区別できない場合は講習日として格納
      if (!result.course_date) result.course_date = dateStr
    }
  }

  return result
}

// ====== 氏名スプリッター ======

/**
 * 漢字氏名とひらがなを受け取り姓・名に分割する
 *
 * 優先順位:
 *   1. スペース（半角/全角）で分割できる → そのまま使用
 *   2. ひらがなの自然な境界（小さい仮名・っ等を後に引き寄せる）で比率分割
 *   3. フォールバック: 漢字2文字を姓、残りを名
 */
function splitNameAndKana(
  fullName: string,
  fullKana: string
): { lastName: string; firstName: string; lastKana: string; firstKana: string } {
  // 1. スペース分割
  const spaceRegex = /[\s　]+/
  if (spaceRegex.test(fullName)) {
    const [ln, ...fnParts] = fullName.split(spaceRegex)
    const fn = fnParts.join('')
    if (spaceRegex.test(fullKana)) {
      const [lk, ...fkParts] = fullKana.split(spaceRegex)
      return { lastName: ln, firstName: fn, lastKana: lk, firstKana: fkParts.join('') }
    }
    // 名前はスペースあり、かなはスペースなし → 文字数比率でかなを分割
    const ratio = ln.length / fullName.replace(spaceRegex, '').length
    const kanaLen = Math.round(fullKana.length * ratio)
    return {
      lastName: ln,
      firstName: fn,
      lastKana: fullKana.slice(0, kanaLen),
      firstKana: fullKana.slice(kanaLen),
    }
  }

  // 2. スペースなし → 漢字長で推定
  const nameLen = fullName.length
  let lastLen: number
  if (nameLen <= 2) lastLen = 1
  else if (nameLen === 3) lastLen = 1  // 1+2が多い (田中花 → 田|中花 は変なので…)
  else lastLen = 2                      // 4文字以上は 2+N

  // 苗字が2文字以上で典型的な3文字名のケア（例: 山田一郎 → 山田|一郎）
  const lastName = fullName.slice(0, lastLen)
  const firstName = fullName.slice(lastLen)

  // かなを文字数比率で分割
  if (!fullKana) {
    return { lastName, firstName, lastKana: '', firstKana: '' }
  }
  const ratio = lastLen / nameLen
  const kanaLen = Math.max(1, Math.round(fullKana.length * ratio))
  const lastKana = fullKana.slice(0, kanaLen)
  const firstKana = fullKana.slice(kanaLen)

  return { lastName, firstName, lastKana, firstKana }
}

// ====== メイン解析関数 ======

export function parseMailwiseBody(body: string): ParsedBody {
  const application_type = detectApplicationType(body)

  const result: ParsedBody = {
    application_type,
    full_name: null, last_name: null, first_name: null,
    furigana_full: null, last_kana: null, first_kana: null,
    postal_code: null, address1: null, address2: null,
    email: null, phone: null, birth_date: null, gender: null,
    menu: null, course_date: null, course_time: null, exam_date: null, venue: null,
    ruby_preference: null, domicile: null, nationality: null,
    current_license: null, license_number: null, license_expiry: null,
    special_small: null, payment_method: null, purpose: null,
    delivery_method: null, physical_exam: null, record_change: null, boarding_plan: null,
    raw_schedule: null,
  }

  let pendingName = ''
  let pendingKana = ''

  const lines = body.split(/\r?\n/)

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    // ── 郵便番号（〒XXXXXXX または 〒XXX-XXXX） ──
    const zipM = line.match(/〒\s*(\d{3})-?(\d{4})/)
    if (zipM) {
      result.postal_code = `${zipM[1]}${zipM[2]}`
      continue
    }

    // ── ルビ希望フラグ ──
    if (/ルビを?希望しない/.test(line)) { result.ruby_preference = false; continue }
    if (/ルビを?希望する/.test(line) || /ルビ希望あり/.test(line)) { result.ruby_preference = true; continue }

    // ── 取得目的（コロンなしパターン）──
    const purposeNoColon = line.match(/^取得目的(.+)/)
    if (purposeNoColon && !line.includes('：')) {
      result.purpose = purposeNoColon[1].trim() || null
      continue
    }

    // ── キー：値 形式 ──
    // 全角コロン（：）または半角コロン（:）
    const colonIdx = line.search(/[：:]{1}/)
    if (colonIdx < 0) continue

    const key = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trim()

    switch (key) {
      // 申込系
      case 'メニュー':
        result.menu = value || null
        break

      case '日程': {
        const sched = parseCourseSchedule(value)
        result.course_date = sched.course_date
        result.exam_date = sched.exam_date
        result.venue = sched.venue
        result.raw_schedule = value
        break
      }

      // 受講者基本情報
      case '差出人': {
        // 「名前 <email>」形式の場合は名前部分だけ取り出す
        // 氏名フィールドが別途ある場合（更新・失効フォーム）は後から上書きされる
        const namePart = value.includes('<')
          ? value.slice(0, value.indexOf('<')).trim()
          : value.trim()
        if (namePart) {
          pendingName = namePart
          result.full_name = namePart
        }
        break
      }

      case '氏名':  // 更新・失効フォームの氏名フィールド
        pendingName = value
        result.full_name = value || null
        break

      case 'ふりがな':
      case 'フリガナ':
        pendingKana = value
        result.furigana_full = value || null
        break

      case '住所1':
      case '住所１':
        result.address1 = value || null
        break

      case '住所2':
      case '住所２':
        result.address2 = value || null
        break

      case 'E-mail':
      case 'Email':
      case 'e-mail':
      case 'メールアドレス':
      case 'メール':
        result.email = value.toLowerCase() || null
        break

      case '電話':
      case '電話番号':
      case 'TEL':
      case 'Tel': {
        // ハイフン・括弧などを除去
        const phone = value.replace(/[^0-9]/g, '')
        result.phone = phone || null
        break
      }

      case '本籍地':
        result.domicile = value || null
        break

      case '国籍':
        result.nationality = value || null
        break

      case '本籍/国籍':  // 更新・失効フォームの結合フィールド
        result.domicile = value || null
        break

      // 更新・失効フォーム固有フィールド
      case '講習日':
        result.course_date = parseMonthDay(value)
        break

      case '講習会場':
        result.venue = value || null
        break

      case '講習時間':
        result.course_time = value || null
        break

      case '有効期限日':
        result.license_expiry = parseJapaneseDate(value) ?? parseMonthDay(value)
        break

      case '現有免許の種類':
        result.current_license = value || null
        break

      case '送付方法':
        result.delivery_method = value || null
        break

      case '身体検査':
        result.physical_exam = value || null
        break

      case '記載事項変更':
        result.record_change = value || null
        break

      case '乗船予定':
        result.boarding_plan = value || null
        break

      case '生年月日': {
        // 「1978年3月18日年齢：48歳」のような末尾の余分な情報を取り除く
        const dob = parseJapaneseDate(value)
        result.birth_date = dob
        break
      }

      case '性別': {
        const g = value.replace(/\s/g, '')
        if (/^(男|male|男性)$/i.test(g)) result.gender = 'male'
        else if (/^(女|female|女性)$/i.test(g)) result.gender = 'female'
        else if (g) result.gender = 'other'
        break
      }

      case '現有免許':
        result.current_license = value || null
        break

      case '免許番号':
        result.license_number = value || null
        break

      case '特殊小型実技講習/試験':
      case '特殊小型実技':
      case '特殊小型':
        result.special_small = value || null
        break

      case 'お支払方法':
      case '支払方法':
      case 'お支払い方法':
        result.payment_method = value || null
        break

      case '取得目的':
        result.purpose = value || null
        break
    }
  }

  // ── 特殊小型：メニューに「PWC」「特殊」が含まれない場合は無効 ──
  if (result.special_small !== null && !/PWC|特殊/i.test(result.menu ?? '')) {
    result.special_small = null
  }

  // ── 氏名・ふりがな分割 ──
  if (pendingName) {
    const split = splitNameAndKana(pendingName, pendingKana)
    result.last_name = split.lastName || null
    result.first_name = split.firstName || null
    result.last_kana = split.lastKana || null
    result.first_kana = split.firstKana || null
  } else if (pendingKana) {
    result.last_kana = pendingKana
  }

  return result
}

/** ParsedBody → StudentInput に変換（受講者フィールドのみ抽出） */
import type { StudentInput } from '../types'
export function parsedBodyToStudent(p: ParsedBody): Partial<StudentInput> {
  return {
    last_name: p.last_name ?? '',
    first_name: p.first_name ?? '',
    last_kana: p.last_kana ?? null,
    first_kana: p.first_kana ?? null,
    birth_date: p.birth_date ?? null,
    gender: p.gender ?? null,
    postal_code: p.postal_code ?? null,
    address1: p.address1 ?? null,
    address2: p.address2 ?? null,
    phone: p.phone ?? null,
    email: p.email ?? null,
  }
}

/** ParsedBody → enrollment extra_json オブジェクトに変換 */
export function parsedBodyToEnrollmentExtra(p: ParsedBody): Record<string, unknown> {
  return {
    application_type: p.application_type,
    course_time: p.course_time,
    exam_date: p.exam_date,
    raw_schedule: p.raw_schedule,
    ruby_preference: p.ruby_preference,
    domicile: p.domicile,
    nationality: p.nationality,
    current_license: p.current_license,
    license_number: p.license_number,
    license_expiry: p.license_expiry,
    special_small: p.special_small,
    payment_method: p.payment_method,
    purpose: p.purpose,
    delivery_method: p.delivery_method,
    physical_exam: p.physical_exam,
    record_change: p.record_change,
    boarding_plan: p.boarding_plan,
  }
}
