/**
 * 過去合格歴（申請書②欄）に未入力の項目がある申込に付ける目印
 */
import type { Enrollment } from '../../types'
import { exemptSubjectOf, missingPrevExam } from '../../lib/prevExam'

export default function PrevExamMissingBadge({ enrollment, long = false }: { enrollment: Enrollment; long?: boolean }) {
  const missing = missingPrevExam(enrollment)
  if (missing.length === 0) return null
  const subject = exemptSubjectOf(enrollment)
  return (
    <span
      className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-red-200 bg-red-50 text-red-600 text-[11px] font-bold"
      title={`${subject}の過去合格歴が未入力：${missing.join('・')}（試験機関に確認して入力してください）`}
    >
      ⚠ {subject}合格歴 未入力{long ? `：${missing.join('・')}` : ''}
    </span>
  )
}
