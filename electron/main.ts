import { app, BrowserWindow, shell, ipcMain } from 'electron'
import path from 'path'
import { writeFileSync } from 'fs'
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

// 出力先ディレクトリ（DBと同じ場所に合わせる）
function getOutputPath() {
  const dir = isDev ? process.cwd() : app.getPath('userData')
  return path.join(dir, 'receipt.pdf')
}

// ── 印刷ハンドラー（HTML → PDF → システムPDFビューアで開く）──
ipcMain.handle('print:html', async (_event, html: string) => {
  const renderWin = new BrowserWindow({
    show: false,
    width: 680,
    height: 990,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })

  // data URL で直接ロード（一時HTMLファイル不要）
  const base64Html = Buffer.from(html, 'utf-8').toString('base64')
  await renderWin.loadURL(`data:text/html;charset=utf-8;base64,${base64Html}`)

  const pdfBuffer = await renderWin.webContents.printToPDF({
    pageSize: 'A4',
    printBackground: false,
    preferCSSPageSize: true,
  })

  renderWin.close()

  // DBと同じディレクトリに固定名で上書き保存（tempフォルダ不使用）
  const pdfPath = getOutputPath()
  writeFileSync(pdfPath, pdfBuffer)

  await shell.openPath(pdfPath)
})

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
