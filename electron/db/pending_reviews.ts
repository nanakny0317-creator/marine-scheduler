import { query, queryOne, run, Row } from './index'
import type {
  PendingReview,
  PendingReviewInput,
  PendingReviewWithStudents,
  Student,
} from '../../src/types'

function toPendingReview(row: Row): PendingReview {
  return {
    id: Number(row.id),
    student_id: Number(row.student_id),
    candidate_id: Number(row.candidate_id),
    match_reasons: String(row.match_reasons ?? '[]'),
    match_score: Number(row.match_score ?? 0),
    status: (row.status as PendingReview['status']) ?? 'pending',
    resolution: (row.resolution as PendingReview['resolution']) ?? null,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

function toStudent(row: Row, prefix: string): Student {
  const g = (k: string) => row[`${prefix}_${k}`]
  return {
    id: Number(g('id')),
    student_code: g('student_code') ? String(g('student_code')) : null,
    license_number: g('license_number') ? String(g('license_number')) : null,
    last_name: String(g('last_name') ?? ''),
    first_name: String(g('first_name') ?? ''),
    last_kana: g('last_kana') ? String(g('last_kana')) : null,
    first_kana: g('first_kana') ? String(g('first_kana')) : null,
    birth_date: g('birth_date') ? String(g('birth_date')) : null,
    gender: (g('gender') as Student['gender']) ?? null,
    postal_code: g('postal_code') ? String(g('postal_code')) : null,
    prefecture: g('prefecture') ? String(g('prefecture')) : null,
    city: g('city') ? String(g('city')) : null,
    address1: g('address1') ? String(g('address1')) : null,
    address2: g('address2') ? String(g('address2')) : null,
    phone: g('phone') ? String(g('phone')) : null,
    mobile: g('mobile') ? String(g('mobile')) : null,
    email: g('email') ? String(g('email')) : null,
    note: g('note') ? String(g('note')) : null,
    created_at: String(g('created_at') ?? ''),
    updated_at: String(g('updated_at') ?? ''),
  }
}

export function createPendingReview(input: PendingReviewInput): PendingReview {
  const id = run(
    `INSERT INTO pending_reviews (student_id, candidate_id, match_reasons, match_score, status, resolution, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', NULL, datetime('now','localtime'), datetime('now','localtime'))`,
    [input.student_id, input.candidate_id, input.match_reasons, input.match_score]
  )
  return toPendingReview(queryOne('SELECT * FROM pending_reviews WHERE id=?', [id])!)
}

export function listPendingReviews(): PendingReviewWithStudents[] {
  const rows = query(
    `SELECT
       pr.id, pr.student_id, pr.candidate_id, pr.match_reasons, pr.match_score,
       pr.status, pr.resolution, pr.created_at, pr.updated_at,
       s.id AS s_id, s.student_code AS s_student_code, s.license_number AS s_license_number,
       s.last_name AS s_last_name, s.first_name AS s_first_name,
       s.last_kana AS s_last_kana, s.first_kana AS s_first_kana,
       s.birth_date AS s_birth_date, s.gender AS s_gender,
       s.postal_code AS s_postal_code, s.prefecture AS s_prefecture,
       s.city AS s_city, s.address1 AS s_address1, s.address2 AS s_address2,
       s.phone AS s_phone, s.mobile AS s_mobile, s.email AS s_email,
       s.note AS s_note, s.created_at AS s_created_at, s.updated_at AS s_updated_at,
       c.id AS c_id, c.student_code AS c_student_code, c.license_number AS c_license_number,
       c.last_name AS c_last_name, c.first_name AS c_first_name,
       c.last_kana AS c_last_kana, c.first_kana AS c_first_kana,
       c.birth_date AS c_birth_date, c.gender AS c_gender,
       c.postal_code AS c_postal_code, c.prefecture AS c_prefecture,
       c.city AS c_city, c.address1 AS c_address1, c.address2 AS c_address2,
       c.phone AS c_phone, c.mobile AS c_mobile, c.email AS c_email,
       c.note AS c_note, c.created_at AS c_created_at, c.updated_at AS c_updated_at
     FROM pending_reviews pr
     JOIN students s ON s.id = pr.student_id
     JOIN students c ON c.id = pr.candidate_id
     WHERE pr.status = 'pending'
     ORDER BY pr.created_at DESC`
  )

  return rows.map((row) => ({
    ...toPendingReview(row),
    student: toStudent(row, 's'),
    candidate: toStudent(row, 'c'),
  }))
}

export function resolvePendingReview(id: number, resolution: 'merged' | 'different'): boolean {
  const row = queryOne('SELECT id FROM pending_reviews WHERE id=?', [id])
  if (!row) return false
  run(
    `UPDATE pending_reviews SET status='resolved', resolution=? WHERE id=?`,
    [resolution, id]
  )
  return true
}

export function mergePendingReview(id: number, keepStudentId: number): boolean {
  const pr = queryOne('SELECT student_id, candidate_id FROM pending_reviews WHERE id=?', [id])
  if (!pr) return false

  const sId = Number(pr.student_id)
  const cId = Number(pr.candidate_id)
  const deleteId = keepStudentId === sId ? cId : sId

  // Transfer enrollments to kept student
  run('UPDATE enrollments SET student_id=? WHERE student_id=?', [keepStudentId, deleteId])

  // Resolve all pending_reviews that reference the deleted student
  run(
    `UPDATE pending_reviews SET status='resolved', resolution='merged'
     WHERE (student_id=? OR candidate_id=?) AND status='pending'`,
    [deleteId, deleteId]
  )

  // Delete the duplicate student record
  run('DELETE FROM students WHERE id=?', [deleteId])

  // Resolve this review (may already be resolved above, safe to run again)
  run(
    `UPDATE pending_reviews SET status='resolved', resolution='merged' WHERE id=?`,
    [id]
  )

  return true
}
