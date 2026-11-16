/**
 * 受験料・登録免許税と、試験申請者名簿に印字する団体名
 *
 * 管理画面（設定 → 受験料・登録免許税）で変更でき、データベースの app_settings に保存する。
 * 初期値は旧うーみーくん（トライセンスマネジャー）の設定画面の金額。
 */
import { settingsApi } from './api'

export interface ExamFees {
  physical_have: number    // 身体検査（予備身あり＝証明書を提出）
  physical_none: number    // 身体検査（予備身なし＝当日検査）
  gakka_1: number          // 学科（1級）
  gakka_2: number          // 学科（2級）
  gakka_kokawa: number     // 学科（2級湖川）
  gakka_tokushu: number    // 学科（特殊）
  jitsugi_12: number       // 実技（1級・2級）
  jitsugi_kokawa: number   // 実技（2級湖川）
  jitsugi_tokushu: number  // 実技（特殊）
  license_1: number        // 免許申請（1級）
  license_2: number        // 免許申請（2級）
  license_kokawa: number   // 免許申請（2級湖川）
  license_tokushu: number  // 免許申請（特殊）
  renewal: number          // 更新申請
  reissue: number          // 再交付申請
  correction: number       // 訂正申請
}

export const DEFAULT_FEES: ExamFees = {
  physical_have: 2450, physical_none: 4250,
  gakka_1: 10000, gakka_2: 4850, gakka_kokawa: 4250, gakka_tokushu: 4400,
  jitsugi_12: 21200, jitsugi_kokawa: 17900, jitsugi_tokushu: 19000,
  license_1: 2000, license_2: 1800, license_kokawa: 1800, license_tokushu: 1500,
  renewal: 1350, reissue: 1250, correction: 1250,
}

/** 管理画面の並びと表示名 */
export const FEE_GROUPS: { title: string; items: { key: keyof ExamFees; label: string }[] }[] = [
  { title: '受験料', items: [
    { key: 'physical_have',   label: '身体検査（予備身あり）' },
    { key: 'physical_none',   label: '身体検査（予備身なし）' },
    { key: 'gakka_1',         label: '学科（1級）' },
    { key: 'gakka_2',         label: '学科（2級）' },
    { key: 'gakka_kokawa',    label: '学科（2級湖川）' },
    { key: 'gakka_tokushu',   label: '学科（特殊）' },
    { key: 'jitsugi_12',      label: '実技（1級・2級）' },
    { key: 'jitsugi_kokawa',  label: '実技（2級湖川）' },
    { key: 'jitsugi_tokushu', label: '実技（特殊）' },
  ] },
  { title: '登録免許税', items: [
    { key: 'license_1',       label: '免許申請（1級）' },
    { key: 'license_2',       label: '免許申請（2級）' },
    { key: 'license_kokawa',  label: '免許申請（2級湖川）' },
    { key: 'license_tokushu', label: '免許申請（特殊）' },
    { key: 'renewal',         label: '更新申請' },
    { key: 'reissue',         label: '再交付申請' },
    { key: 'correction',      label: '訂正申請' },
  ] },
]

const FEES_KEY = 'exam_fees'
const ORG_KEY  = 'roster_org_name'
export const DEFAULT_ORG_NAME = '有限会社 リブレボーティング'

export async function loadFees(): Promise<ExamFees> {
  const saved = await settingsApi.get<Partial<ExamFees>>(FEES_KEY, {})
  return { ...DEFAULT_FEES, ...saved }
}
export const saveFees = (fees: ExamFees) => settingsApi.set(FEES_KEY, fees)

export const loadOrgName = () => settingsApi.get<string>(ORG_KEY, DEFAULT_ORG_NAME)
export const saveOrgName = (name: string) => settingsApi.set(ORG_KEY, name)

/** 資格種別（一級・二級・特殊・湖川）→ 学科・実技の受験料 */
export function examFeesForQual(qual: string, fees: ExamFees): { gakka: number; jitsugi: number } {
  const q = qual.normalize('NFKC')
  if (/湖川/.test(q))        return { gakka: fees.gakka_kokawa,  jitsugi: fees.jitsugi_kokawa }
  if (/特殊/.test(q))        return { gakka: fees.gakka_tokushu, jitsugi: fees.jitsugi_tokushu }
  if (/1級|一級/.test(q))    return { gakka: fees.gakka_1,       jitsugi: fees.jitsugi_12 }
  return { gakka: fees.gakka_2, jitsugi: fees.jitsugi_12 }
}
