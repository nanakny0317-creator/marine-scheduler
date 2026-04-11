import { ipcMain } from 'electron'
import {
  createEnrollment,
  listEnrollments,
  importWithEnrollments,
  listAllWithStudents,
  updateEnrollment,
  deleteEnrollment,
} from '../db/enrollments'

export function registerEnrollmentHandlers() {
  ipcMain.handle('enrollments:create', (_e, input) => createEnrollment(input))
  ipcMain.handle('enrollments:list', (_e, studentId: number) => listEnrollments(studentId))
  ipcMain.handle('enrollments:importBatch', (_e, rows) => importWithEnrollments(rows))
  ipcMain.handle('enrollments:listAll', (_e, applicationType?: string) => listAllWithStudents(applicationType))
  ipcMain.handle('enrollments:update', (_e, id: number, input) => updateEnrollment(id, input))
  ipcMain.handle('enrollments:delete', (_e, id: number) => deleteEnrollment(id))
}
