import { query, run, Row } from './index'
import type { ExamRecord, ExamRecordInput, ExamResult } from '../../src/types'

function toExamRecord(row: Row): ExamRecord {
  return {
    id:                  Number(row.id),
    student_id:          Number(row.student_id),
    enrollment_id:       row.enrollment_id != null ? Number(row.enrollment_id) : null,
    qualification_type:  String(row.qualification_type ?? ''),
    shintai_cert:        Boolean(row.shintai_cert),
    shintai_valid_until: row.shintai_valid_until != null ? String(row.shintai_valid_until) : null,
    gakka_session_id:    row.gakka_session_id != null ? Number(row.gakka_session_id) : null,
    gakka_exam_number:   row.gakka_exam_number != null ? String(row.gakka_exam_number) : null,
    gakka_result:        (row.gakka_result ?? null) as ExamResult,
    gakka_result_date:   row.gakka_result_date != null ? String(row.gakka_result_date) : null,
    jitsugi_session_id:  row.jitsugi_session_id != null ? Number(row.jitsugi_session_id) : null,
    jitsugi_exam_number: row.jitsugi_exam_number != null ? String(row.jitsugi_exam_number) : null,
    jitsugi_result:      (row.jitsugi_result ?? null) as ExamResult,
    jitsugi_result_date: row.jitsugi_result_date != null ? String(row.jitsugi_result_date) : null,
    note:                row.note != null ? String(row.note) : null,
    created_at:          String(row.created_at ?? ''),
    updated_at:          String(row.updated_at ?? ''),
  }
}

export function listExamRecords(studentId: number): ExamRecord[] {
  return query(
    'SELECT * FROM exam_records WHERE student_id = ? ORDER BY created_at DESC',
    [studentId]
  ).map(toExamRecord)
}

export function createExamRecord(input: ExamRecordInput): ExamRecord {
  const id = run(
    `INSERT INTO exam_records
      (student_id, enrollment_id, qualification_type,
       shintai_cert, shintai_valid_until,
       gakka_session_id, gakka_exam_number, gakka_result, gakka_result_date,
       jitsugi_session_id, jitsugi_exam_number, jitsugi_result, jitsugi_result_date,
       note)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      input.student_id, input.enrollment_id ?? null, input.qualification_type,
      input.shintai_cert ? 1 : 0, input.shintai_valid_until ?? null,
      input.gakka_session_id ?? null, input.gakka_exam_number ?? null,
      input.gakka_result ?? null, input.gakka_result_date ?? null,
      input.jitsugi_session_id ?? null, input.jitsugi_exam_number ?? null,
      input.jitsugi_result ?? null, input.jitsugi_result_date ?? null,
      input.note ?? null,
    ]
  )
  return query('SELECT * FROM exam_records WHERE id = ?', [id]).map(toExamRecord)[0]
}

export function updateExamRecord(id: number, input: ExamRecordInput): ExamRecord {
  run(
    `UPDATE exam_records SET
      student_id=?, enrollment_id=?, qualification_type=?,
      shintai_cert=?, shintai_valid_until=?,
      gakka_session_id=?, gakka_exam_number=?, gakka_result=?, gakka_result_date=?,
      jitsugi_session_id=?, jitsugi_exam_number=?, jitsugi_result=?, jitsugi_result_date=?,
      note=?
     WHERE id=?`,
    [
      input.student_id, input.enrollment_id ?? null, input.qualification_type,
      input.shintai_cert ? 1 : 0, input.shintai_valid_until ?? null,
      input.gakka_session_id ?? null, input.gakka_exam_number ?? null,
      input.gakka_result ?? null, input.gakka_result_date ?? null,
      input.jitsugi_session_id ?? null, input.jitsugi_exam_number ?? null,
      input.jitsugi_result ?? null, input.jitsugi_result_date ?? null,
      input.note ?? null,
      id,
    ]
  )
  return query('SELECT * FROM exam_records WHERE id = ?', [id]).map(toExamRecord)[0]
}

export function deleteExamRecord(id: number): void {
  run('DELETE FROM exam_records WHERE id = ?', [id])
}
