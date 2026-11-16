import { queryOne, run } from './index'

/** 設定値を読む（JSON文字列のまま返す。未設定は null） */
export function getSetting(key: string): string | null {
  const row = queryOne('SELECT value FROM app_settings WHERE key = ?', [key])
  return row ? String(row.value) : null
}

/** 設定値を保存する（JSON文字列） */
export function setSetting(key: string, value: string): boolean {
  run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value])
  return true
}
