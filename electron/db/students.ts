import { query, queryOne, run, transaction, Row } from './index'
type SqlParam = string | number | null | Uint8Array
import type {
  Student,
  StudentInput,
  StudentSearchParams,
  DuplicateCheckResult,
  DuplicateCandidate,
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
    license_number: row.license_number ? String(row.license_number) : null,
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
          OR email LIKE ? OR phone LIKE ? OR mobile LIKE ?
          OR student_code LIKE ?)
       ${typeClause}
       ORDER BY ${col} ${dir}`,
      [like, like, like, like, like, like, like, like, ...typeParams]
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
       (student_code, license_number, last_name, first_name, last_kana, first_kana, birth_date, gender,
        postal_code, prefecture, city, address1, address2,
        phone, mobile, email, note,
        created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,
             datetime('now','localtime'), datetime('now','localtime'))`,
    [
      code,
      processedInput.license_number ?? null,
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
       student_code=?, license_number=?,
       last_name=?, first_name=?, last_kana=?, first_kana=?,
       birth_date=?, gender=?,
       postal_code=?, prefecture=?, city=?, address1=?, address2=?,
       phone=?, mobile=?, email=?, note=?,
       updated_at=datetime('now','localtime')
     WHERE id=?`,
    [
      processedInput.student_code ?? null,
      processedInput.license_number ?? null,
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

// -------- 重複チェック（スコアリング方式）--------
export function checkDuplicate(input: StudentInput, excludeId?: number): DuplicateCheckResult {
  const exc = excludeId ? ` AND id != ${Number(excludeId)}` : ''
  const candidateMap = new Map<number, { student: Student; score: number; reasons: string[] }>()

  const addCandidates = (students: Student[], points: number, reason: string) => {
    for (const s of students) {
      const existing = candidateMap.get(s.id)
      if (existing) {
        existing.score += points
        if (!existing.reasons.includes(reason)) existing.reasons.push(reason)
      } else {
        candidateMap.set(s.id, { student: s, score: points, reasons: [reason] })
      }
    }
  }

  // 同姓同名（40点）
  if (input.last_name && input.first_name) {
    addCandidates(
      query(`SELECT * FROM students WHERE last_name=? AND first_name=?${exc}`,
        [input.last_name, input.first_name]).map(toStudent),
      40, '同姓同名'
    )
  }

  // 同フリガナ（20点）
  if (input.last_kana && input.first_kana) {
    addCandidates(
      query(`SELECT * FROM students WHERE last_kana=? AND first_kana=?${exc}`,
        [input.last_kana, input.first_kana]).map(toStudent),
      20, '同フリガナ'
    )
  }

  // 生年月日一致（30点）
  if (input.birth_date) {
    addCandidates(
      query(`SELECT * FROM students WHERE birth_date=?${exc}`, [input.birth_date]).map(toStudent),
      30, '生年月日一致'
    )
  }

  // 免許番号一致（65点：非常に強い指標）
  if (input.license_number?.trim()) {
    addCandidates(
      query(`SELECT * FROM students WHERE license_number=? AND license_number IS NOT NULL${exc}`,
        [input.license_number]).map(toStudent),
      65, '免許番号一致'
    )
  }

  // メール一致（15点）
  if (input.email?.trim()) {
    addCandidates(
      query(`SELECT * FROM students WHERE email=?${exc}`, [input.email]).map(toStudent),
      15, 'メール一致'
    )
  }

  // 電話番号一致（10点）
  const phones = [input.phone, input.mobile]
    .map(p => p?.replace(/[-\s]/g, '').trim())
    .filter((p): p is string => !!p && p.length >= 10)
  for (const p of [...new Set(phones)]) {
    addCandidates(
      query(
        `SELECT * FROM students WHERE replace(replace(phone,'-',''),' ','')=? OR replace(replace(mobile,'-',''),' ','')=?${exc}`,
        [p, p]
      ).map(toStudent),
      10, '電話番号一致'
    )
  }

  // 同住所（20点）
  const byAddress = (input.postal_code && input.address1)
    ? query(`SELECT * FROM students WHERE postal_code=? AND address1=?${exc}`,
        [input.postal_code, input.address1]).map(toStudent)
    : []
  addCandidates(byAddress, 20, '同住所')

  // 後方互換用 byName
  const byName = (input.last_name && input.first_name)
    ? query(`SELECT * FROM students WHERE last_name=? AND first_name=?${exc}`,
        [input.last_name, input.first_name]).map(toStudent)
    : []

  // スコア35以上のみ候補として返す
  const candidates: DuplicateCandidate[] = Array.from(candidateMap.values())
    .filter(c => c.score >= 35)
    .sort((a, b) => b.score - a.score)
    .map(({ student, score, reasons }) => {
      const hasKana     = reasons.includes('同フリガナ')
      const hasBirth    = reasons.includes('生年月日一致')
      const hasSameName = reasons.includes('同姓同名')

      // フリガナ＋生年月日が一致しているのに漢字名が異なる → 旧字体・異体字の可能性
      let hint: string | undefined
      if (hasKana && hasBirth && !hasSameName) {
        const inputName = `${input.last_name}${input.first_name}`
        const candidateName = `${student.last_name}${student.first_name}`
        hint = `フリガナと生年月日は一致していますが、漢字が異なります（入力：${inputName} ／ 既存：${candidateName}）。旧字体・異体字からの変更（例：髙→高、齊→斉、邊→辺、濱→浜、國→国、澤→沢）の可能性があります。`
      }

      return {
        student,
        score,
        reasons,
        confidence: score >= 65 ? 'high' : score >= 40 ? 'medium' : 'low' as const,
        hint,
      }
    })

  return {
    hasDuplicate: candidates.length > 0,
    candidates,
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
