import type { Student } from '../../types'
import MemberBasicInfoReadOnly from './MemberBasicInfoReadOnly'

interface Props {
  student: Student
  onClose: () => void
  onEdit: () => void
}

export default function MemberBasicInfoModal({ student, onClose, onEdit }: Props) {
  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        role="dialog"
        aria-labelledby="member-basic-title"
      >
        <div className="shrink-0 px-6 py-4 border-b border-lavender-100 flex items-center justify-between">
          <h2 id="member-basic-title" className="text-base font-semibold text-gray-700">
            基本情報
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            tabIndex={-1}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <MemberBasicInfoReadOnly student={student} />
        </div>

        <div className="shrink-0 px-6 py-4 border-t border-lavender-100 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            閉じる
          </button>
          <button type="button" onClick={onEdit} className="btn-primary">
            編集
          </button>
        </div>
      </div>
    </div>
  )
}
