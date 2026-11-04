import { ipcMain } from 'electron'
import {
  listExamRecords, createExamRecord, updateExamRecord, deleteExamRecord,
} from '../db/exam_records'

export function registerExamRecordHandlers() {
  ipcMain.handle('examRecords:list',   (_e, studentId: number) => listExamRecords(studentId))
  ipcMain.handle('examRecords:create', (_e, input) => createExamRecord(input))
  ipcMain.handle('examRecords:update', (_e, id: number, input) => updateExamRecord(id, input))
  ipcMain.handle('examRecords:delete', (_e, id: number) => { deleteExamRecord(id); return true })
}
