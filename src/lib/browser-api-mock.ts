/**
 * ブラウザモード（ELECTRON_MODE=browser）で window.api が存在しない場合に使う
 * インメモリのスタブ実装。UI 開発・レイアウト確認用。
 */
import type {
  ElectronAPI,
  Student, StudentInput, StudentSearchParams,
  Enrollment, EnrollmentInput,
  Venue, VenueInput,
  ExamSession, ExamSessionInput,
  DuplicateCheckResult, PendingReview, PendingReviewInput,
  PendingReviewWithStudents, DupImportRow,
} from '../types'

// ── インメモリストア ───────────────────────────────────────
let students: Student[] = []
let enrollments: Enrollment[] = []
let venues: Venue[] = []
let examSessions: ExamSession[] = []
let pendingReviews: PendingReviewWithStudents[] = []
let nextId = 1

function now() { return new Date().toISOString() }
function id() { return nextId++ }

// ── モック実装 ────────────────────────────────────────────
export const browserApiMock: ElectronAPI = {
  students: {
    list: (params?: StudentSearchParams) => {
      let result = [...students]
      if (params?.query) {
        const q = params.query.toLowerCase()
        result = result.filter(s =>
          `${s.last_name}${s.first_name}${s.last_kana ?? ''}${s.first_kana ?? ''}`.toLowerCase().includes(q)
        )
      }
      return Promise.resolve(result)
    },
    get: (id: number) =>
      Promise.resolve(students.find(s => s.id === id) ?? null),
    create: (input: StudentInput) => {
      const s: Student = { ...input, id: id(), created_at: now(), updated_at: now() }
      students.push(s)
      return Promise.resolve(s)
    },
    update: (sid: number, input: StudentInput) => {
      const idx = students.findIndex(s => s.id === sid)
      if (idx === -1) return Promise.reject(new Error('not found'))
      students[idx] = { ...students[idx], ...input, updated_at: now() }
      return Promise.resolve(students[idx])
    },
    delete: (sid: number) => {
      students = students.filter(s => s.id !== sid)
      return Promise.resolve(true)
    },
    checkDuplicate: () =>
      Promise.resolve<DuplicateCheckResult>({ hasDuplicate: false, candidates: [], byName: [], byAddress: [] }),
    import: (rows: StudentInput[]) => {
      rows.forEach(r => {
        students.push({ ...r, id: id(), created_at: now(), updated_at: now() })
      })
      return Promise.resolve({ inserted: rows.length, skipped: 0 })
    },
    nextCode: () => Promise.resolve(`M${String(students.length + 1).padStart(4, '0')}`),
    migrateKana: () => Promise.resolve(true),
  },

  venues: {
    list: (activeOnly?: boolean) => {
      const result = activeOnly ? venues.filter(v => v.active) : venues
      return Promise.resolve(result)
    },
    regions: () =>
      Promise.resolve([...new Set(venues.map(v => v.region))]),
    create: (input: VenueInput) => {
      const v: Venue = { ...input, id: id(), created_at: now(), updated_at: now() }
      venues.push(v)
      return Promise.resolve(v)
    },
    update: (vid: number, input: VenueInput) => {
      const idx = venues.findIndex(v => v.id === vid)
      if (idx === -1) return Promise.reject(new Error('not found'))
      venues[idx] = { ...venues[idx], ...input, updated_at: now() }
      return Promise.resolve(venues[idx])
    },
    delete: (vid: number) => {
      venues = venues.filter(v => v.id !== vid)
      return Promise.resolve(true)
    },
  },

  enrollments: {
    create: (input: EnrollmentInput) => {
      const e: Enrollment = { ...input, id: id(), created_at: now(), updated_at: now() }
      enrollments.push(e)
      return Promise.resolve(e)
    },
    list: (studentId: number) =>
      Promise.resolve(enrollments.filter(e => e.student_id === studentId)),
    importBatch: (rows) => {
      rows.forEach(r => {
        const s: Student = { ...r.student, id: id(), created_at: now(), updated_at: now() }
        students.push(s)
        const e: Enrollment = { ...r.enrollment, student_id: s.id, id: id(), created_at: now(), updated_at: now() }
        enrollments.push(e)
      })
      return Promise.resolve({ inserted: rows.length, skipped: 0 })
    },
    importWithDup: (rows: DupImportRow[]) => {
      rows.forEach(r => {
        const s: Student = { ...r.student, id: id(), created_at: now(), updated_at: now() }
        students.push(s)
        const e: Enrollment = { ...r.enrollment, student_id: s.id, id: id(), created_at: now(), updated_at: now() }
        enrollments.push(e)
      })
      return Promise.resolve({ inserted: rows.length, skipped: 0 })
    },
    listAll: () =>
      Promise.resolve(
        enrollments.map(e => ({
          enrollment: e,
          student: students.find(s => s.id === e.student_id)!,
        })).filter(x => x.student)
      ),
    update: (eid: number, input: EnrollmentInput) => {
      const idx = enrollments.findIndex(e => e.id === eid)
      if (idx === -1) return Promise.reject(new Error('not found'))
      enrollments[idx] = { ...enrollments[idx], ...input, updated_at: now() }
      return Promise.resolve(enrollments[idx])
    },
    delete: (eid: number) => {
      enrollments = enrollments.filter(e => e.id !== eid)
      return Promise.resolve(true)
    },
  },

  pendingReviews: {
    list: () => Promise.resolve([...pendingReviews]),
    create: (input: PendingReviewInput) => {
      const pr: PendingReview = {
        ...input, id: id(), status: 'pending', resolution: null,
        created_at: now(), updated_at: now(),
      }
      const student = students.find(s => s.id === input.student_id)!
      const candidate = students.find(s => s.id === input.candidate_id)!
      pendingReviews.push({ ...pr, student, candidate })
      return Promise.resolve(pr)
    },
    resolve: (rid: number) => {
      pendingReviews = pendingReviews.filter(p => p.id !== rid)
      return Promise.resolve(true)
    },
    merge: (rid: number) => {
      pendingReviews = pendingReviews.filter(p => p.id !== rid)
      return Promise.resolve(true)
    },
  },

  examSessions: {
    list: () => Promise.resolve([...examSessions].sort((a, b) => a.exam_date.localeCompare(b.exam_date))),
    create: (input: ExamSessionInput) => {
      const s: ExamSession = { ...input, id: id(), created_at: now(), updated_at: now() }
      examSessions.push(s)
      return Promise.resolve(s)
    },
    update: (sid: number, input: ExamSessionInput) => {
      const idx = examSessions.findIndex(s => s.id === sid)
      if (idx === -1) return Promise.reject(new Error('not found'))
      examSessions[idx] = { ...examSessions[idx], ...input, updated_at: now() }
      return Promise.resolve(examSessions[idx])
    },
    delete: (sid: number) => {
      examSessions = examSessions.filter(s => s.id !== sid)
      return Promise.resolve(true)
    },
    upsert: (rows: ExamSessionInput[]) => {
      let inserted = 0; let updated = 0
      for (const row of rows) {
        const idx = examSessions.findIndex(
          s => s.exam_date === row.exam_date && s.exam_location === row.exam_location && s.qualification_type === row.qualification_type
        )
        if (idx !== -1) {
          examSessions[idx] = { ...examSessions[idx], exam_id: row.exam_id, updated_at: now() }
          updated++
        } else {
          examSessions.push({ ...row, id: id(), created_at: now(), updated_at: now() })
          inserted++
        }
      }
      return Promise.resolve({ inserted, updated })
    },
  },

  print: {
    html: () => {
      console.warn('[browser-mock] print.html は未対応')
      return Promise.resolve()
    },
  },

  dev: {
    counts: () =>
      Promise.resolve({ students: students.length, enrollments: enrollments.length, pendingReviews: pendingReviews.length }),
    resetAll: () => {
      students = []; enrollments = []; venues = []; examSessions = []; pendingReviews = []; nextId = 1
      return Promise.resolve(true)
    },
    seed: () => {
      const mk = (
        code: string, ln: string, fn: string, lk: string, fk: string,
        bd: string, g: 'male' | 'female' | 'other',
        zip: string, pref: string, city: string, addr: string,
        phone: string | null, mobile: string | null,
        licNo: string | null = null
      ): Student => ({
        id: id(), student_code: code, license_number: licNo,
        last_name: ln, first_name: fn, last_kana: lk, first_kana: fk,
        birth_date: bd, gender: g,
        postal_code: zip, prefecture: pref, city, address1: addr, address2: null,
        phone, mobile, email: null, note: null, created_at: now(), updated_at: now(),
      })

      const s: Student[] = [
        mk('M0001','山田','太郎','ヤマダ','タロウ','1985-04-01','male','150-0001','東京都','渋谷区','神南1-1-1','03-1234-5678',null),
        mk('M0002','鈴木','花子','スズキ','ハナコ','1990-07-15','female','160-0022','東京都','新宿区','新宿3-2-1',null,'090-8765-4321'),
        mk('M0003','田中','次郎','タナカ','ジロウ','1978-11-23','male','220-0012','神奈川県','横浜市西区','みなとみらい2-3-4','045-111-2222',null),
        mk('M0004','伊藤','美咲','イトウ','ミサキ','1995-02-14','female','530-0001','大阪府','大阪市北区','梅田1-2-3',null,'080-3333-4444'),
        mk('M0005','渡辺','浩二','ワタナベ','コウジ','1970-08-30','male','460-0008','愛知県','名古屋市中区','栄3-15-33','052-555-6666',null),
        mk('M0006','中村','由美','ナカムラ','ユミ','1988-05-05','female','600-8216','京都府','京都市下京区','烏丸通四条下る','075-222-3333',null),
        mk('M0007','小林','翔太','コバヤシ','ショウタ','2000-01-20','male','980-0021','宮城県','仙台市青葉区','中央1-6-35',null,'070-1111-2222'),
        mk('M0008','加藤','幸子','カトウ','サチコ','1965-12-01','female','730-0011','広島県','広島市中区','基町10-52','082-777-8888',null),
        mk('M0009','吉田','大輔','ヨシダ','ダイスケ','1992-09-18','male','810-0001','福岡県','福岡市中央区','天神1-4-1',null,'090-9999-0000'),
        mk('M0010','山本','恵','ヤマモト','メグミ','1983-03-27','female','260-0044','千葉県','千葉市中央区','松波1-10-5','043-444-5555',null),
        mk('M0011','松本','一郎','マツモト','イチロウ','1975-06-06','male','380-0823','長野県','長野市','南千歳1-3-3','026-333-4444',null),
        mk('M0012','井上','奈々','イノウエ','ナナ','1998-10-10','female','900-0015','沖縄県','那覇市','久茂地3-29-68',null,'080-5678-1234'),
        // 同姓同名ペア（別人）
        mk('M0013','佐藤','健','サトウ','ケン','1982-07-07','male','170-0013','東京都','豊島区','東池袋1-8-1','03-7777-8888',null),
        mk('M0014','佐藤','健','サトウ','ケン','1979-03-15','male','174-0041','東京都','板橋区','舟渡1-5-2',null,'090-2222-3333'),
        // 旧字体ペア① 髙橋 vs 高橋
        mk('M0015','髙橋','誠','タカハシ','マコト','1986-08-08','male','231-0023','神奈川県','横浜市中区','山下町70','045-888-9999',null),
        mk('M0016','高橋','誠','タカハシ','マコト','1986-08-08','male','231-0023','神奈川県','横浜市中区','山下町70','045-888-9999',null),
        // 旧字体ペア② 齊藤 vs 斉藤
        mk('M0017','齊藤','律子','サイトウ','リツコ','1974-01-30','female','330-0801','埼玉県','さいたま市大宮区','土手町2-6-4',null,'070-4444-5555'),
        mk('M0018','斉藤','律子','サイトウ','リツコ','1974-01-30','female','330-0801','埼玉県','さいたま市大宮区','土手町2-6-4',null,'070-4444-5555'),
      ]
      students.push(...s)

      const enroll = (
        st: Student, menu: string, date: string, venue: string,
        status: 'pending' | 'confirmed' | 'completed' | 'cancelled',
        appType: 'new' | 'renewal' | 'lapsed', time = '10:00'
      ): Enrollment => ({
        id: id(), student_id: st.id, menu, course_date: date, venue, status,
        extra_json: JSON.stringify({ application_type: appType, course_time: time }),
        note: null, created_at: now(), updated_at: now(),
      })

      const es: Enrollment[] = [
        enroll(s[0],  '2級小型船舶操縦士',        '2026-06-15', '横浜会場', 'confirmed', 'new'),
        enroll(s[1],  '2級小型船舶操縦士（更新）', '2026-06-15', '横浜会場', 'pending',   'renewal'),
        enroll(s[2],  '1級小型船舶操縦士',        '2026-06-22', '東京会場', 'confirmed', 'new', '13:00'),
        enroll(s[3],  '2級小型船舶操縦士（更新）', '2026-07-05', '大阪会場', 'confirmed', 'renewal'),
        enroll(s[4],  '2級小型船舶操縦士（失効）', '2026-07-12', '名古屋会場','pending',  'lapsed'),
        enroll(s[6],  '2級小型船舶操縦士',        '2026-07-20', '仙台会場', 'confirmed', 'new', '09:00'),
        enroll(s[8],  '2級小型船舶操縦士（更新）', '2026-07-26', '福岡会場', 'completed', 'renewal'),
        enroll(s[12], '2級小型船舶操縦士',        '2026-08-03', '東京会場', 'pending',   'new'),
        enroll(s[13], '2級小型船舶操縦士',        '2026-08-03', '東京会場', 'pending',   'new'),
      ]
      enrollments.push(...es)

      // 旧字体ペアを要対応リストに追加
      const pr1: PendingReview = {
        id: id(), student_id: s[14].id, candidate_id: s[15].id,
        match_reasons: JSON.stringify(['旧字体の疑い（髙橋↔高橋）']), match_score: 90,
        status: 'pending', resolution: null,
        created_at: now(), updated_at: now(),
      }
      const pr2: PendingReview = {
        id: id(), student_id: s[16].id, candidate_id: s[17].id,
        match_reasons: JSON.stringify(['旧字体の疑い（齊藤↔斉藤）']), match_score: 90,
        status: 'pending', resolution: null,
        created_at: now(), updated_at: now(),
      }
      pendingReviews.push(
        { ...pr1, student: s[14], candidate: s[15] },
        { ...pr2, student: s[16], candidate: s[17] },
      )

      return Promise.resolve({ students: s.length, enrollments: es.length, pendingReviews: 2 })
    },
  },
}
