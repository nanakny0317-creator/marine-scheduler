/**
 * 試験地の書き方をそろえる（表記ゆれ防止）
 *   「滋賀県大津市(今堅田)」「滋賀県大津市 （今堅田）」→「滋賀県大津市（今堅田）」
 *   「大阪府 大阪市」→「大阪府大阪市」
 * 画面（入力欄）とデータベース保存（手入力・Excel取り込み・既存データの移行）の両方で使う
 */
export function normalizeExamLocation(v: string | null | undefined): string {
  return (v ?? '')
    .trim()
    .replace(/[(（]/g, '（')
    .replace(/[)）]/g, '）')
    .replace(/[\s　]+/g, '')
}

/**
 * 申請書（OCR）に印字する試験地：「（浜大津）」のような括弧つきは長くて欄に入らないので都道府県名を省く
 *   「滋賀県大津市（浜大津）」→「大津市（浜大津）」　括弧の無いものはそのまま
 */
export function examLocationForForm(v: string | null | undefined): string {
  const s = normalizeExamLocation(v)
  return s.includes('（') ? s.replace(/^.{2,3}?[都道府県]/, '') : s
}
