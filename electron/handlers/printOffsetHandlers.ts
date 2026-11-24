/**
 * OCR申請書の「全体の位置補正」を、このパソコンだけに保存する
 *
 * プリンターの癖はパソコン（つながっているプリンター）ごとに違うので、共有するデータベースには入れず、
 * userData/print-offset.json に置く。ファイルが無いパソコンは、アプリの基本設定（formPrint.ts の
 * DEFAULT_PRINT_OFFSET）を使う。
 */
import { app, ipcMain } from 'electron'
import path from 'path'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'

function filePath() {
  return path.join(app.getPath('userData'), 'print-offset.json')
}

/** 保存してある補正（JSON文字列）。まだ保存していなければ null */
function readOffset(): string | null {
  const p = filePath()
  return existsSync(p) ? readFileSync(p, 'utf-8') : null
}

function writeOffset(json: string): boolean {
  const v = JSON.parse(json) as { xMm?: unknown; yMm?: unknown }
  const ok = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 15
  if (!ok(v.xMm) || !ok(v.yMm)) throw new Error('位置補正の値が正しくありません')
  const p = filePath()
  mkdirSync(path.dirname(p), { recursive: true })
  // 書きかけで壊れないよう、一時ファイルに書いてから置き換える
  const tmp = `${p}.tmp`
  writeFileSync(tmp, JSON.stringify({ xMm: v.xMm, yMm: v.yMm }) + '\n', 'utf-8')
  renameSync(tmp, p)
  return true
}

export function registerPrintOffsetHandlers() {
  ipcMain.handle('printOffset:get', () => readOffset())
  ipcMain.handle('printOffset:set', (_e, json: string) => writeOffset(json))
}
