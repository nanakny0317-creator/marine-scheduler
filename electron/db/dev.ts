/**
 * 開発専用：テストデータの生成・削除（SQLite / sql.js 版）
 * isDev のときだけ IPC ハンドラーが登録される。production ビルドでは呼ばれない。
 *
 * - 人物・住所・電話・メールはすべて架空（メールは example.com）
 * - 日付は「今日から何日後」で作るので、いつ生成しても日程が先の予定として並ぶ
 * - 入力チェック（免許番号の桁数・必須項目・文字数オーバーなど）を確かめられる人を含める
 */
import { query, queryOne, run, transaction } from './index'
import { nextStudentCode } from './students'

export interface DevCounts {
  students: number
  enrollments: number
  pendingReviews: number
  examSessions: number
  renewalSessions: number
  examRecords: number
  physicalExams: number
}

const TEST_NOTE = '【テストデータ】'

// ── 日付ヘルパー ────────────────────────────────────────────────
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function daysFromToday(n: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + n)
  return iso(d)
}
function yearsFromToday(years: number, extraDays = 0): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setFullYear(d.getFullYear() + years)
  d.setDate(d.getDate() + extraDays)
  return iso(d)
}

// ── 件数 ────────────────────────────────────────────────────────
const count = (table: string) => Number(queryOne(`SELECT COUNT(*) AS c FROM ${table}`)?.c ?? 0)

export function devGetCounts(): DevCounts {
  return {
    students:        count('students'),
    enrollments:     count('enrollments'),
    pendingReviews:  count('pending_reviews'),
    examSessions:    count('exam_sessions'),
    renewalSessions: count('renewal_sessions'),
    examRecords:     count('exam_records'),
    physicalExams:   count('physical_exams'),
  }
}

// ── 全削除（会場マスターは残す） ─────────────────────────────────
export function devResetAll(): boolean {
  transaction(() => {
    for (const t of [
      'pending_reviews', 'physical_exams', 'exam_records', 'renewals', 'enrollments', 'students',
      'exam_sessions', 'renewal_sessions', 'classrooms',
    ]) {
      run(`DELETE FROM ${t}`)
    }
  })
  return true
}

// ── 挿入ヘルパー ────────────────────────────────────────────────
interface TestStudent {
  last_name: string
  first_name: string
  last_kana?: string | null
  first_kana?: string | null
  birth_date?: string | null
  gender?: 'male' | 'female' | null
  postal_code?: string | null
  prefecture?: string | null
  city?: string | null
  address1?: string | null
  address2?: string | null
  address_room?: string | null
  mail_postal_code?: string | null
  mail_prefecture?: string | null
  mail_city?: string | null
  mail_address1?: string | null
  mail_address2?: string | null
  mail_address_room?: string | null
  phone?: string | null
  mobile?: string | null
  email?: string | null
  license_number?: string | null
  license_issue_date?: string | null
  license_expiry?: string | null
  license_class?: string | null
  license_options?: string | null
  license_equipment_limited?: boolean
  domicile?: string | null
  nationality?: string | null
  note?: string | null   // 何を確かめるためのデータか
}

const STUDENT_COLS = [
  'student_code', 'last_name', 'first_name', 'last_kana', 'first_kana', 'birth_date', 'gender',
  'postal_code', 'prefecture', 'city', 'address1', 'address2', 'address_room',
  'mail_postal_code', 'mail_prefecture', 'mail_city', 'mail_address1', 'mail_address2', 'mail_address_room',
  'phone', 'mobile', 'email',
  'license_number', 'license_issue_date', 'license_expiry', 'license_class', 'license_options', 'license_equipment_limited',
  'domicile', 'nationality', 'note',
] as const

function insertStudent(s: TestStudent): number {
  const v: Record<string, string | number | null> = {
    ...Object.fromEntries(STUDENT_COLS.map(c => [c, null])),
    ...s,
    student_code: nextStudentCode(),
    license_equipment_limited: s.license_equipment_limited ? 1 : 0,
    note: `${TEST_NOTE}${s.note ?? ''}`,
  }
  return run(
    `INSERT INTO students (${STUDENT_COLS.join(', ')}) VALUES (${STUDENT_COLS.map(() => '?').join(', ')})`,
    STUDENT_COLS.map(c => v[c] ?? null),
  )
}

