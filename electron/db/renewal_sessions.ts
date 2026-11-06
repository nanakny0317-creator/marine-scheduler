import { query, run, Row } from './index'
import type { RenewalSession, RenewalSessionInput } from '../../src/types'

function toRenewalSession(row: Row): RenewalSession {
  return {
    id:          Number(row.id),
    course_date: String(row.course_date ?? ''),
    location:    String(row.location ?? ''),
    start_time:  String(row.start_time ?? ''),
    note:        row.note == null ? null : String(row.note),
    created_at:  String(row.created_at ?? ''),
    updated_at:  String(row.updated_at ?? ''),
  }
}

export function listRenewalSessions(): RenewalSession[] {
  return query(
    'SELECT * FROM renewal_sessions ORDER BY course_date ASC, start_time ASC',
    []
  ).map(toRenewalSession)
}

export function createRenewalSession(input: RenewalSessionInput): RenewalSession {
  const id = run(
    'INSERT INTO renewal_sessions (course_date, location, start_time, note) VALUES (?, ?, ?, ?)',
    [input.course_date, input.location, input.start_time, input.note]
  )
  return query('SELECT * FROM renewal_sessions WHERE id = ?', [id]).map(toRenewalSession)[0]
}

export function updateRenewalSession(id: number, input: RenewalSessionInput): RenewalSession {
  run(
    'UPDATE renewal_sessions SET course_date=?, location=?, start_time=?, note=? WHERE id=?',
    [input.course_date, input.location, input.start_time, input.note, id]
  )
  return query('SELECT * FROM renewal_sessions WHERE id = ?', [id]).map(toRenewalSession)[0]
}

export function deleteRenewalSession(id: number): void {
  run('DELETE FROM renewal_sessions WHERE id = ?', [id])
}
