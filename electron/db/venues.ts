import { query, run, Row } from './index'
import type { Venue, VenueInput } from '../../src/types'

function toVenue(row: Row): Venue {
  return {
    id:         Number(row.id),
    region:     String(row.region ?? '近畿'),
    prefecture: String(row.prefecture ?? ''),
    city:       row.city ? String(row.city) : null,
    name:       String(row.name ?? ''),
    sort_order: Number(row.sort_order ?? 0),
    active:     row.active === 1 || row.active === true,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

/** 会場一覧（sort_order 順）。region=undefined のとき全件 */
export function listVenues(activeOnly = true, region?: string): Venue[] {
  const conds: string[] = []
  if (activeOnly) conds.push('active = 1')
  if (region)     conds.push('region = ?')
  const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : ''
  const params = region ? [region] : []
  return query(
    `SELECT * FROM venues ${where} ORDER BY prefecture ASC, sort_order ASC, name ASC`,
    params
  ).map(toVenue)
}

/** 登録済み地域一覧 */
export function listRegions(): string[] {
  const rows = query('SELECT DISTINCT region FROM venues ORDER BY region ASC')
  return rows.map((r) => String(r.region))
}

/** 会場追加 */
export function createVenue(input: VenueInput): Venue {
  const id = run(
    `INSERT INTO venues (region, prefecture, city, name, sort_order, active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [input.region ?? '近畿', input.prefecture, input.city ?? null, input.name, input.sort_order ?? 0, input.active !== false ? 1 : 0]
  )
  return query('SELECT * FROM venues WHERE id = ?', [id]).map(toVenue)[0]
}

/** 会場更新 */
export function updateVenue(id: number, input: VenueInput): Venue {
  run(
    `UPDATE venues SET region=?, prefecture=?, city=?, name=?, sort_order=?, active=? WHERE id=?`,
    [input.region ?? '近畿', input.prefecture, input.city ?? null, input.name, input.sort_order ?? 0, input.active !== false ? 1 : 0, id]
  )
  return query('SELECT * FROM venues WHERE id = ?', [id]).map(toVenue)[0]
}

/** 会場削除 */
export function deleteVenue(id: number): void {
  run('DELETE FROM venues WHERE id = ?', [id])
}
