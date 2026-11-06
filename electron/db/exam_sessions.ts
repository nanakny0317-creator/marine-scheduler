import { query, run, Row } from './index'
import type { ExamSession, ExamSessionInput } from '../../src/types'

function toExamSession(row: Row): ExamSession {
  return {
    id:                 Number(row.id),
    exam_date:          String(row.exam_date ?? ''),
    exam_location:      String(row.exam_location ?? ''),
    qualification_type: String(row.qualification_type ?? ''),
    exam_id:            String(row.exam_id ?? ''),
    exam_type:          String(row.exam_type ?? '学科+実技') as '学科' | '実技' | '学科+実技',
    gakka_venue:        String(row.gakka_venue ?? ''),
    jitsugi_venue:      String(row.jitsugi_venue ?? ''),
    created_at:         String(row.created_at ?? ''),
    updated_at:         String(row.updated_at ?? ''),
  }
}

export function listExamSessions(): ExamSession[] {
  return query(
    'SELECT * FROM exam_sessions ORDER BY exam_date ASC, qualification_type ASC',
    []
  ).map(toExamSession)
}

export function createExamSession(input: ExamSessionInput): ExamSession {
  const id = run(
    `INSERT INTO exam_sessions (exam_date, exam_location, qualification_type, exam_id, exam_type, gakka_venue, jitsugi_venue)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [input.exam_date, input.exam_location, input.qualification_type, input.exam_id, input.exam_type, input.gakka_venue ?? '', input.jitsugi_venue ?? '']
  )
  return query('SELECT * FROM exam_sessions WHERE id = ?', [id]).map(toExamSession)[0]
}

export function updateExamSession(id: number, input: ExamSessionInput): ExamSession {
  run(
    `UPDATE exam_sessions SET exam_date=?, exam_location=?, qualification_type=?, exam_id=?, exam_type=?, gakka_venue=?, jitsugi_venue=? WHERE id=?`,
    [input.exam_date, input.exam_location, input.qualification_type, input.exam_id, input.exam_type, input.gakka_venue ?? '', input.jitsugi_venue ?? '', id]
  )
  return query('SELECT * FROM exam_sessions WHERE id = ?', [id]).map(toExamSession)[0]
}

export function deleteExamSession(id: number): void {
  run('DELETE FROM exam_sessions WHERE id = ?', [id])
}

export function upsertExamSessions(rows: ExamSessionInput[]): { inserted: number; updated: number } {
  let inserted = 0
  let updated = 0
  for (const row of rows) {
    const existing = query(
      'SELECT id FROM exam_sessions WHERE exam_date=? AND exam_location=? AND qualification_type=?',
      [row.exam_date, row.exam_location, row.qualification_type]
    )
    if (existing.length > 0) {
      run(
        `UPDATE exam_sessions SET exam_id=?, exam_type=?, gakka_venue=?, jitsugi_venue=? WHERE id=?`,
        [row.exam_id, row.exam_type, row.gakka_venue ?? '', row.jitsugi_venue ?? '', Number(existing[0].id)]
      )
      updated++
    } else {
      run(
        `INSERT INTO exam_sessions (exam_date, exam_location, qualification_type, exam_id, exam_type, gakka_venue, jitsugi_venue) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [row.exam_date, row.exam_location, row.qualification_type, row.exam_id, row.exam_type, row.gakka_venue ?? '', row.jitsugi_venue ?? '']
      )
      inserted++
    }
  }
  return { inserted, updated }
}
