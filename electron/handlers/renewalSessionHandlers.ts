import { ipcMain } from 'electron'
import {
  listRenewalSessions, createRenewalSession, updateRenewalSession, deleteRenewalSession,
} from '../db/renewal_sessions'

export function registerRenewalSessionHandlers() {
  ipcMain.handle('renewalSessions:list',   () => listRenewalSessions())
  ipcMain.handle('renewalSessions:create', (_e, input) => createRenewalSession(input))
  ipcMain.handle('renewalSessions:update', (_e, id: number, input) => updateRenewalSession(id, input))
  ipcMain.handle('renewalSessions:delete', (_e, id: number) => { deleteRenewalSession(id); return true })
}
