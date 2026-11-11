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
