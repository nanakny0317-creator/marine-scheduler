import { useEffect, useState } from 'react'
import type { ApplicationType, Enrollment, EnrollmentInput } from '../../types'
import { enrollmentsApi } from '../../lib/api'

const APP_TYPE_OPTIONS: { value: ApplicationType; label: string }[] = [
  { value: 'new', label: '受講申請' },
  { value: 'renewal', label: '更新講習' },
  { value: 'lapsed', label: '失効再交付' },
]

const STATUS_OPTIONS: { value: Enrollment['status']; label: string }[] = [
  { value: 'pending', label: '未確定' },
  { value: 'confirmed', label: '確定' },
  { value: 'completed', label: '完了' },
  { value: 'cancelled', label: 'キャンセル' },
]

function buildExtraJson(
  prevJson: string,
  application_type: ApplicationType,
  course_time: string
): string {
  let base: Record<string, unknown> = {}
  try {
    base = JSON.parse(prevJson) as Record<string, unknown>
  } catch {
    /* 空オブジェクト */
  }
  base.application_type = application_type
  const t = course_time.trim()
  if (t) base.course_time = t
  else delete base.course_time
  return JSON.stringify(base)
}

function readExtra(enrollment: Enrollment | null): {
  application_type: ApplicationType
  course_time: string
} {
  if (!enrollment) return { application_type: 'new', course_time: '' }
  try {
    const j = JSON.parse(enrollment.extra_json) as Record<string, unknown>
    const at = j.application_type
    const application_type: ApplicationType =
      at === 'renewal' || at === 'lapsed' || at === 'new' ? at : 'new'
    const ct = j.course_time
    return {
      application_type,
      course_time: typeof ct === 'string' ? ct : '',
    }
  } catch {
    return { application_type: 'new', course_time: '' }
  }
}

interface Props {
  studentId: number
  enrollment: Enrollment | null
  onClose: () => void
  onSaved: () => void
}

export default function EnrollmentFormModal({
  studentId,
  enrollment,
  onClose,
  onSaved,
}: Props) {
  const isNew = !enrollment
  const [menu, setMenu] = useState('')
  const [courseDate, setCourseDate] = useState('')
  const [courseTime, setCourseTime] = useState('')
  const [venue, setVenue] = useState('')
  const [status, setStatus] = useState<Enrollment['status']>('pending')
  const [note, setNote] = useState('')
  const [applicationType, setApplicationType] = useState<ApplicationType>('new')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (enrollment) {
      setMenu(enrollment.menu)
      setCourseDate(enrollment.course_date ?? '')
      setVenue(enrollment.venue ?? '')
      setStatus(enrollment.status)
      setNote(enrollment.note ?? '')
      const ex = readExtra(enrollment)
      setApplicationType(ex.application_type)
      setCourseTime(ex.course_time)
    } else {
      setMenu('')
      setCourseDate('')
      setVenue('')
      setStatus('pending')
      setNote('')
      setApplicationType('new')
      setCourseTime('')
    }
    setError('')
  }, [enrollment])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!menu.trim()) {
      setError('メニューは必須です')
      return
    }
    setError('')
    setSaving(true)
    try {
      const extra_json = buildExtraJson(
        enrollment?.extra_json ?? '{}',
        applicationType,
        courseTime
      )
      const body: EnrollmentInput = {
        student_id: studentId,
        menu: menu.trim(),
        course_date: courseDate.trim() || null,
        venue: venue.trim() || null,
        status,
        extra_json,
        note: note.trim() || null,
      }
      if (isNew) {
        await enrollmentsApi.create(body)
      } else {
        await enrollmentsApi.update(enrollment.id, body)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-lavender-100 flex items-center justify-between sticky top-0 bg-white">
          <h2 className="text-base font-semibold text-gray-700">
            {isNew ? '申込を追加' : '講習日程・申込を編集'}
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div>
            <label className="field-label">
              メニュー<span className="text-red-400 ml-0.5">*</span>
            </label>
            <input
              type="text"
              value={menu}
              onChange={(e) => setMenu(e.target.value)}
              className="field-input"
              placeholder="例：アップグレードメニュー"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">講習日</label>
              <input
                type="date"
                value={courseDate}
                onChange={(e) => setCourseDate(e.target.value)}
                className="field-input"
              />
            </div>
            <div>
              <label className="field-label">講習時間</label>
              <input
                type="text"
                value={courseTime}
                onChange={(e) => setCourseTime(e.target.value)}
                className="field-input"
                placeholder="例：14:00"
              />
            </div>
          </div>

          <div>
            <label className="field-label">会場</label>
            <input
              type="text"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              className="field-input"
              placeholder="講習・試験会場"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">申込種別</label>
              <select
                value={applicationType}
                onChange={(e) => setApplicationType(e.target.value as ApplicationType)}
                className="field-select"
              >
                {APP_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">ステータス</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Enrollment['status'])}
                className="field-select"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="field-label">備考（申込）</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="field-input min-h-[72px] resize-y"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-lavender-100">
            <button type="button" onClick={onClose} className="btn-secondary">
              キャンセル
            </button>
            <button type="submit" disabled={saving} className="btn-primary min-w-[88px]">
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
