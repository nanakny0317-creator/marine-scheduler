import { ipcMain } from 'electron'
import {
  listExamSessions, createExamSession, updateExamSession,
  deleteExamSession, upsertExamSessions,
} from '../db/exam_sessions'

export function registerExamSessionHandlers() {
  ipcMain.handle('examSessions:list',   () => listExamSessions())
  ipcMain.handle('examSessions:create', (_e, input) => createExamSession(input))
  ipcMain.handle('examSessions:update', (_e, id: number, input) => updateExamSession(id, input))
  ipcMain.handle('examSessions:delete', (_e, id: number) => { deleteExamSession(id); return true })
  ipcMain.handle('examSessions:upsert', (_e, rows) => upsertExamSessions(rows))
}
