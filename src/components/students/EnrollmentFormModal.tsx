import { useEffect, useState } from 'react'
import type { ApplicationType, Enrollment, EnrollmentInput } from '../../types'
import { enrollmentsApi } from '../../lib/api'

const APP_TYPE_OPTIONS: { value: ApplicationType; label: string }[] = [
  { value: 'new',     label: '受講申請' },
  { value: 'renewal', label: '更新講習' },
  { value: 'lapsed',  label: '失効再交付' },
]

const STATUS_OPTIONS: { value: Enrollment['status']; label: string }[] = [
  { value: 'pending',   label: '未確定' },
  { value: 'confirmed', label: '確定' },
  { value: 'completed', label: '完了' },
  { value: 'cancelled', label: 'キャンセル' },
]

const TYPE_ACTIVE_CLASS: Record<ApplicationType, string> = {
  new:     'bg-mint-50 border-mint-300 text-mint-700',
  renewal: 'bg-blue-50 border-blue-300 text-blue-700',
  lapsed:  'bg-orange-50 border-orange-300 text-orange-700',
}

// extra_json から各フィールドを読み出す
function readExtra(enrollment: Enrollment | null): {
  applicationType: ApplicationType
  courseDates: string[]       // 受講申請用（複数日）
  renewalCourseDate: string   // 更新・失効用（単一日）
  courseLocation: string
  courseTime: string
  examDate: string
  examLocation: string
  examStartTime: string
} {
  if (!enrollment) {
    return {
      applicationType: 'new',
      courseDates: [''],
      renewalCourseDate: '',
      courseLocation: '',
      courseTime: '',
      examDate: '',
      examLocation: '',
      examStartTime: '',
    }
  }

  let extra: Record<string, unknown> = {}
  try { extra = JSON.parse(enrollment.extra_json) as Record<string, unknown> } catch {}

  const at = ((): ApplicationType => {
    const v = extra.application_type
    return v === 'renewal' || v === 'lapsed' ? v : 'new'
  })()

  const courseLocation = (typeof extra.course_location === 'string' ? extra.course_location : enrollment.venue) ?? ''
  const courseTime = typeof extra.course_time === 'string' ? extra.course_time : ''

  if (at === 'new') {
    const rawDates = extra.course_dates
    const courseDates: string[] = Array.isArray(rawDates) && rawDates.length > 0
      ? (rawDates as string[])
      : enrollment.course_date ? [enrollment.course_date] : ['']
    return {
      applicationType: 'new',
      courseDates,
      renewalCourseDate: '',
      courseLocation,
      courseTime,
      examDate:      typeof extra.exam_date       === 'string' ? extra.exam_date       : '',
      examLocation:  typeof extra.exam_location   === 'string' ? extra.exam_location   : '',
      examStartTime: typeof extra.exam_start_time === 'string' ? extra.exam_start_time : '',
    }
  } else {
    return {
      applicationType: at,
      courseDates: [''],
      renewalCourseDate: enrollment.course_date ?? '',
      courseLocation,
      courseTime,
      examDate: '', examLocation: '', examStartTime: '',
    }
  }
}

interface Props {
  studentId: number
  enrollment: Enrollment | null
  onClose: () => void
  onSaved: () => void
}

