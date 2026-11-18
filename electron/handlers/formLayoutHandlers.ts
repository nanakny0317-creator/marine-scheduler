/**
 * 申請書の書式ファイル（印字位置）の読み書き
 *
 * - 開発中：public/form-layouts/<name>.json を直接書き換える（git で管理）
 * - 配布版：アプリに同梱の書式は書き換えられないので、userData/form-layouts/<name>.json に保存し、
 *           読むときはそちらを優先する（無ければ同梱の書式）
 * - 保存の前に、それまでの書式を form-layout-backups/<name>-<日時>.json に控えとして残す
 */
import { app, ipcMain } from 'electron'
import path from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'

const isDev = process.env.NODE_ENV === 'development'
const NAME_RE = /^[a-z_]+$/

function bundledDir() {
  return isDev ? path.join(process.cwd(), 'public', 'form-layouts') : path.join(__dirname, '../dist/form-layouts')
}
/** 保存先（開発中は同梱の書式そのもの） */
function savedDir() {
  return isDev ? bundledDir() : path.join(app.getPath('userData'), 'form-layouts')
}
function backupDir() {
  return path.join(isDev ? process.cwd() : app.getPath('userData'), 'form-layout-backups')
}

function checkName(name: string) {
  if (!NAME_RE.test(name)) throw new Error(`書式の名前が正しくありません: ${name}`)
}

/** 今使われている書式の中身（保存したものがあればそちら） */
function readLayout(name: string): string | null {
  checkName(name)
  for (const dir of [savedDir(), bundledDir()]) {
    const p = path.join(dir, `${name}.json`)
    if (existsSync(p)) return readFileSync(p, 'utf-8')
  }
  return null
}

function stamp() {
  const d = new Date()
  const z = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`
}

function saveLayout(name: string, json: string): { backup: string | null } {
  checkName(name)
  const parsed = JSON.parse(json)
  if (!Array.isArray(parsed)) throw new Error('書式の中身が正しくありません（欄の一覧ではありません）')

  let backup: string | null = null
  const current = readLayout(name)
  if (current != null) {
    mkdirSync(backupDir(), { recursive: true })
    backup = path.join(backupDir(), `${name}-${stamp()}.json`)
    writeFileSync(backup, current, 'utf-8')
  }
  mkdirSync(savedDir(), { recursive: true })
  writeFileSync(path.join(savedDir(), `${name}.json`), JSON.stringify(parsed, null, 2) + '\n', 'utf-8')
  return { backup }
}

export function registerFormLayoutHandlers() {
  ipcMain.handle('formLayouts:read', (_e, name: string) => readLayout(name))
  ipcMain.handle('formLayouts:save', (_e, name: string, json: string) => saveLayout(name, json))
}
