/**
 * 更新・失効と同時に出す訂正（登録事項の変更）の項目
 *
 * 申込の extra.correction = 'yes' のとき、extra.correction_items に変更のある項目を持つ。
 * 更新申請書・失効再交付申請書の氏名・住所・本籍・国籍の下にある「変更」欄に×を印字する。
 */
export type CorrectionItem = 'name' | 'address' | 'domicile' | 'nationality'

export const CORRECTION_ITEMS: { value: CorrectionItem; label: string }[] = [
  { value: 'name',        label: '氏名' },
  { value: 'address',     label: '住所' },
  { value: 'domicile',    label: '本籍' },
  { value: 'nationality', label: '国籍' },
]

export function readCorrectionItems(v: unknown): CorrectionItem[] {
  if (!Array.isArray(v)) return []
  return CORRECTION_ITEMS.map(i => i.value).filter(x => v.includes(x))
}

/** 訂正申請書（訂正だけの人）①訂正項目 */
export type TeiseiItem = 'name' | 'birth' | 'domicile' | 'address' | 'other'

export const TEISEI_ITEMS: { value: TeiseiItem; label: string }[] = [
  { value: 'name',     label: '氏名' },
  { value: 'birth',    label: '生年月日' },
  { value: 'domicile', label: '本籍・国籍' },
  { value: 'address',  label: '住所' },
  { value: 'other',    label: 'その他' },
]

export function readTeiseiItems(v: unknown): TeiseiItem[] {
  if (!Array.isArray(v)) return []
  return TEISEI_ITEMS.map(i => i.value).filter(x => v.includes(x))
}
