import { ipcMain } from 'electron'
import { getSetting, setSetting } from '../db/settings'

export function registerSettingsHandlers() {
  ipcMain.handle('settings:get', (_e, key: string) => getSetting(key))
  ipcMain.handle('settings:set', (_e, key: string, value: string) => setSetting(key, value))
}
