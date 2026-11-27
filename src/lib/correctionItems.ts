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

/**
 * 失効再交付申請書①再交付の事由（extra.reissue_reasons）。複数選べる（期限切れで紛失している、など）。
 * 未設定の申込（この欄を作る前のもの）は期限切として扱う
 */
export type ReissueReason = 'expired' | 'washed' | 'burned' | 'lost' | 'stolen' | 'damaged'

export const REISSUE_REASONS: { value: ReissueReason; label: string }[] = [
  { value: 'expired', label: '期限切' },
  { value: 'washed',  label: '流失' },
  { value: 'burned',  label: '焼失' },
  { value: 'lost',    label: '紛失' },
  { value: 'stolen',  label: '盗難' },
  { value: 'damaged', label: 'き損' },
]

export function readReissueReasons(v: unknown): ReissueReason[] {
  if (!Array.isArray(v)) return ['expired']
  return REISSUE_REASONS.map(i => i.value).filter(x => v.includes(x))
}

/** 免許証が手元にない事由（返納は「無」になる）。き損は免許証があるので含めない */
export const REISSUE_NO_LICENSE: ReissueReason[] = ['washed', 'burned', 'lost', 'stolen']
