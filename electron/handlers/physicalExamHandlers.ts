import { ipcMain } from 'electron'
import {
  listPhysicalExams, createPhysicalExam, updatePhysicalExam, deletePhysicalExam,
} from '../db/physical_exams'

export function registerPhysicalExamHandlers() {
  ipcMain.handle('physicalExams:list',   (_e, studentId: number) => listPhysicalExams(studentId))
  ipcMain.handle('physicalExams:create', (_e, input) => createPhysicalExam(input))
  ipcMain.handle('physicalExams:update', (_e, id: number, input) => updatePhysicalExam(id, input))
  ipcMain.handle('physicalExams:delete', (_e, id: number) => { deletePhysicalExam(id); return true })
}