function insertEnrollment(e: {
  student_id: number
  menu?: string
  course_date?: string | null
  venue?: string | null
  status?: 'pending' | 'confirmed' | 'completed' | 'cancelled'
  extra: Record<string, unknown>
  note?: string | null
}): number {
  return run(
    `INSERT INTO enrollments (student_id, menu, course_date, venue, status, extra_json, note) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [e.student_id, e.menu ?? '', e.course_date ?? null, e.venue ?? null, e.status ?? 'pending', JSON.stringify(e.extra), e.note ?? null],
  )
}

interface ExamSessionRow {
  id: number; exam_date: string; exam_location: string; qualification_type: string
  exam_id: string; gakka_venue: string; jitsugi_venue: string
}
function insertExamSession(s: Omit<ExamSessionRow, 'id'> & { exam_type?: string }): ExamSessionRow {
  const id = run(
    `INSERT INTO exam_sessions (exam_date, exam_location, qualification_type, exam_id, exam_type, gakka_venue, jitsugi_venue)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [s.exam_date, s.exam_location, s.qualification_type, s.exam_id, s.exam_type ?? '学科+実技', s.gakka_venue, s.jitsugi_venue],
  )
  return { id, ...s }
}

function insertRenewalSession(course_date: string, location: string, start_time: string, note: string | null) {
  const id = run(
    `INSERT INTO renewal_sessions (course_date, location, start_time, note) VALUES (?, ?, ?, ?)`,
    [course_date, location, start_time, note],
  )
  return { id, course_date, location, start_time }
}

// 試験申請の申込 extra_json
function newExamExtra(o: {
  session: ExamSessionRow
  classroom: string
  courseDates: string[]
  gakka?: boolean
  jitsugi?: boolean
  shintai?: 'need' | 'have'
  prevExam?: Record<string, unknown>
}): Record<string, unknown> {
  const sessions = o.courseDates.map((date, i) => ({
    date, venue: o.classroom, time: i === 0 ? '10:00' : '13:00', lessonType: i === 0 ? '一般学科' : '実技',
  }))
  return {
    application_type: 'new',
    course_sessions: sessions,
    course_dates: sessions.map(s => s.date),
    course_location: o.classroom,
    course_time: sessions[0]?.time,
    exam_date: o.session.exam_date,
    exam_location: o.session.exam_location,
    exam_start_time: '09:30',
    exam_qual_type: o.session.qualification_type,
    exam_gakka: o.gakka ?? true,
    exam_jitsugi: o.jitsugi ?? true,
    ...(o.shintai ? { shintai: o.shintai } : {}),
    ...(o.prevExam ? { prev_exam: o.prevExam } : {}),
    exam_session_id: o.session.id,
    exam_id: o.session.exam_id,
    ...(o.session.gakka_venue ? { exam_gakka_venue: o.session.gakka_venue } : {}),
    ...(o.session.jitsugi_venue ? { exam_jitsugi_venue: o.session.jitsugi_venue } : {}),
  }
}

// 更新・失効の申込 extra_json
function renewalExtra(type: 'renewal' | 'lapsed', location: string, time: string, licenseReturn: 'yes' | 'no' | '',
  bureau: [string, string] = ['06', '00']): Record<string, unknown> {
  return {
    application_type: type,
    course_location: location,
    course_time: time,
    ...(licenseReturn ? { license_return: licenseReturn } : {}),
    course_org_code: 1,
    bureau_code: bureau[0],
    branch_code: bureau[1],
  }
}

