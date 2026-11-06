import { ipcMain } from 'electron'
import { listClassrooms, createClassroom, updateClassroom, deleteClassroom } from '../db/classrooms'

export function registerClassroomHandlers() {
  ipcMain.handle('classrooms:list',   () => listClassrooms())
  ipcMain.handle('classrooms:create', (_e, input) => createClassroom(input))
  ipcMain.handle('classrooms:update', (_e, id: number, input) => updateClassroom(id, input))
  ipcMain.handle('classrooms:delete', (_e, id: number) => { deleteClassroom(id); return true })
}
