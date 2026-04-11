import { query, queryOne, run, transaction, Row } from './index'
type SqlParam = string | number | null | Uint8Array
import type {
  Student,
  StudentInput,
  StudentSearchParams,
  DuplicateCheckResult,
} from '../../src/types'

// ひらがなをカタカナに変換
function toKatakana(str: string | null): string | null {
  if (!str) return str
  return str.replace(/[\u3041-\u3096]/g, (match) => {
    return String.fromCharCode(match.charCodeAt(0) + 0x60)
  })
}

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
  const processedInput = { ...input }
  processedInput.last_kana = toKatakana(input.last_kana)
  processedInput.first_kana = toKatakana(input.first_kana)
  const code = processedInput.student_code?.trim() || nextStudentCode()
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
      processedInput.last_name, processedInput.first_name,
      processedInput.last_kana ?? null, processedInput.first_kana ?? null,
      processedInput.birth_date ?? null, processedInput.gender ?? null,
      processedInput.postal_code ?? null, processedInput.prefecture ?? null,
      processedInput.city ?? null, processedInput.address1 ?? null, processedInput.address2 ?? null,
      processedInput.phone ?? null, processedInput.mobile ?? null,
      processedInput.email ?? null, processedInput.note ?? null,
    ]
  )
  return getStudent(id)!
}

// -------- 更新 --------
export function updateStudent(id: number, input: StudentInput): Student {
  const processedInput = { ...input }
  processedInput.last_kana = toKatakana(input.last_kana)
  processedInput.first_kana = toKatakana(input.first_kana)
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
      processedInput.student_code ?? null,
      processedInput.last_name, processedInput.first_name,
      processedInput.last_kana ?? null, processedInput.first_kana ?? null,
      processedInput.birth_date ?? null, processedInput.gender ?? null,
      processedInput.postal_code ?? null, processedInput.prefecture ?? null,
      processedInput.city ?? null, processedInput.address1 ?? null, processedInput.address2 ?? null,
      processedInput.phone ?? null, processedInput.mobile ?? null,
      processedInput.email ?? null, processedInput.note ?? null,
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
        const processedRow = { ...row }
        processedRow.last_kana = toKatakana(row.last_kana)
        processedRow.first_kana = toKatakana(row.first_kana)
        const code = processedRow.student_code?.trim() || nextStudentCode()
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
            processedRow.last_name, processedRow.first_name,
            processedRow.last_kana ?? null, processedRow.first_kana ?? null,
            processedRow.birth_date ?? null, processedRow.gender ?? null,
            processedRow.postal_code ?? null, processedRow.prefecture ?? null,
            processedRow.city ?? null, processedRow.address1 ?? null, processedRow.address2 ?? null,
            processedRow.phone ?? null, processedRow.mobile ?? null,
            processedRow.email ?? null, processedRow.note ?? null,
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

// -------- 既存データのふりがなをカタカナに統一 --------
export function migrateKanaToKatakana(): void {
  const students = query('SELECT id, last_kana, first_kana FROM students WHERE last_kana IS NOT NULL OR first_kana IS NOT NULL')
  for (const student of students) {
    const newLastKana = toKatakana(student.last_kana ? String(student.last_kana) : null)
    const newFirstKana = toKatakana(student.first_kana ? String(student.first_kana) : null)
    run('UPDATE students SET last_kana = ?, first_kana = ? WHERE id = ?', [newLastKana, newFirstKana, student.id])
  }
}
