/**
 * 試験事務所（海レ協の事務所）のマスター：免許申請書②「試験事務所番号」
 *
 * 試験の管轄の事務所で番号が変わる。普段は近畿（6）。設定画面で変更・追加できる（アプリの設定に保存）。
 * 試験日程には番号そのもの（exam_office）を保存する。空欄の試験日程は「基本」の事務所の番号。
 */
import { settingsApi } from './api'

export interface ExamOffice { name: string; number: string; isDefault?: boolean }

export const DEFAULT_EXAM_OFFICES: ExamOffice[] = [
  { name: '近畿', number: '6', isDefault: true },
  { name: '中部', number: '5' },
  { name: '関東', number: '3' },
  { name: '信越', number: '4' },
  { name: '九州', number: '9' },
  { name: '沖縄', number: '1' },   // 旧アプリの印刷も「1」（枠が1つ）
]
const KEY = 'exam_offices'

export async function loadExamOffices(): Promise<ExamOffice[]> {
  const v = await settingsApi.get<ExamOffice[] | null>(KEY, null)
  const list = Array.isArray(v) ? v.filter(o => o && typeof o.name === 'string' && typeof o.number === 'string') : []
  return list.length ? list : DEFAULT_EXAM_OFFICES
}
export const saveExamOffices = (list: ExamOffice[]) => settingsApi.set(KEY, list)

/** 基本の事務所（印がなければ先頭） */
export function defaultExamOffice(list: ExamOffice[]): ExamOffice | undefined {
  return list.find(o => o.isDefault) ?? list[0]
}

/** 試験日程の試験事務所番号（空欄は基本の事務所の番号） */
export function examOfficeNumber(s: { exam_office?: string | null } | null | undefined, list: ExamOffice[]): string {
  return s?.exam_office?.trim() || defaultExamOffice(list)?.number || ''
}

/** 表示用（例：「近畿（6）」。一覧にない番号は「番号 6」） */
export function examOfficeLabel(number: string, list: ExamOffice[]): string {
  const o = list.find(x => x.number === number)
  return o ? `${o.name}（${o.number}）` : `番号 ${number}`
}
