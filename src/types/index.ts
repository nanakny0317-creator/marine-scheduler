// ===== 受講者 =====
export interface Student {
  id: number
  student_code: string | null
  license_number: string | null
  last_name: string
  first_name: string
  last_kana: string | null
  first_kana: string | null
  birth_date: string | null
  gender: 'male' | 'female' | 'other' | null
  postal_code: string | null
  prefecture: string | null
  city: string | null
  address1: string | null
  address2: string | null
  // 送付先住所（申請住所と別の場合のみ入力。すべて空なら申請住所へ送付）
  mail_postal_code?: string | null
  mail_prefecture?: string | null
  mail_city?: string | null
  mail_address1?: string | null
  mail_address2?: string | null
  phone: string | null
  mobile: string | null
  email: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export type StudentInput = Omit<Student, 'id' | 'created_at' | 'updated_at'>

export interface StudentSearchParams {
  query?: string
  sortBy?: 'last_name' | 'last_kana' | 'created_at' | 'updated_at'
  sortDir?: 'asc' | 'desc'
  applicationType?: ApplicationType | 'all'
}

export interface DuplicateCandidate {
  student: Student
  score: number
  reasons: string[]
  confidence: 'high' | 'medium' | 'low'
  hint?: string
}

export interface DuplicateCheckResult {
  hasDuplicate: boolean
  candidates: DuplicateCandidate[]
  byName: Student[]      // backward compat
  byAddress: Student[]   // backward compat
}

export interface PendingReview {
  id: number
  student_id: number
  candidate_id: number
  match_reasons: string   // JSON array string
  match_score: number
  status: 'pending' | 'resolved'
  resolution: 'merged' | 'different' | null
  created_at: string
  updated_at: string
}

export interface PendingReviewWithStudents extends PendingReview {
  student: Student
  candidate: Student
}

export interface PendingReviewInput {
  student_id: number
  candidate_id: number
  match_reasons: string
  match_score: number
}

export type ApplicationType = 'new' | 'renewal' | 'lapsed'

// ===== 本文解析結果 =====
export interface ParsedBody {
  // 申込種別
  application_type: ApplicationType  // new=試験申請 renewal=更新講習 lapsed=失効再交付

  // 受講者フィールド
  full_name: string | null
  last_name: string | null
  first_name: string | null
  furigana_full: string | null
  last_kana: string | null
  first_kana: string | null
  postal_code: string | null
  address1: string | null
  address2: string | null
  email: string | null
  phone: string | null
  birth_date: string | null
  gender: 'male' | 'female' | 'other' | null

  // 申込フィールド（extra_json に格納）
  menu: string | null
  course_date: string | null        // 講習日
  course_time: string | null        // 講習時間（例: "14:00"）
  exam_date: string | null          // 試験日（試験申請のみ）
  venue: string | null              // 講習/試験会場
  ruby_preference: boolean | null   // ルビ希望（試験申請のみ）
  domicile: string | null           // 本籍地
  nationality: string | null        // 国籍
  current_license: string | null    // 現有免許
  license_number: string | null     // 免許番号
  license_expiry: string | null     // 有効期限日（更新・失効）
  special_small: string | null      // 特殊小型（試験申請のみ）
  payment_method: string | null     // お支払方法
  purpose: string | null            // 取得目的（試験申請のみ）
  delivery_method: string | null    // 送付方法（更新・失効）
  physical_exam: string | null      // 身体検査（更新・失効）
  record_change: string | null      // 記載事項変更（更新・失効）
  boarding_plan: string | null      // 乗船予定（更新のみ）
  raw_schedule: string | null       // 日程（生テキスト）
}

// ===== 申込 =====
export type EnrollmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled'

export interface Enrollment {
  id: number
  student_id: number
  menu: string
  course_date: string | null
  venue: string | null
  status: EnrollmentStatus
  extra_json: string
  note: string | null
  created_at: string
  updated_at: string
}

export interface EnrollmentInput {
  student_id: number
  menu: string
  course_date: string | null
  venue: string | null
  status: EnrollmentStatus
  extra_json: string
  note: string | null
}

// ===== 更新講習 =====
export interface Renewal {
  id: number
  enrollment_id: number
  documents_collected: boolean
  submitted_to_office: boolean
  license_lost: boolean
  license_expired: boolean
  submission_date: string | null
  note: string | null
  created_at: string
  updated_at: string
}

// ===== 試験日程マスター =====
export interface ExamSession {
  id: number
  exam_date: string
  exam_location: string
  qualification_type: string
  exam_id: string
  exam_type: '学科' | '実技' | '学科+実技'
  gakka_venue: string    // 学科試験会場
  jitsugi_venue: string  // 実技試験会場
  created_at: string
  updated_at: string
}

export type ExamSessionInput = Omit<ExamSession, 'id' | 'created_at' | 'updated_at'>

// ===== 授業会場マスター =====
export interface Classroom {
  id: number
  name: string
  note: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export type ClassroomInput = Omit<Classroom, 'id' | 'created_at' | 'updated_at'>

// ===== 更新講習日程マスター =====
export interface RenewalSession {
  id: number
  course_date: string
  location: string
  start_time: string
  note: string | null
  created_at: string
  updated_at: string
}

export type RenewalSessionInput = Omit<RenewalSession, 'id' | 'created_at' | 'updated_at'>

// ===== 試験記録 =====
export type ExamResult = '合' | '免' | '否' | '不' | null

export interface ExamRecord {
  id: number
  student_id: number
  enrollment_id: number | null
  qualification_type: string

