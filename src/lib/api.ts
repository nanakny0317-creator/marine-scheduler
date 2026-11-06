/**
 * レンダラーから window.api を呼ぶラッパー
 * 将来 Supabase に切り替える場合はここだけ差し替える
 */
import type {
  Student, StudentInput, StudentSearchParams, DuplicateCheckResult,
  Enrollment, EnrollmentInput,
  Venue, VenueInput,
  ExamSession, ExamSessionInput,
  RenewalSession, RenewalSessionInput,
  Classroom, ClassroomInput,
  ExamRecord, ExamRecordInput,
  PendingReview, PendingReviewInput, PendingReviewWithStudents,
  DupImportRow,
} from '../types'

export const venuesApi = {
  list: (activeOnly?: boolean, region?: string): Promise<Venue[]> =>
    window.api.venues.list(activeOnly, region),

  regions: (): Promise<string[]> =>
    window.api.venues.regions(),

  create: (input: VenueInput): Promise<Venue> =>
    window.api.venues.create(input),

  update: (id: number, input: VenueInput): Promise<Venue> =>
    window.api.venues.update(id, input),

  delete: (id: number): Promise<boolean> =>
    window.api.venues.delete(id),
}

export const studentsApi = {
  list: (params?: StudentSearchParams): Promise<Student[]> =>
    window.api.students.list(params),

  get: (id: number): Promise<Student | null> =>
    window.api.students.get(id),

  create: (input: StudentInput): Promise<Student> =>
    window.api.students.create(input),

  /** 重複の統合：空欄の項目は既存の値を引き継ぐ */
  merge: (id: number, input: StudentInput): Promise<Student> =>
    window.api.students.merge(id, input),

  update: (id: number, input: StudentInput): Promise<Student> =>
    window.api.students.update(id, input),

  delete: (id: number): Promise<boolean> =>
    window.api.students.delete(id),

  checkDuplicate: (input: StudentInput, excludeId?: number): Promise<DuplicateCheckResult> =>
    window.api.students.checkDuplicate(input, excludeId),

  import: (rows: StudentInput[]): Promise<{ inserted: number; skipped: number }> =>
    window.api.students.import(rows),

  nextCode: (): Promise<string> =>
    window.api.students.nextCode(),

  migrateKana: (): Promise<boolean> =>
    window.api.students.migrateKana(),
}

export const enrollmentsApi = {
  create: (input: EnrollmentInput): Promise<Enrollment> =>
    window.api.enrollments.create(input),

  list: (studentId: number): Promise<Enrollment[]> =>
    window.api.enrollments.list(studentId),

  importBatch: (
    rows: Array<{ student: StudentInput; enrollment: Omit<EnrollmentInput, 'student_id'> }>
  ): Promise<{ inserted: number; skipped: number }> =>
    window.api.enrollments.importBatch(rows),

  importWithDup: (rows: DupImportRow[]): Promise<{ inserted: number; skipped: number }> =>
    window.api.enrollments.importWithDup(rows),

  listAll: (applicationType?: string): Promise<Array<{ enrollment: Enrollment; student: Student }>> =>
    window.api.enrollments.listAll(applicationType),

  update: (id: number, input: EnrollmentInput): Promise<Enrollment> =>
    window.api.enrollments.update(id, input),

  delete: (id: number): Promise<boolean> =>
    window.api.enrollments.delete(id),
}

export const examSessionsApi = {
  list: (): Promise<ExamSession[]> =>
    window.api.examSessions.list(),

  create: (input: ExamSessionInput): Promise<ExamSession> =>
    window.api.examSessions.create(input),

  update: (id: number, input: ExamSessionInput): Promise<ExamSession> =>
    window.api.examSessions.update(id, input),

  delete: (id: number): Promise<boolean> =>
    window.api.examSessions.delete(id),

  upsert: (rows: ExamSessionInput[]): Promise<{ inserted: number; updated: number }> =>
    window.api.examSessions.upsert(rows),
}

export const classroomsApi = {
  list: (): Promise<Classroom[]> =>
    window.api.classrooms.list(),

  create: (input: ClassroomInput): Promise<Classroom> =>
    window.api.classrooms.create(input),

  update: (id: number, input: ClassroomInput): Promise<Classroom> =>
    window.api.classrooms.update(id, input),

  delete: (id: number): Promise<boolean> =>
    window.api.classrooms.delete(id),
}

export const renewalSessionsApi = {
  list: (): Promise<RenewalSession[]> =>
    window.api.renewalSessions.list(),

  create: (input: RenewalSessionInput): Promise<RenewalSession> =>
    window.api.renewalSessions.create(input),

  update: (id: number, input: RenewalSessionInput): Promise<RenewalSession> =>
    window.api.renewalSessions.update(id, input),

  delete: (id: number): Promise<boolean> =>
    window.api.renewalSessions.delete(id),
}

export const examRecordsApi = {
  list:   (studentId: number): Promise<ExamRecord[]> =>
    window.api.examRecords.list(studentId),
  create: (input: ExamRecordInput): Promise<ExamRecord> =>
    window.api.examRecords.create(input),
  update: (id: number, input: ExamRecordInput): Promise<ExamRecord> =>
    window.api.examRecords.update(id, input),
  delete: (id: number): Promise<boolean> =>
    window.api.examRecords.delete(id),
}

export const pendingReviewsApi = {
  list: (): Promise<PendingReviewWithStudents[]> =>
    window.api.pendingReviews.list(),

  create: (input: PendingReviewInput): Promise<PendingReview> =>
    window.api.pendingReviews.create(input),

  resolve: (id: number, resolution: 'merged' | 'different'): Promise<boolean> =>
    window.api.pendingReviews.resolve(id, resolution),

  merge: (id: number, keepStudentId: number): Promise<boolean> =>
    window.api.pendingReviews.merge(id, keepStudentId),
}

export const devApi = {
  counts: (): Promise<{ students: number; enrollments: number; pendingReviews: number }> =>
    window.api.dev.counts(),
  resetAll: (): Promise<boolean> =>
    window.api.dev.resetAll(),
  seed: (): Promise<{ students: number; enrollments: number; pendingReviews: number }> =>
    window.api.dev.seed(),
}

/**
 * 郵便番号→住所検索（zipcloud API）
 */
export async function fetchAddressByZip(
  zip: string
): Promise<{ prefecture: string; city: string; address1: string } | null> {
  const cleaned = zip.replace(/[^0-9]/g, '')
  if (cleaned.length !== 7) return null

  try {
    const res = await fetch(
      `https://zipcloud.ibsnet.co.jp/api/search?zipcode=${cleaned}`
    )
    const data = await res.json()
    if (data.status === 200 && data.results?.length > 0) {
      const r = data.results[0]
      return {
        prefecture: r.address1,
        city: r.address2,
        address1: r.address3,
      }
    }
  } catch {
    // ネットワークエラーは無視
  }
  return null
}
