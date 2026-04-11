import { ipcMain } from 'electron'
import { createEnrollment, listEnrollments, importWithEnrollments, listAllWithStudents } from '../db/enrollments'

export function registerEnrollmentHandlers() {
  ipcMain.handle('enrollments:create', (_e, input) => createEnrollment(input))
  ipcMain.handle('enrollments:list', (_e, studentId: number) => listEnrollments(studentId))
  ipcMain.handle('enrollments:importBatch', (_e, rows) => importWithEnrollments(rows))
  ipcMain.handle('enrollments:listAll', (_e, applicationType?: string) => listAllWithStudents(applicationType))
}
