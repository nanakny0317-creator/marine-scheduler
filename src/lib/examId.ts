/**
 * 試験ID：数字6桁（免許申請書③。「0」も記入）。
 * 全角は半角に、数字以外は除き、足りない桁は前を0で埋める（JMRA の Excel 取り込みと同じ）。数字が無ければ ''
 */
export function normalizeExamId(v: string | null | undefined): string {
  const d = (v ?? '').normalize('NFKC').replace(/\D/g, '')
  return d ? d.padStart(6, '0') : ''
}
