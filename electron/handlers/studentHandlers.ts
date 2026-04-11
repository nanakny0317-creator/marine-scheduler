import { ipcMain } from 'electron'
import {
  listStudents,
  getStudent,
  createStudent,
  updateStudent,
  deleteStudent,
  checkDuplicate,
  importStudents,
  nextStudentCode,
  migrateKanaToKatakana,
} from '../db/students'

export function registerStudentHandlers() {
  ipcMain.handle('students:list', (_e, params) => listStudents(params))
  ipcMain.handle('students:get', (_e, id: number) => getStudent(id))
  ipcMain.handle('students:create', (_e, input) => createStudent(input))
  ipcMain.handle('students:update', (_e, id: number, input) => updateStudent(id, input))
  ipcMain.handle('students:delete', (_e, id: number) => { deleteStudent(id); return true })
  ipcMain.handle('students:checkDuplicate', (_e, input, excludeId) => checkDuplicate(input, excludeId))
  ipcMain.handle('students:import', (_e, rows) => importStudents(rows))
  ipcMain.handle('students:nextCode', () => nextStudentCode())
  ipcMain.handle('students:migrateKana', () => { migrateKanaToKatakana(); return true })
}
