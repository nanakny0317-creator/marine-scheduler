import { app, BrowserWindow, shell } from 'electron'
import path from 'path'
import { initDb, closeDb } from './db/index'
import { registerStudentHandlers } from './handlers/studentHandlers'
import { registerEnrollmentHandlers } from './handlers/enrollmentHandlers'
import { registerVenueHandlers } from './handlers/venueHandlers'

const isDev = process.env.NODE_ENV === 'development'

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  win.once('ready-to-show', () => {
    win.show()
    win.setTitle('船舶免許講習管理')
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(async () => {
  try {
    await initDb()
    console.log('DB initialized')
  } catch (e) {
    console.error('DB initialization failed:', e)
  }

  registerStudentHandlers()
  registerEnrollmentHandlers()
  registerVenueHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDb()
  if (process.platform !== 'darwin') app.quit()
})
