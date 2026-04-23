import { ipcMain } from 'electron'
import {
  listPendingReviews,
  createPendingReview,
  resolvePendingReview,
  mergePendingReview,
} from '../db/pending_reviews'

export function registerPendingReviewHandlers() {
  ipcMain.handle('pendingReviews:list', () => listPendingReviews())
  ipcMain.handle('pendingReviews:create', (_e, input) => createPendingReview(input))
  ipcMain.handle('pendingReviews:resolve', (_e, id: number, resolution: string) =>
    resolvePendingReview(id, resolution as 'merged' | 'different')
  )
  ipcMain.handle('pendingReviews:merge', (_e, id: number, keepStudentId: number) =>
    mergePendingReview(id, keepStudentId)
  )
}
