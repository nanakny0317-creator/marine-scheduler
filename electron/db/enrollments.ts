import { query, queryOne, run, transaction, Row } from './index'
import { createStudent, updateStudent } from './students'
import { createPendingReview } from './pending_reviews'
import type { Enrollment, EnrollmentInput, Student, StudentInput, DupImportRow } from '../../src/types'

type SqlParam = string | number | null | Uint8Array

function toEnrollment(row: Row): Enrollment {
  return {
    id: Number(row.id),
    student_id: Number(row.student_id),
    menu: String(row.menu ?? ''),
    course_date: row.course_date ? String(row.course_date) : null,
    venue: row.venue ? String(row.venue) : null,
    status: (row.status as Enrollment['status']) ?? 'pending',
    extra_json: String(row.extra_json ?? '{}'),
    note: row.note ? String(row.note) : null,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

export function createEnrollment(input: EnrollmentInput): Enrollment {
  const id = run(
    `INSERT INTO enrollments
       (student_id, menu, course_date, venue, status, extra_json, note,
        created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,
             datetime('now','localtime'), datetime('now','localtime'))`,
    [
      input.student_id,
      input.menu,
      input.course_date ?? null,
      input.venue ?? null,
      input.status,
      input.extra_json,
      input.note ?? null,
    ] as SqlParam[]
  )
  return toEnrollment(queryOne('SELECT * FROM enrollments WHERE id=?', [id])!)
}

export function listEnrollments(studentId: number): Enrollment[] {
  return query(
    'SELECT * FROM enrollments WHERE student_id=? ORDER BY created_at DESC',
    [studentId]
  ).map(toEnrollment)
}

export function updateEnrollment(id: number, input: EnrollmentInput): Enrollment {
  const existing = queryOne('SELECT id FROM enrollments WHERE id=?', [id])
  if (!existing) throw new Error('申込が見つかりません')

  run(
    `UPDATE enrollments SET
       student_id = ?,
       menu = ?,
       course_date = ?,
       venue = ?,
       status = ?,
       extra_json = ?,
       note = ?,
       updated_at = datetime('now','localtime')
     WHERE id = ?`,
    [
      input.student_id,
      input.menu,
      input.course_date ?? null,
      input.venue ?? null,
      input.status,
      input.extra_json,
      input.note ?? null,
      id,
    ] as SqlParam[]
  )
  return toEnrollment(queryOne('SELECT * FROM enrollments WHERE id=?', [id])!)
}

/** 申込のみ削除（受講者レコードは残す） */
export function deleteEnrollment(id: number): boolean {
  const row = queryOne('SELECT id FROM enrollments WHERE id=?', [id])
  if (!row) return false
  run('DELETE FROM enrollments WHERE id=?', [id])
  return true
}

/**
 * 受講者＋申込をまとめてインポートする（トランザクション）
 */
export function importWithEnrollments(
  rows: Array<{
    student: StudentInput
    enrollment: Omit<EnrollmentInput, 'student_id'>
  }>
): { inserted: number; skipped: number } {
  let inserted = 0
  let skipped = 0

  transaction(() => {
    for (const { student, enrollment } of rows) {
      if (!student.last_name?.trim() && !student.first_name?.trim()) {
        skipped++
        continue
      }
      try {
        const s = createStudent(student)
        createEnrollment({ ...enrollment, student_id: s.id })
        inserted++
      } catch {
        skipped++
      }
    }
  })

  return { inserted, skipped }
}

/**
 * 重複対応付きインポート（merge / defer / new の3種）
 */
export function importWithDupHandling(rows: DupImportRow[]): { inserted: number; skipped: number } {
  let inserted = 0
  let skipped = 0

  for (const { student, enrollment, dupAction, mergeTargetId, dupCandidateIds, dupMatchReasons, dupMatchScore } of rows) {
    if (!student.last_name?.trim() && !student.first_name?.trim()) { skipped++; continue }
    try {
      if (dupAction === 'merge' && mergeTargetId) {
        // 既存会員を更新して申込を紐付け
        updateStudent(mergeTargetId, student)
        createEnrollment({ ...enrollment, student_id: mergeTargetId })
      } else if (dupAction === 'defer') {
        // 新規作成＋備考に要確認記載＋pending_review
        const notePrefix = '【要確認】重複の可能性あり'
        const s = createStudent({
          ...student,
          note: student.note ? `${notePrefix}\n${student.note}` : notePrefix,
        })
        createEnrollment({ ...enrollment, student_id: s.id })
        for (const candidateId of (dupCandidateIds ?? [])) {
          createPendingReview({
            student_id: s.id,
            candidate_id: candidateId,
            match_reasons: dupMatchReasons ?? '[]',
            match_score: dupMatchScore ?? 0,
          })
        }
      } else {
        // 通常新規作成
        const s = createStudent(student)
        createEnrollment({ ...enrollment, student_id: s.id })
      }
      inserted++
    } catch {
      skipped++
    }
  }

  return { inserted, skipped }
}

/**
 * 全申込＋受講者を結合して返す（セッション表示用）
 * applicationType: 'new' | 'renewal' | 'lapsed' | 'all' | undefined
 */
export function listAllWithStudents(
  applicationType?: string
): Array<{ enrollment: Enrollment; student: Student }> {
  const params: SqlParam[] = []
  let typeFilter = ''
  if (applicationType && applicationType !== 'all') {
    typeFilter = `AND json_extract(e.extra_json, '$.application_type') = ?`
    params.push(applicationType)
  }

  const rows = query(
    `SELECT
       e.id          AS e_id,
       e.student_id,
       e.menu,
       e.course_date,
       e.venue,
       e.status,
       e.extra_json,
       e.note        AS e_note,
       e.created_at  AS e_created_at,
       e.updated_at  AS e_updated_at,
       s.id          AS s_id,
       s.student_code,
       s.last_name,  s.first_name,
       s.last_kana,  s.first_kana,
       s.birth_date, s.gender,
       s.postal_code, s.prefecture, s.city,
       s.address1,   s.address2,
       s.phone,      s.mobile,     s.email,
       s.note        AS s_note,
       s.created_at  AS s_created_at,
       s.updated_at  AS s_updated_at
     FROM enrollments e
     JOIN students s ON s.id = e.student_id
     WHERE 1=1 ${typeFilter}
     ORDER BY
       CASE WHEN e.course_date IS NULL THEN 1 ELSE 0 END,
       e.course_date ASC,
       e.venue       ASC,
       COALESCE(s.last_kana, s.last_name) ASC`,
    params
  )

  return rows.map((row) => ({
    enrollment: {
      id:         Number(row.e_id),
      student_id: Number(row.student_id),
      menu:       String(row.menu ?? ''),
      course_date: row.course_date ? String(row.course_date) : null,
      venue:       row.venue       ? String(row.venue)       : null,
      status:     (row.status as Enrollment['status']) ?? 'pending',
      extra_json:  String(row.extra_json ?? '{}'),
      note:        row.e_note ? String(row.e_note) : null,
      created_at:  String(row.e_created_at ?? ''),
      updated_at:  String(row.e_updated_at ?? ''),
    } satisfies Enrollment,
    student: {
      id:           Number(row.s_id),
      student_code: row.student_code ? String(row.student_code) : null,
      last_name:    String(row.last_name  ?? ''),
      first_name:  String(row.first_name ?? ''),
      last_kana:   row.last_kana  ? String(row.last_kana)  : null,
      first_kana:  row.first_kana ? String(row.first_kana) : null,
      birth_date:  row.birth_date ? String(row.birth_date) : null,
      gender:      (row.gender as Student['gender']) ?? null,
      postal_code: row.postal_code ? String(row.postal_code) : null,
      prefecture:  row.prefecture  ? String(row.prefecture)  : null,
      city:        row.city        ? String(row.city)        : null,
      address1:    row.address1    ? String(row.address1)    : null,
      address2:    row.address2    ? String(row.address2)    : null,
      phone:       row.phone  ? String(row.phone)  : null,
      mobile:      row.mobile ? String(row.mobile) : null,
      email:       row.email  ? String(row.email)  : null,
      note:        row.s_note ? String(row.s_note) : null,
      created_at:  String(row.s_created_at ?? ''),
      updated_at:  String(row.s_updated_at ?? ''),
    } satisfies Student,
  }))
}