export default function EnrollmentFormModal({ studentId, enrollment, onClose, onSaved }: Props) {
  const isNew = !enrollment

  // 共通
  const [applicationType, setApplicationType] = useState<ApplicationType>('new')
  const [menu, setMenu]       = useState('')
  const [status, setStatus]   = useState<Enrollment['status']>('pending')
  const [note, setNote]       = useState('')

  // 受講申請専用
  const [courseDates,    setCourseDates]    = useState<string[]>([''])
  const [examDate,       setExamDate]       = useState('')
  const [examLocation,   setExamLocation]   = useState('')
  const [examStartTime,  setExamStartTime]  = useState('')

  // 更新・失効専用
  const [renewalCourseDate, setRenewalCourseDate] = useState('')

  // 共通（場所・時間）
  const [courseLocation, setCourseLocation] = useState('')
  const [courseTime,     setCourseTime]     = useState('')

  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  useEffect(() => {
    const ex = readExtra(enrollment)
    setApplicationType(ex.applicationType)
    setCourseDates(ex.courseDates)
    setRenewalCourseDate(ex.renewalCourseDate)
    setCourseLocation(ex.courseLocation)
    setCourseTime(ex.courseTime)
    setExamDate(ex.examDate)
    setExamLocation(ex.examLocation)
    setExamStartTime(ex.examStartTime)
    setMenu(enrollment?.menu ?? '')
    setStatus(enrollment?.status ?? 'pending')
    setNote(enrollment?.note ?? '')
    setError('')
  }, [enrollment])

  // 種別切り替え時：種別固有フィールドのみリセット
  const handleTypeChange = (t: ApplicationType) => {
    setApplicationType(t)
    if (t === 'new') {
      setCourseDates([''])
      setExamDate(''); setExamLocation(''); setExamStartTime('')
    } else {
      setRenewalCourseDate('')
    }
  }

  // 受講申請の複数日操作
  const addDate    = () => setCourseDates((d) => [...d, ''])
  const removeDate = (i: number) => setCourseDates((d) => d.filter((_, idx) => idx !== i))
  const updateDate = (i: number, v: string) =>
    setCourseDates((d) => d.map((x, idx) => (idx === i ? v : x)))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (applicationType === 'new' && !menu.trim()) { setError('メニューは必須です'); return }
    setError('')
    setSaving(true)

    try {
      let prevExtra: Record<string, unknown> = {}
      try { prevExtra = JSON.parse(enrollment?.extra_json ?? '{}') as Record<string, unknown> } catch {}

      const extra: Record<string, unknown> = { ...prevExtra, application_type: applicationType }

      // 講習地・講習時間（共通）
      if (courseLocation.trim()) extra.course_location = courseLocation.trim()
      else delete extra.course_location
      if (courseTime.trim()) extra.course_time = courseTime.trim()
      else delete extra.course_time

      let primaryCourseDate: string | null = null

      if (applicationType === 'new') {
        const valid = courseDates.filter((d) => d.trim())
        extra.course_dates = valid
        primaryCourseDate  = valid[0] ?? null
        if (examDate.trim())      extra.exam_date       = examDate.trim(); else delete extra.exam_date
        if (examLocation.trim())  extra.exam_location   = examLocation.trim(); else delete extra.exam_location
        if (examStartTime.trim()) extra.exam_start_time = examStartTime.trim(); else delete extra.exam_start_time
        // 更新・失効系フィールドを削除
        delete extra.course_dates_renewal
      } else {
        primaryCourseDate = renewalCourseDate.trim() || null
        // 受講申請系フィールドを削除
        delete extra.course_dates
        delete extra.exam_date
        delete extra.exam_location
        delete extra.exam_start_time
      }

      const body: EnrollmentInput = {
        student_id:  studentId,
        menu:        applicationType === 'new' ? menu.trim() : '',
        course_date: primaryCourseDate,
        venue:       courseLocation.trim() || null,
        status,
        extra_json:  JSON.stringify(extra),
        note:        note.trim() || null,
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

  const isNewType = applicationType === 'new'

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-lavender-100 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl">
          <h2 className="text-base font-semibold text-gray-700">
            {isNew ? '申込を追加' : '申込・講習情報を編集'}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none" tabIndex={-1}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* ① 申込種別（最上部） */}
          <div>
            <label className="field-label">申込種別</label>
            <div className="flex gap-2">
              {APP_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleTypeChange(opt.value)}
                  className={[
                    'flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition',
                    applicationType === opt.value
                      ? TYPE_ACTIVE_CLASS[opt.value]
                      : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300',
                  ].join(' ')}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* ③-A 受講申請 専用フィールド */}
          {isNewType && (
            <>
              {/* メニュー（受講申請のみ） */}
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

              <fieldset className="space-y-3">
                <legend className="text-xs font-semibold text-lavender-400 uppercase tracking-wide mb-2">講習</legend>

                {/* 講習日（複数可） */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="field-label mb-0">講習日</label>
                    <button
                      type="button"
                      onClick={addDate}
                      className="text-xs text-lavender-500 hover:text-lavender-700 font-medium flex items-center gap-0.5"
                    >
                      ＋ 日程を追加
                    </button>
                  </div>
                  <div className="space-y-2">
                    {courseDates.map((d, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <input
                          type="date"
                          value={d}
                          onChange={(e) => updateDate(i, e.target.value)}
                          className="field-input flex-1"
                        />
                        {courseDates.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeDate(i)}
                            className="text-gray-300 hover:text-red-400 text-base leading-none px-1"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">講習地</label>
                    <input
                      type="text"
                      value={courseLocation}
                      onChange={(e) => setCourseLocation(e.target.value)}
                      className="field-input"
                      placeholder="講習会場"
                    />
                  </div>
                  <div>
                    <label className="field-label">講習時間</label>
                    <input
                      type="text"
                      value={courseTime}
                      onChange={(e) => setCourseTime(e.target.value)}
                      className="field-input"
                      placeholder="例：09:00"
                    />
                  </div>
                </div>
              </fieldset>

              <fieldset className="border border-lavender-100 rounded-xl p-4 space-y-3">
                <legend className="text-xs font-semibold text-lavender-400 uppercase tracking-wide px-1">試験</legend>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">試験日</label>
                    <input
                      type="date"
                      value={examDate}
                      onChange={(e) => setExamDate(e.target.value)}
                      className="field-input"
                    />
                  </div>
                  <div>
                    <label className="field-label">試験開始時間</label>
                    <input
                      type="text"
                      value={examStartTime}
                      onChange={(e) => setExamStartTime(e.target.value)}
                      className="field-input"
                      placeholder="例：10:00"
                    />
                  </div>
                </div>
                <div>
                  <label className="field-label">試験地</label>
                  <input
                    type="text"
                    value={examLocation}
                    onChange={(e) => setExamLocation(e.target.value)}
                    className="field-input"
                    placeholder="試験会場"
                  />
                </div>
              </fieldset>
            </>
          )}

          {/* ③-B 更新講習・失効再交付 専用フィールド */}
          {!isNewType && (
            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold text-lavender-400 uppercase tracking-wide mb-2">講習</legend>
              <div>
                <label className="field-label">講習日</label>
                <input
                  type="date"
                  value={renewalCourseDate}
                  onChange={(e) => setRenewalCourseDate(e.target.value)}
                  className="field-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">講習地</label>
                  <input
                    type="text"
                    value={courseLocation}
                    onChange={(e) => setCourseLocation(e.target.value)}
                    className="field-input"
                    placeholder="講習会場"
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
            </fieldset>
          )}

          {/* ④ ステータス・備考（共通） */}
          <div>
            <label className="field-label">ステータス</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Enrollment['status'])}
              className="field-select"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label">備考</label>
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
