import { query, queryOne, run, transaction, Row } from './index'
type SqlParam = string | number | null | Uint8Array
import type {
  Student,
  StudentInput,
  StudentSearchParams,
  DuplicateCheckResult,
} from '../../src/types'

function toStudent(row: Row): Student {
  return {
    id: Number(row.id),
    student_code: row.student_code ? String(row.student_code) : null,
    last_name: String(row.last_name ?? ''),
    first_name: String(row.first_name ?? ''),
    last_kana: row.last_kana ? String(row.last_kana) : null,
    first_kana: row.first_kana ? String(row.first_kana) : null,
    birth_date: row.birth_date ? String(row.birth_date) : null,
    gender: (row.gender as Student['gender']) ?? null,
    postal_code: row.postal_code ? String(row.postal_code) : null,
    prefecture: row.prefecture ? String(row.prefecture) : null,
    city: row.city ? String(row.city) : null,
    address1: row.address1 ? String(row.address1) : null,
    address2: row.address2 ? String(row.address2) : null,
    phone: row.phone ? String(row.phone) : null,
    mobile: row.mobile ? String(row.mobile) : null,
    email: row.email ? String(row.email) : null,
    note: row.note ? String(row.note) : null,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

// -------- 次の受講者番号を生成（000001 〜） --------
export function nextStudentCode(): string {
  const row = queryOne(
    `SELECT student_code FROM students
     WHERE student_code GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'
     ORDER BY student_code DESC LIMIT 1`
  )
  const last = row?.student_code ? parseInt(String(row.student_code), 10) : 0
  return String(last + 1).padStart(6, '0')
}

// -------- 一覧・検索 --------
export function listStudents(params: StudentSearchParams = {}): Student[] {
  const { query: q, sortBy = 'created_at', sortDir = 'desc', applicationType } = params
  const allowed = ['last_name', 'last_kana', 'created_at', 'updated_at']
  const col = allowed.includes(sortBy ?? '') ? sortBy : 'created_at'
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC'

  // 申込種別フィルター（enrollments.extra_json の application_type で絞り込む）
  let typeClause = ''
  const typeParams: SqlParam[] = []
  if (applicationType && applicationType !== 'all') {
    typeClause = `AND id IN (
      SELECT student_id FROM enrollments
      WHERE json_extract(extra_json, '$.application_type') = ?
    )`
    typeParams.push(applicationType)
  }

  if (q && q.trim()) {
    const like = `%${q.trim()}%`
    return query(
      `SELECT * FROM students
       WHERE (last_name LIKE ? OR first_name LIKE ?
          OR last_kana LIKE ? OR first_kana LIKE ?
          OR email LIKE ? OR phone LIKE ? OR mobile LIKE ?)
       ${typeClause}
       ORDER BY ${col} ${dir}`,
      [like, like, like, like, like, like, like, ...typeParams]
    ).map(toStudent)
  }

  return query(
    `SELECT * FROM students WHERE 1=1 ${typeClause} ORDER BY ${col} ${dir}`,
    typeParams
  ).map(toStudent)
}

// -------- 1件取得 --------
export function getStudent(id: number): Student | null {
  const row = queryOne('SELECT * FROM students WHERE id = ?', [id])
  return row ? toStudent(row) : null
}

// -------- 作成 --------
export function createStudent(input: StudentInput): Student {
  const code = input.student_code?.trim() || nextStudentCode()
  const id = run(
    `INSERT INTO students
       (student_code, last_name, first_name, last_kana, first_kana, birth_date, gender,
        postal_code, prefecture, city, address1, address2,
        phone, mobile, email, note,
        created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,
             datetime('now','localtime'), datetime('now','localtime'))`,
    [
      code,
      input.last_name, input.first_name,
      input.last_kana ?? null, input.first_kana ?? null,
      input.birth_date ?? null, input.gender ?? null,
      input.postal_code ?? null, input.prefecture ?? null,
      input.city ?? null, input.address1 ?? null, input.address2 ?? null,
      input.phone ?? null, input.mobile ?? null,
      input.email ?? null, input.note ?? null,
    ]
  )
  return getStudent(id)!
}

// -------- 更新 --------
export function updateStudent(id: number, input: StudentInput): Student {
  run(
    `UPDATE students SET
       student_code=?,
       last_name=?, first_name=?, last_kana=?, first_kana=?,
       birth_date=?, gender=?,
       postal_code=?, prefecture=?, city=?, address1=?, address2=?,
       phone=?, mobile=?, email=?, note=?,
       updated_at=datetime('now','localtime')
     WHERE id=?`,
    [
      input.student_code ?? null,
      input.last_name, input.first_name,
      input.last_kana ?? null, input.first_kana ?? null,
      input.birth_date ?? null, input.gender ?? null,
      input.postal_code ?? null, input.prefecture ?? null,
      input.city ?? null, input.address1 ?? null, input.address2 ?? null,
      input.phone ?? null, input.mobile ?? null,
      input.email ?? null, input.note ?? null,
      id,
    ]
  )
  return getStudent(id)!
}

// -------- 削除 --------
export function deleteStudent(id: number): void {
  run('DELETE FROM students WHERE id = ?', [id])
}

// -------- 重複チェック --------
export function checkDuplicate(input: StudentInput, excludeId?: number): DuplicateCheckResult {
  const exc = excludeId ? ` AND id != ${Number(excludeId)}` : ''

  const byName = query(
    `SELECT * FROM students WHERE last_name=? AND first_name=?${exc}`,
    [input.last_name, input.first_name]
  ).map(toStudent)

  const byAddress =
    input.postal_code && input.address1
      ? query(
          `SELECT * FROM students WHERE postal_code=? AND address1=?${exc}`,
          [input.postal_code, input.address1]
        ).map(toStudent)
      : []

  return {
    hasDuplicate: byName.length > 0 || byAddress.length > 0,
    byName,
    byAddress,
  }
}

// -------- CSVインポート --------
export function importStudents(rows: StudentInput[]): { inserted: number; skipped: number } {
  let inserted = 0
  let skipped = 0

  transaction(() => {
    for (const row of rows) {
      if (!row.last_name?.trim() || !row.first_name?.trim()) { skipped++; continue }
      try {
        const code = row.student_code?.trim() || nextStudentCode()
        run(
          `INSERT INTO students
             (student_code, last_name, first_name, last_kana, first_kana, birth_date, gender,
              postal_code, prefecture, city, address1, address2,
              phone, mobile, email, note,
              created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,
                   datetime('now','localtime'), datetime('now','localtime'))`,
          [
            code,
            row.last_name, row.first_name,
            row.last_kana ?? null, row.first_kana ?? null,
            row.birth_date ?? null, row.gender ?? null,
            row.postal_code ?? null, row.prefecture ?? null,
            row.city ?? null, row.address1 ?? null, row.address2 ?? null,
            row.phone ?? null, row.mobile ?? null,
            row.email ?? null, row.note ?? null,
          ]
        )
        inserted++
      } catch {
        skipped++
      }
    }
  })

  return { inserted, skipped }
}
