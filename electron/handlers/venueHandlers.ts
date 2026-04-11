import { ipcMain } from 'electron'
import { listVenues, listRegions, createVenue, updateVenue, deleteVenue } from '../db/venues'

export function registerVenueHandlers() {
  ipcMain.handle('venues:list',    (_e, activeOnly?: boolean, region?: string) => listVenues(activeOnly ?? true, region))
  ipcMain.handle('venues:regions', () => listRegions())
  ipcMain.handle('venues:create',  (_e, input) => createVenue(input))
  ipcMain.handle('venues:update',  (_e, id: number, input) => updateVenue(id, input))
  ipcMain.handle('venues:delete',  (_e, id: number) => { deleteVenue(id); return true })
}
