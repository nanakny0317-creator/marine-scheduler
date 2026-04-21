import { useEffect, useState } from 'react'
import type { Student } from '../../types'
import { enrollmentsApi, studentsApi } from '../../lib/api'
import MemberBasicInfoReadOnly from './MemberBasicInfoReadOnly'

interface Props {
  student: Student
  onClose: () => void
  onEdit: () => void
  onDeleted?: () => void
}

export default function MemberBasicInfoModal({ student, onClose, onEdit, onDeleted }: Props) {
  const [licenseNumber, setLicenseNumber] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!window.confirm(`「${student.last_name} ${student.first_name}」を削除しますか？\n\n申込情報もすべて削除されます。この操作は取り消せません。`)) return
    setDeleting(true)
    await studentsApi.delete(student.id)
    onDeleted?.()
  }

  useEffect(() => {
    enrollmentsApi.list(student.id).then(enrollments => {
      for (let i = enrollments.length - 1; i >= 0; i--) {
        try {
          const extra = JSON.parse(enrollments[i].extra_json) as Record<string, unknown>
          if (typeof extra.license_number === 'string' && extra.license_number) {
            setLicenseNumber(extra.license_number)
            return
          }
        } catch { /* ignore */ }
      }
      setLicenseNumber('')
    })
  }, [student.id])

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
          <MemberBasicInfoReadOnly student={student} licenseNumber={licenseNumber} />
        </div>

        <div className="shrink-0 px-6 py-4 border-t border-lavender-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="btn-danger disabled:opacity-40"
          >
            この会員を削除する
          </button>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">
              閉じる
            </button>
            <button type="button" onClick={onEdit} className="btn-primary">
              編集
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