  // 身体検査
  shintai_cert: boolean
  shintai_valid_until: string | null

  // 学科試験
  gakka_session_id: number | null
  gakka_exam_number: string | null
  gakka_result: ExamResult
  gakka_result_date: string | null

  // 実技試験
  jitsugi_session_id: number | null
  jitsugi_exam_number: string | null
  jitsugi_result: ExamResult
  jitsugi_result_date: string | null

  note: string | null
  created_at: string
  updated_at: string
}

export type ExamRecordInput = Omit<ExamRecord, 'id' | 'created_at' | 'updated_at'>

// ===== 会場マスター =====
export interface Venue {
  id: number
  region: string
  prefecture: string
  city: string | null
  name: string
  sort_order: number
  active: boolean
  created_at: string
  updated_at: string
}

export type VenueInput = Omit<Venue, 'id' | 'created_at' | 'updated_at'>

export type DupImportAction = 'merge' | 'defer' | 'new'

export interface DupImportRow {
  student: StudentInput
  enrollment: Omit<EnrollmentInput, 'student_id'>
  dupAction?: DupImportAction
  mergeTargetId?: number
  dupCandidateIds?: number[]
  dupMatchReasons?: string
  dupMatchScore?: number
}

// ===== IPC API =====
export interface ElectronAPI {
  venues: {
    list:    (activeOnly?: boolean, region?: string) => Promise<Venue[]>
    regions: () => Promise<string[]>
    create:  (input: VenueInput)    => Promise<Venue>
    update:  (id: number, input: VenueInput) => Promise<Venue>
    delete:  (id: number)           => Promise<boolean>
  }
  students: {
    list: (params?: StudentSearchParams) => Promise<Student[]>
    get: (id: number) => Promise<Student | null>
    create: (input: StudentInput) => Promise<Student>
    update: (id: number, input: StudentInput) => Promise<Student>
    delete: (id: number) => Promise<boolean>
    checkDuplicate: (input: StudentInput, excludeId?: number) => Promise<DuplicateCheckResult>
    import: (rows: StudentInput[]) => Promise<{ inserted: number; skipped: number }>
    nextCode: () => Promise<string>
    migrateKana: () => Promise<boolean>
  }
  enrollments: {
    create: (input: EnrollmentInput) => Promise<Enrollment>
    list: (studentId: number) => Promise<Enrollment[]>
    importBatch: (
      rows: Array<{ student: StudentInput; enrollment: Omit<EnrollmentInput, 'student_id'> }>
    ) => Promise<{ inserted: number; skipped: number }>
    importWithDup: (rows: DupImportRow[]) => Promise<{ inserted: number; skipped: number }>
    listAll: (applicationType?: string) => Promise<Array<{ enrollment: Enrollment; student: Student }>>
    update: (id: number, input: EnrollmentInput) => Promise<Enrollment>
    delete: (id: number) => Promise<boolean>
  }
  pendingReviews: {
    list: () => Promise<PendingReviewWithStudents[]>
    create: (input: PendingReviewInput) => Promise<PendingReview>
    resolve: (id: number, resolution: 'merged' | 'different') => Promise<boolean>
    merge: (id: number, keepStudentId: number) => Promise<boolean>
  }
  examSessions: {
    list:   () => Promise<ExamSession[]>
    create: (input: ExamSessionInput) => Promise<ExamSession>
    update: (id: number, input: ExamSessionInput) => Promise<ExamSession>
    delete: (id: number) => Promise<boolean>
    upsert: (rows: ExamSessionInput[]) => Promise<{ inserted: number; updated: number }>
  }
  classrooms: {
    list:   () => Promise<Classroom[]>
    create: (input: ClassroomInput) => Promise<Classroom>
    update: (id: number, input: ClassroomInput) => Promise<Classroom>
    delete: (id: number) => Promise<boolean>
  }
  renewalSessions: {
    list:   () => Promise<RenewalSession[]>
    create: (input: RenewalSessionInput) => Promise<RenewalSession>
    update: (id: number, input: RenewalSessionInput) => Promise<RenewalSession>
    delete: (id: number) => Promise<boolean>
  }
  examRecords: {
    list:   (studentId: number) => Promise<ExamRecord[]>
    create: (input: ExamRecordInput) => Promise<ExamRecord>
    update: (id: number, input: ExamRecordInput) => Promise<ExamRecord>
    delete: (id: number) => Promise<boolean>
  }
  print: {
    html: (html: string) => Promise<void>
  }
  dev: {
    counts: () => Promise<{ students: number; enrollments: number; pendingReviews: number }>
    resetAll: () => Promise<boolean>
    seed: () => Promise<{ students: number; enrollments: number; pendingReviews: number }>
  }
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
