/**
 * 申請書（OCR）の生年月日の書き方：和暦（元号の枠に×・年は元号の年）か西暦（1900/2000の枠に×・年は西暦の下2桁）か
 *
 * 日本国籍と外国籍で分けて設定できる。既定は日本国籍＝和暦、外国籍＝西暦。
 */
import { settingsApi } from './api'

export type BirthDateMode = 'wareki' | 'seireki'
export interface BirthDateStyle { japanese: BirthDateMode; foreign: BirthDateMode }

export const DEFAULT_BIRTH_DATE_STYLE: BirthDateStyle = { japanese: 'wareki', foreign: 'seireki' }
const KEY = 'form_birth_date_style'

const mode = (v: unknown, d: BirthDateMode): BirthDateMode => (v === 'wareki' || v === 'seireki' ? v : d)

export async function loadBirthDateStyle(): Promise<BirthDateStyle> {
  const v = await settingsApi.get<Partial<BirthDateStyle>>(KEY, {})
  return {
    japanese: mode(v.japanese, DEFAULT_BIRTH_DATE_STYLE.japanese),
    foreign:  mode(v.foreign,  DEFAULT_BIRTH_DATE_STYLE.foreign),
  }
}
export const saveBirthDateStyle = (s: BirthDateStyle) => settingsApi.set(KEY, s)

/** 国籍（空＝日本）からその人の書き方を決める */
export function birthDateModeFor(nationality: string, style: BirthDateStyle = DEFAULT_BIRTH_DATE_STYLE): BirthDateMode {
  return !nationality || nationality === '日本' ? style.japanese : style.foreign
}
