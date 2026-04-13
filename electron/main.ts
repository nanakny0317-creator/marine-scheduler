import { app, BrowserWindow, shell, ipcMain } from 'electron'
import path from 'path'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
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

// ── 印刷ハンドラー（PDF生成 → システムPDFビューアで開く）──
ipcMain.handle('print:html', async (_event, html: string) => {
  const ts = Date.now()
  const tmpHtmlPath = path.join(tmpdir(), `receipt-${ts}.html`)
  const tmpPdfPath  = path.join(tmpdir(), `receipt-${ts}.pdf`)
  writeFileSync(tmpHtmlPath, html, 'utf-8')

  // A4幅（210mm = 794px @ 96DPI）で非表示レンダリング
  const renderWin = new BrowserWindow({
    show: false,
    width: 680,
    height: 990,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })

  await renderWin.loadFile(tmpHtmlPath)

  // CSS @page の margin/size をそのまま使ってPDF生成
  const pdfBuffer = await renderWin.webContents.printToPDF({
    pageSize: 'A4',
    printBackground: false,
    preferCSSPageSize: true,
  })

  renderWin.close()
  try { unlinkSync(tmpHtmlPath) } catch { /* ignore */ }

  writeFileSync(tmpPdfPath, pdfBuffer)

  // システムの既定PDFビューアで開く（Edge/Acrobat等）
  await shell.openPath(tmpPdfPath)

  // 2分後に一時ファイルを削除
  setTimeout(() => { try { unlinkSync(tmpPdfPath) } catch { /* ignore */ } }, 120_000)
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
