import { query, run, Row } from './index'
import type { PhysicalExam, PhysicalExamInput } from '../../src/types'

function toPhysicalExam(row: Row): PhysicalExam {
  return {
    id:          Number(row.id),
    student_id:  Number(row.student_id),
    exam_date:   row.exam_date != null ? String(row.exam_date) : null,
    valid_until: row.valid_until != null ? String(row.valid_until) : null,
    note:        row.note != null ? String(row.note) : null,
    created_at:  String(row.created_at ?? ''),
    updated_at:  String(row.updated_at ?? ''),
  }
}

/** 新しい順（受検日 → 登録日） */
export function listPhysicalExams(studentId: number): PhysicalExam[] {
  return query(
    `SELECT * FROM physical_exams WHERE student_id = ?
     ORDER BY COALESCE(exam_date, valid_until) DESC, created_at DESC`,
    [studentId]
  ).map(toPhysicalExam)
}

export function createPhysicalExam(input: PhysicalExamInput): PhysicalExam {
  const id = run(
    'INSERT INTO physical_exams (student_id, exam_date, valid_until, note) VALUES (?,?,?,?)',
    [input.student_id, input.exam_date || null, input.valid_until || null, input.note?.trim() || null]
  )
  return query('SELECT * FROM physical_exams WHERE id = ?', [id]).map(toPhysicalExam)[0]
}

export function updatePhysicalExam(id: number, input: PhysicalExamInput): PhysicalExam {
  run(
    'UPDATE physical_exams SET student_id=?, exam_date=?, valid_until=?, note=? WHERE id=?',
    [input.student_id, input.exam_date || null, input.valid_until || null, input.note?.trim() || null, id]
  )
  return query('SELECT * FROM physical_exams WHERE id = ?', [id]).map(toPhysicalExam)[0]
}

export function deletePhysicalExam(id: number): void {
  run('DELETE FROM physical_exams WHERE id = ?', [id])
}
