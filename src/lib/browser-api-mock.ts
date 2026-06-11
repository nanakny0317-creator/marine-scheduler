/**
 * ブラウザモード（ELECTRON_MODE=browser）で window.api が存在しない場合に使う
 * インメモリのスタブ実装。UI 開発・レイアウト確認用。
 */
import type {
  ElectronAPI,
  Student, StudentInput, StudentSearchParams,
  Enrollment, EnrollmentInput,
  Venue, VenueInput,
  DuplicateCheckResult, PendingReview, PendingReviewInput,
  PendingReviewWithStudents, DupImportRow,
} from '../types'

// ── インメモリストア ───────────────────────────────────────
let students: Student[] = []
let enrollments: Enrollment[] = []
let venues: Venue[] = []
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
      students = []; enrollments = []; venues = []; pendingReviews = []; nextId = 1
      return Promise.resolve(true)
    },
    seed: () => {
      // 最小限のテストデータを投入
      const s1 = { id: id(), student_code: 'M0001', license_number: null, last_name: '山田', first_name: '太郎', last_kana: 'ヤマダ', first_kana: 'タロウ', birth_date: '1985-04-01', gender: 'male' as const, postal_code: '150-0001', prefecture: '東京都', city: '渋谷区', address1: '神南1-1-1', address2: null, phone: '03-1234-5678', mobile: null, email: null, note: null, created_at: now(), updated_at: now() }
      const s2 = { id: id(), student_code: 'M0002', license_number: null, last_name: '鈴木', first_name: '花子', last_kana: 'スズキ', first_kana: 'ハナコ', birth_date: '1990-07-15', gender: 'female' as const, postal_code: '160-0022', prefecture: '東京都', city: '新宿区', address1: '新宿3-2-1', address2: null, phone: null, mobile: '090-8765-4321', email: null, note: null, created_at: now(), updated_at: now() }
      students.push(s1, s2)
      const e1: Enrollment = { id: id(), student_id: s1.id, menu: '2級小型船舶操縦士', course_date: '2026-06-01', venue: '横浜会場', status: 'confirmed', extra_json: JSON.stringify({ application_type: 'new', course_time: '10:00' }), note: null, created_at: now(), updated_at: now() }
      const e2: Enrollment = { id: id(), student_id: s2.id, menu: '2級小型船舶操縦士（更新）', course_date: '2026-06-01', venue: '横浜会場', status: 'pending', extra_json: JSON.stringify({ application_type: 'renewal', course_time: '10:00' }), note: null, created_at: now(), updated_at: now() }
      enrollments.push(e1, e2)
      return Promise.resolve({ students: 2, enrollments: 2, pendingReviews: 0 })
    },
  },
}
