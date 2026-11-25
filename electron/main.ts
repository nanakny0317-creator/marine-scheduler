import { app, BrowserWindow, shell, ipcMain } from 'electron'
import path from 'path'
import { writeFileSync } from 'fs'
import { setPrintScalingNone } from './pdfPrintScaling'
import { initDb, closeDb } from './db/index'
import { registerStudentHandlers } from './handlers/studentHandlers'
import { registerEnrollmentHandlers } from './handlers/enrollmentHandlers'
import { registerVenueHandlers } from './handlers/venueHandlers'
import { registerPendingReviewHandlers } from './handlers/pendingReviewHandlers'
import { registerDevHandlers } from './handlers/devHandlers'
import { registerExamSessionHandlers } from './handlers/examSessionHandlers'
import { registerRenewalSessionHandlers } from './handlers/renewalSessionHandlers'
import { registerClassroomHandlers } from './handlers/classroomHandlers'
import { registerExamRecordHandlers } from './handlers/examRecordHandlers'
import { registerPhysicalExamHandlers } from './handlers/physicalExamHandlers'
import { registerSettingsHandlers } from './handlers/settingsHandlers'
import { registerFormLayoutHandlers } from './handlers/formLayoutHandlers'
import { registerPrintOffsetHandlers } from './handlers/printOffsetHandlers'

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
function getOutputPath(n = 0, base = 'receipt') {
  const dir = isDev ? process.cwd() : app.getPath('userData')
  return path.join(dir, n === 0 ? `${base}.pdf` : `${base}-${n}.pdf`)
}

/**
 * PDFを書き出す。前に印刷したPDFがビューアで開いたまま（ロック中）なら、
 * receipt-1.pdf, receipt-2.pdf … と別の名前で保存する。
 */
function writePdf(buf: Buffer, base = 'receipt'): string {
  for (let n = 0; n < 20; n++) {
    const p = getOutputPath(n, base)
    try {
      writeFileSync(p, buf)
      return p
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code !== 'EBUSY' && code !== 'EPERM') throw e
    }
  }
  throw new Error('印刷用のPDFを保存できませんでした。開いているPDFを閉じてからもう一度印刷してください。')
}

// ── 印刷ハンドラー（HTML → PDF → システムPDFビューアで開く）──
ipcMain.handle('print:html', async (_event, html: string, baseName?: unknown) => {
  // 保存するPDFの名前（英数字だけ。既定は receipt）
  const base = typeof baseName === 'string' && /^[a-z0-9-]{1,40}$/i.test(baseName) ? baseName : 'receipt'
  const renderWin = new BrowserWindow({
    show: false,
    width: 680,
    height: 990,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })

  // data URL で直接ロード（一時HTMLファイル不要）
  const base64Html = Buffer.from(html, 'utf-8').toString('base64')
  await renderWin.loadURL(`data:text/html;charset=utf-8;base64,${base64Html}`)
  // 埋め込みフォント（OCR-HK）の読み込みを待ってからPDFにする（待たないとゴシック体で出ることがある）
  await renderWin.webContents.executeJavaScript('document.fonts.ready.then(() => true)').catch(() => {})

  const pdfBuffer = await renderWin.webContents.printToPDF({
    pageSize: 'A4',
    printBackground: false,
    preferCSSPageSize: true,
  })

  renderWin.close()

  // DBと同じディレクトリに固定名で上書き保存（tempフォルダ不使用）
  // 印刷時に「用紙に合わせて縮小」されないよう、PDFに「実際のサイズで印刷」の指定を付ける
  const pdfPath = writePdf(setPrintScalingNone(Buffer.from(pdfBuffer)), base)

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
  registerPendingReviewHandlers()
  registerExamSessionHandlers()
  registerRenewalSessionHandlers()
  registerClassroomHandlers()
  registerExamRecordHandlers()
  registerPhysicalExamHandlers()
  registerSettingsHandlers()
  registerFormLayoutHandlers()
  registerPrintOffsetHandlers()
  if (isDev) registerDevHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDb()
  if (process.platform !== 'darwin') app.quit()
})
