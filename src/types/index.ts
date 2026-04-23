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
  application_type: ApplicationType  // new=受講申請 renewal=更新講習 lapsed=失効再交付

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
  exam_date: string | null          // 試験日（受講申請のみ）
  venue: string | null              // 講習/試験会場
  ruby_preference: boolean | null   // ルビ希望（受講申請のみ）
  domicile: string | null           // 本籍地
  nationality: string | null        // 国籍
  current_license: string | null    // 現有免許
  license_number: string | null     // 免許番号
  license_expiry: string | null     // 有効期限日（更新・失効）
  special_small: string | null      // 特殊小型（受講申請のみ）
  payment_method: string | null     // お支払方法
  purpose: string | null            // 取得目的（受講申請のみ）
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
