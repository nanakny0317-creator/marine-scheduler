/**
 * レンダラーから window.api を呼ぶラッパー
 * 将来 Supabase に切り替える場合はここだけ差し替える
 */
import type {
  Student, StudentInput, StudentSearchParams, DuplicateCheckResult,
  Enrollment, EnrollmentInput,
  Venue, VenueInput,
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

  listAll: (applicationType?: string): Promise<Array<{ enrollment: Enrollment; student: Student }>> =>
    window.api.enrollments.listAll(applicationType),

  update: (id: number, input: EnrollmentInput): Promise<Enrollment> =>
    window.api.enrollments.update(id, input),

  delete: (id: number): Promise<boolean> =>
    window.api.enrollments.delete(id),
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
