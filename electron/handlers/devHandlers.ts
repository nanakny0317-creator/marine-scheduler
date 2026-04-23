import { ipcMain } from 'electron'
import { devResetAll, devSeedTestData, devGetCounts } from '../db/dev'

export function registerDevHandlers() {
  ipcMain.handle('dev:counts', () => devGetCounts())
  ipcMain.handle('dev:resetAll', () => { devResetAll(); return true })
  ipcMain.handle('dev:seed', () => devSeedTestData())
}
