import { query, run, Row } from './index'
import type { Classroom, ClassroomInput } from '../../src/types'

function toClassroom(row: Row): Classroom {
  return {
    id:         Number(row.id),
    name:       String(row.name ?? ''),
    note:       row.note == null ? null : String(row.note),
    sort_order: Number(row.sort_order ?? 0),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

export function listClassrooms(): Classroom[] {
  return query('SELECT * FROM classrooms ORDER BY sort_order ASC, name ASC', []).map(toClassroom)
}

export function createClassroom(input: ClassroomInput): Classroom {
  const id = run(
    'INSERT INTO classrooms (name, note, sort_order) VALUES (?, ?, ?)',
    [input.name, input.note, input.sort_order]
  )
  return query('SELECT * FROM classrooms WHERE id = ?', [id]).map(toClassroom)[0]
}

export function updateClassroom(id: number, input: ClassroomInput): Classroom {
  run(
    'UPDATE classrooms SET name=?, note=?, sort_order=? WHERE id=?',
    [input.name, input.note, input.sort_order, id]
  )
  return query('SELECT * FROM classrooms WHERE id = ?', [id]).map(toClassroom)[0]
}

export function deleteClassroom(id: number): void {
  run('DELETE FROM classrooms WHERE id = ?', [id])
}