// ── 生成 ────────────────────────────────────────────────────────
export function devSeedTestData(): DevCounts {
  const before = devGetCounts()

  transaction(() => {
    // 会場マスター（起動時に自動登録済み）から名前を借りる。普段使う近畿の会場を優先
    const venueNames = query(
      `SELECT name FROM venues WHERE active = 1
       ORDER BY CASE region WHEN '近畿' THEN 0 ELSE 1 END, prefecture, sort_order LIMIT 6`)
      .map(r => String(r.name))
    const venue = (i: number) => venueNames[i % Math.max(1, venueNames.length)] ?? '大阪府大阪市'

    // ── 授業会場（教室）：未登録のときだけ ──
    if (count('classrooms') === 0) {
      ;['本町教室', '琵琶湖教室', '神戸教室'].forEach((name, i) =>
        run(`INSERT INTO classrooms (name, note, sort_order) VALUES (?, ?, ?)`, [name, TEST_NOTE, (i + 1) * 10]))
    }
    const classroom = (i: number) => ['本町教室', '琵琶湖教室', '神戸教室'][i % 3]

    // ── 試験日程 ──
    const year = new Date().getFullYear()
    const ex2Osaka  = insertExamSession({ exam_date: daysFromToday(21), exam_location: '大阪府大阪市',          qualification_type: '二級', exam_id: `${year}-T-001`, gakka_venue: '大阪南港ATC', jitsugi_venue: '大阪南港ATC' })
    const ex2Biwa   = insertExamSession({ exam_date: daysFromToday(35), exam_location: '滋賀県大津市（浜大津）', qualification_type: '二級', exam_id: `${year}-T-002`, gakka_venue: '浜大津公民館', jitsugi_venue: '大津港' })
    const ex1Nishi  = insertExamSession({ exam_date: daysFromToday(28), exam_location: '兵庫県西宮市',          qualification_type: '一級', exam_id: `${year}-T-003`, gakka_venue: '西宮市民会館', jitsugi_venue: '新西宮ヨットハーバー' })
    const exTokushu = insertExamSession({ exam_date: daysFromToday(42), exam_location: '滋賀県彦根市',          qualification_type: '特殊', exam_id: `${year}-T-004`, gakka_venue: '彦根市民会館', jitsugi_venue: '彦根港' })
    const exKosen   = insertExamSession({ exam_date: daysFromToday(56), exam_location: '京都府舞鶴市',          qualification_type: '湖川', exam_id: `${year}-T-005`, gakka_venue: '舞鶴市商工観光センター', jitsugi_venue: '舞鶴港' })
    // 過去の試験（試験記録・免除の根拠用）
    const exPast    = insertExamSession({ exam_date: daysFromToday(-120), exam_location: '大阪府大阪市',        qualification_type: '二級', exam_id: `${year}-T-900`, gakka_venue: '大阪南港ATC', jitsugi_venue: '大阪南港ATC' })
    const exOld     = insertExamSession({ exam_date: yearsFromToday(-3), exam_location: '兵庫県神戸市',         qualification_type: '二級', exam_id: `${year - 3}-T-901`, gakka_venue: '神戸市産業振興センター', jitsugi_venue: '神戸港' })

    // ── 更新講習の日程 ──
    const rn1 = insertRenewalSession(daysFromToday(10), venue(0), '13:30', '午後の部')
    const rn2 = insertRenewalSession(daysFromToday(10), venue(0), '18:30', '夜間')
    const rn3 = insertRenewalSession(daysFromToday(24), venue(1), '10:00', null)
    const rn4 = insertRenewalSession(daysFromToday(45), venue(2), '13:30', null)

    // ═════ 試験申請 ═════
    // 1. 標準（入力がそろっている基本形）
    const s1 = insertStudent({ last_name: '海野', first_name: '太郎', last_kana: 'ウミノ', first_kana: 'タロウ', birth_date: '1988-04-12', gender: 'male',
      postal_code: '5300001', prefecture: '大阪府', city: '大阪市北区', address1: '梅田1-1-1', phone: '06-0000-1111', mobile: '090-0000-1111', email: 'umino@example.com',
      domicile: '大阪府', note: '標準：試験申請（二級・学科＋実技・身体検査が必要）' })
    insertEnrollment({ student_id: s1, menu: '2級小型船舶操縦士', course_date: daysFromToday(7), venue: classroom(0), extra: newExamExtra({ session: ex2Osaka, classroom: classroom(0), courseDates: [daysFromToday(7), daysFromToday(14)], shintai: 'need' }) })

    // 2. 身体検査の記録あり（有効）→「有効な証明書あり」
    const s2 = insertStudent({ last_name: '波多野', first_name: '花子', last_kana: 'ハタノ', first_kana: 'ハナコ', birth_date: '1995-09-30', gender: 'female',
      postal_code: '520-0047', prefecture: '滋賀県', city: '大津市', address1: '浜大津2-3-4', mobile: '080-0000-2222', email: 'hatano@example.com',
      domicile: '滋賀県', note: '身体検査の記録あり（有効期限内）・郵便番号ハイフン付き' })
    insertEnrollment({ student_id: s2, menu: '2級小型船舶操縦士', course_date: daysFromToday(12), venue: classroom(1), extra: newExamExtra({ session: ex2Biwa, classroom: classroom(1), courseDates: [daysFromToday(12)], shintai: 'have' }) })
    run(`INSERT INTO physical_exams (student_id, exam_date, valid_until, note) VALUES (?, ?, ?, ?)`, [s2, daysFromToday(-30), yearsFromToday(1, -30), TEST_NOTE])

    // 3. 身体検査の記録が期限切れ
    const s3 = insertStudent({ last_name: '舟木', first_name: '健一', last_kana: 'フナキ', first_kana: 'ケンイチ', birth_date: '1972-01-05', gender: 'male',
      postal_code: '6500021', prefecture: '兵庫県', city: '神戸市中央区', address1: '三宮町1-2-3', phone: '078-000-3333', email: 'funaki@example.com',
      domicile: '兵庫県', note: '身体検査の記録が期限切れ（受検が必要になるはず）・一級' })
    insertEnrollment({ student_id: s3, menu: '1級小型船舶操縦士', course_date: daysFromToday(9), venue: classroom(2), extra: newExamExtra({ session: ex1Nishi, classroom: classroom(2), courseDates: [daysFromToday(9), daysFromToday(16)], shintai: 'need' }) })
    run(`INSERT INTO physical_exams (student_id, exam_date, valid_until, note) VALUES (?, ?, ?, ?)`, [s3, yearsFromToday(-2), yearsFromToday(-1), TEST_NOTE])

    // 4. 学科合格済み → 学科免除（実技のみ受験）。合格から2年以内
    const s4 = insertStudent({ last_name: '岬', first_name: '翔太', last_kana: 'ミサキ', first_kana: 'ショウタ', birth_date: '2000-07-07', gender: 'male',
      postal_code: '5900001', prefecture: '大阪府', city: '堺市堺区', address1: '市之町東1-1', mobile: '090-0000-4444', email: 'misaki@example.com',
      domicile: '大阪府', note: '過去合格歴あり：学科合格（2年以内）→ 学科免除・実技のみ' })
    const s4Rec = run(
      `INSERT INTO exam_records (student_id, qualification_type, gakka_session_id, gakka_exam_number, gakka_result, gakka_result_date,
         jitsugi_session_id, jitsugi_exam_number, jitsugi_result, jitsugi_result_date, note)
       VALUES (?, '二級', ?, '0123', '合', ?, ?, '0123', '否', ?, ?)`,
      [s4, exPast.id, exPast.exam_date, exPast.id, exPast.exam_date, TEST_NOTE])
    insertEnrollment({ student_id: s4, menu: '2級小型船舶操縦士', course_date: daysFromToday(14), venue: classroom(0), extra: newExamExtra({
      session: ex2Osaka, classroom: classroom(0), courseDates: [daysFromToday(14)], gakka: false, jitsugi: true, shintai: 'need',
      prevExam: { subject: '学科', record_id: s4Rec, qual: '二級', date: exPast.exam_date, location: exPast.exam_location, number: '0123', exam_id: exPast.exam_id, result_date: exPast.exam_date },
    }) })

    // 5. 学科合格が3年前（免除の期限切れ）
    const s5 = insertStudent({ last_name: '浜辺', first_name: '美波', last_kana: 'ハマベ', first_kana: 'ミナミ', birth_date: '1990-03-03', gender: 'female',
      postal_code: '6620000', prefecture: '兵庫県', city: '西宮市', address1: '甲子園町5-6', phone: '0798-00-5555', email: 'hamabe@example.com',
      domicile: '兵庫県', note: '過去合格歴あり：学科合格が3年前（免除の期限切れ）' })
    run(
      `INSERT INTO exam_records (student_id, qualification_type, gakka_session_id, gakka_exam_number, gakka_result, gakka_result_date, note)
       VALUES (?, '二級', ?, '0456', '合', ?, ?)`,
      [s5, exOld.id, exOld.exam_date, TEST_NOTE])
    insertEnrollment({ student_id: s5, menu: '2級小型船舶操縦士', course_date: daysFromToday(20), venue: classroom(1), extra: newExamExtra({ session: ex2Biwa, classroom: classroom(1), courseDates: [daysFromToday(20)], shintai: 'need' }) })

    // 6. 特殊・外国籍（韓国）・送付先住所あり
    const s6 = insertStudent({ last_name: '金', first_name: '海', last_kana: 'キム', first_kana: 'ウミ', birth_date: '1985-12-24', gender: 'male',
      postal_code: '5420076', prefecture: '大阪府', city: '大阪市中央区', address1: '難波5-1-60', address2: 'なんばマリンハイツ', address_room: '1203',
      mail_postal_code: '5300011', mail_prefecture: '大阪府', mail_city: '大阪市北区', mail_address1: '大深町3-1', mail_address2: 'グランドオフィス', mail_address_room: '15F',
      mobile: '070-0000-6666', email: 'kim@example.com', nationality: '韓国', note: '外国籍（韓国・本籍なし）・送付先住所あり・建物名と部屋番号あり・特殊' })
    insertEnrollment({ student_id: s6, menu: '特殊小型船舶操縦士', course_date: daysFromToday(30), venue: classroom(1), extra: newExamExtra({ session: exTokushu, classroom: classroom(1), courseDates: [daysFromToday(30)], shintai: 'need' }) })

    // 7. 若年（17歳）・湖川
    const s7 = insertStudent({ last_name: '湖山', first_name: 'ひかり', last_kana: 'コヤマ', first_kana: 'ヒカリ', birth_date: yearsFromToday(-17, 20), gender: 'female',
      postal_code: '6240000', prefecture: '京都府', city: '舞鶴市', address1: '北吸1-1', phone: '0773-00-7777', email: 'koyama@example.com',
      domicile: '京都府', note: '若年（17歳）・湖川' })
    insertEnrollment({ student_id: s7, menu: '2級小型船舶操縦士', course_date: daysFromToday(40), venue: classroom(2), extra: newExamExtra({ session: exKosen, classroom: classroom(2), courseDates: [daysFromToday(40)], shintai: 'need' }) })

    // ═════ 入力チェック（バリデーション）確認用 ═════
    insertStudent({ last_name: '桁足', first_name: '一郎', last_kana: 'ケタタリ', first_kana: 'イチロウ', birth_date: '1980-05-05', gender: 'male',
      prefecture: '大阪府', city: '大阪市西区', address1: '新町1-1', mobile: '090-0000-8001',
      license_number: '030016000490', license_class: '二級', license_issue_date: yearsFromToday(-4), license_expiry: yearsFromToday(1),
      note: '免許番号が12桁（13桁でない注意が出るはず）' })
    insertStudent({ last_name: '桁多', first_name: '二郎', last_kana: 'ケタオオ', first_kana: 'ジロウ', birth_date: '1981-06-06', gender: 'male',
      prefecture: '京都府', city: '京都市中京区', address1: '御池通2-2', mobile: '090-0000-8002',
      license_number: '03001600049012', license_class: '二級',
      note: '免許番号が14桁（注意が出るはず）' })
    insertStudent({ last_name: '記号', first_name: '三郎', last_kana: 'キゴウ', first_kana: 'サブロウ', birth_date: '1982-07-07', gender: 'male',
      prefecture: '兵庫県', city: '尼崎市', address1: '東難波町3-3', mobile: '090-0000-8003',
      license_number: '0300-1600-04901', license_class: '一級',
      note: '免許番号にハイフンが入っている（数字以外の注意が出るはず）' })
    insertStudent({ last_name: '全角', first_name: '四郎', last_kana: 'ゼンカク', first_kana: 'シロウ', birth_date: '1983-08-08', gender: 'male',
      prefecture: '奈良県', city: '奈良市', address1: '三条町4-4', mobile: '090-0000-8004',
      license_number: '０３００１６０００４９０１', license_class: '二級',
      note: '免許番号が全角数字13桁（注意は出ないはず）' })
    insertStudent({ last_name: '最小', first_name: '限', note: '姓・名だけ（ほかは空欄）。カナ・生年月日・住所・連絡先なし' })
    insertStudent({ last_name: '長谷川原', first_name: '左右衛門之助', last_kana: 'ハセガワラ', first_kana: 'サウエモンノスケ', birth_date: '1965-11-11', gender: 'male',
      postal_code: '6038000', prefecture: '京都府', city: '京都市北区', address1: '上賀茂本山町1234番地の5678', address2: 'ロイヤルガーデンパレス上賀茂リバーサイドタワー', address_room: '2501',
      phone: '075-000-8006', email: 'very.long.address.for.testing.purpose@example.com',
      note: '氏名・住所・建物名が長い（申請書の枠に入りきるか確認）' })

    // ═════ 更新講習 ═════
    const r1 = insertStudent({ last_name: '帆足', first_name: '誠', last_kana: 'ホアシ', first_kana: 'マコト', birth_date: '1975-02-14', gender: 'male',
      postal_code: '5640000', prefecture: '大阪府', city: '吹田市', address1: '江坂町1-2-3', phone: '06-0000-9001', email: 'hoashi@example.com',
      license_number: '0300270009812', license_class: '二級', license_options: '特殊', license_issue_date: yearsFromToday(-5, 30), license_expiry: daysFromToday(30),
      domicile: '大阪府', note: '更新講習：二級＋特殊・有効期限が1か月後・返納 無' })
    insertEnrollment({ student_id: r1, course_date: rn1.course_date, venue: rn1.location, extra: renewalExtra('renewal', rn1.location, rn1.start_time, 'no') })

    const r2 = insertStudent({ last_name: '舵谷', first_name: '由美', last_kana: 'カジタニ', first_kana: 'ユミ', birth_date: '1968-08-20', gender: 'female',
      postal_code: '6300000', prefecture: '奈良県', city: '奈良市', address1: '登大路町5-5', mobile: '080-0000-9002', email: 'kajitani@example.com',
      license_number: '0300160004901', license_class: '一級', license_equipment_limited: true, license_issue_date: yearsFromToday(-5, 60), license_expiry: daysFromToday(60),
      domicile: '奈良県', note: '更新講習：一級（設備限定）・返納 有・夜間の回' })
    insertEnrollment({ student_id: r2, course_date: rn2.course_date, venue: rn2.location, extra: renewalExtra('renewal', rn2.location, rn2.start_time, 'yes') })

    const r3 = insertStudent({ last_name: '錨田', first_name: '大輔', last_kana: 'イカリダ', first_kana: 'ダイスケ', birth_date: '1958-10-01', gender: 'male',
      postal_code: '6400000', prefecture: '和歌山県', city: '和歌山市', address1: '本町2-2', phone: '073-000-9003',
      license_number: '0300300012345', license_class: '旧四級', license_issue_date: yearsFromToday(-5, 90), license_expiry: daysFromToday(90),
      domicile: '和歌山県', note: '更新講習：旧四級・返納 未選択・提出先が和歌山海運支局' })
    insertEnrollment({ student_id: r3, course_date: rn3.course_date, venue: rn3.location, extra: renewalExtra('renewal', rn3.location, rn3.start_time, '', ['06', '04']) })

    // ═════ 失効再交付 ═════
    const l1 = insertStudent({ last_name: '潮見', first_name: '和子', last_kana: 'シオミ', first_kana: 'カズコ', birth_date: '1962-06-15', gender: 'female',
      postal_code: '6740000', prefecture: '兵庫県', city: '明石市', address1: '大明石町1-1', phone: '078-000-9101',
      license_number: '0300280045678', license_class: '二級', license_issue_date: yearsFromToday(-7), license_expiry: yearsFromToday(-2),
      domicile: '兵庫県', note: '失効再交付：有効期限が2年前に切れている' })
    insertEnrollment({ student_id: l1, course_date: rn3.course_date, venue: rn3.location, extra: renewalExtra('lapsed', rn3.location, rn3.start_time, 'no') })

    const l2 = insertStudent({ last_name: '沖田', first_name: '修', last_kana: 'オキタ', first_kana: 'オサム', birth_date: '1970-04-04', gender: 'male',
      postal_code: '5200000', prefecture: '滋賀県', city: '彦根市', address1: '元町3-3', mobile: '090-0000-9102',
      license_number: '0300250099999', license_class: '一級', license_options: '特殊', license_issue_date: yearsFromToday(-3), license_expiry: yearsFromToday(2),
      domicile: '滋賀県', note: '失効再交付：免許証を紛失（有効期限内）' })
    insertEnrollment({ student_id: l2, course_date: rn4.course_date, venue: rn4.location, extra: renewalExtra('lapsed', rn4.location, rn4.start_time, '') })

    // ═════ 重複の確認用 ═════
    // 同姓同名・別人（生年月日が違う）
    insertStudent({ last_name: '佐藤', first_name: '健', last_kana: 'サトウ', first_kana: 'ケン', birth_date: '1980-01-01', gender: 'male',
      prefecture: '兵庫県', city: '神戸市中央区', address1: '三宮町2-2', phone: '078-000-0001', note: '同姓同名・別人（1人目）' })
    insertStudent({ last_name: '佐藤', first_name: '健', last_kana: 'サトウ', first_kana: 'ケン', birth_date: '1992-06-15', gender: 'male',
      prefecture: '大阪府', city: '大阪市西区', address1: '新町1-1', phone: '06-0000-0002', note: '同姓同名・別人（2人目・生年月日が違う）' })

    // 旧字体ペア（要対応リストに入る）
    const tOld = insertStudent({ last_name: '髙橋', first_name: '一郎', last_kana: 'タカハシ', first_kana: 'イチロウ', birth_date: '1975-05-10', gender: 'male',
      postal_code: '5410053', prefecture: '大阪府', city: '大阪市中央区', address1: '本町2-3-4', phone: '06-0000-0003', email: 'takahashi@example.com', note: '旧字体ペア（髙）' })
    const tNew = insertStudent({ last_name: '高橋', first_name: '一郎', last_kana: 'タカハシ', first_kana: 'イチロウ', birth_date: '1975-05-10', gender: 'male',
      postal_code: '5410053', prefecture: '大阪府', city: '大阪市中央区', address1: '本町2-3-4', phone: '06-0000-0003', email: 'takahashi@example.com', note: '旧字体ペア（高）・重複の可能性' })
    run(`INSERT INTO pending_reviews (student_id, candidate_id, match_reasons, match_score) VALUES (?, ?, ?, ?)`,
      [tNew, tOld, JSON.stringify(['同フリガナ', '生年月日一致', '電話一致']), 70])

    const sOld = insertStudent({ last_name: '齊藤', first_name: '美子', last_kana: 'サイトウ', first_kana: 'ミコ', birth_date: '1988-11-30', gender: 'female',
      postal_code: '6160000', prefecture: '京都府', city: '京都市右京区', address1: '太秦1-2-3', mobile: '080-0000-0004', email: 'saito@example.com', note: '旧字体ペア（齊）' })
    const sNew = insertStudent({ last_name: '斉藤', first_name: '美子', last_kana: 'サイトウ', first_kana: 'ミコ', birth_date: '1988-11-30', gender: 'female',
      postal_code: '6160000', prefecture: '京都府', city: '京都市右京区', address1: '太秦1-2-3', mobile: '080-0000-0004', email: 'saito@example.com', note: '旧字体ペア（斉）・重複の可能性' })
    run(`INSERT INTO pending_reviews (student_id, candidate_id, match_reasons, match_score) VALUES (?, ?, ?, ?)`,
      [sNew, sOld, JSON.stringify(['同フリガナ', '生年月日一致', 'メール一致']), 65])
  })

  const after = devGetCounts()
  return Object.fromEntries(
    (Object.keys(after) as (keyof DevCounts)[]).map(k => [k, after[k] - before[k]]),
  ) as unknown as DevCounts
}
