import { useEffect, useRef, useState } from 'react'
import type { ApplicationType, Enrollment, EnrollmentInput } from '../../types'
import { enrollmentsApi } from '../../lib/api'

// ── 定数 ────────────────────────────────────────────────────

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

const LESSON_TYPES = ['一般学科', '上級学科', '実技', '学科']
const EXAM_QUAL_TYPES = ['一級', '二級', '湖川', '二級若年', '特殊']

const MENU_STORAGE_KEY = 'enrollmentMenuOptions'
const DEFAULT_MENUS = [
  '1級小型船舶操縦士',
  '2級小型船舶操縦士',
  '特殊小型船舶操縦士',
  '1級アップグレードメニュー',
  '2級アップグレードメニュー',
]

// ── 型 ───────────────────────────────────────────────────────

interface CourseSession {
  date: string
  venue: string
  time: string
  lessonType: string
}

const EMPTY_SESSION: CourseSession = { date: '', venue: '', time: '', lessonType: '' }

// ── メニュー管理 ──────────────────────────────────────────────

function loadMenus(): string[] {
  try {
    const saved = localStorage.getItem(MENU_STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as unknown
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as string[]
    }
  } catch { /* ignore */ }
  return DEFAULT_MENUS
}

function persistMenus(menus: string[]) {
  localStorage.setItem(MENU_STORAGE_KEY, JSON.stringify(menus))
}

// ── readExtra ─────────────────────────────────────────────────

interface ExtraResult {
  applicationType: ApplicationType
  courseSessions: CourseSession[]
  renewalCourseDate: string
  courseLocation: string
  courseTime: string
  examDate: string
  examLocation: string
  examStartTime: string
  examQualType: string
}

function readExtra(enrollment: Enrollment | null): ExtraResult {
  if (!enrollment) {
    return {
      applicationType: 'new',
      courseSessions: [{ ...EMPTY_SESSION }],
      renewalCourseDate: '',
      courseLocation: '', courseTime: '',
      examDate: '', examLocation: '', examStartTime: '', examQualType: '',
    }
  }

  let extra: Record<string, unknown> = {}
  try { extra = JSON.parse(enrollment.extra_json) as Record<string, unknown> } catch { /* ignore */ }

  const at: ApplicationType = (() => {
    const v = extra.application_type
    return v === 'renewal' || v === 'lapsed' ? v : 'new'
  })()

  if (at === 'new') {
    let courseSessions: CourseSession[]
    const rawSessions = extra.course_sessions

    if (Array.isArray(rawSessions) && rawSessions.length > 0) {
      courseSessions = (rawSessions as Record<string, string>[]).map(s => ({
        date:       s.date       ?? '',
        venue:      s.venue      ?? '',
        time:       s.time       ?? '',
        lessonType: s.lessonType ?? '',
      }))
    } else {
      // 旧フォーマット（course_dates + グローバル venue/time）からマイグレーション
      const rawDates = extra.course_dates
      const dates: string[] = Array.isArray(rawDates) && rawDates.length > 0
        ? rawDates as string[]
        : enrollment.course_date ? [enrollment.course_date] : ['']
      const defaultVenue = typeof extra.course_location === 'string'
        ? extra.course_location : (enrollment.venue ?? '')
      const defaultTime = typeof extra.course_time === 'string' ? extra.course_time : ''
      courseSessions = dates.map(d => ({ date: d, venue: defaultVenue, time: defaultTime, lessonType: '' }))
    }

    return {
      applicationType: 'new',
      courseSessions: courseSessions.length > 0 ? courseSessions : [{ ...EMPTY_SESSION }],
      renewalCourseDate: '',
      courseLocation: '', courseTime: '',
      examDate:      typeof extra.exam_date         === 'string' ? extra.exam_date         : '',
      examLocation:  typeof extra.exam_location     === 'string' ? extra.exam_location     : '',
      examStartTime: typeof extra.exam_start_time   === 'string' ? extra.exam_start_time   : '',
      examQualType:  typeof extra.exam_qual_type    === 'string' ? extra.exam_qual_type    : '',
    }
  }

  // 更新・失効
  const courseLocation = (typeof extra.course_location === 'string'
    ? extra.course_location : enrollment.venue) ?? ''
  const courseTime = typeof extra.course_time === 'string' ? extra.course_time : ''

  return {
    applicationType: at,
    courseSessions: [{ ...EMPTY_SESSION }],
    renewalCourseDate: enrollment.course_date ?? '',
    courseLocation, courseTime,
    examDate: '', examLocation: '', examStartTime: '', examQualType: '',
  }
}

// ── コンポーネント ────────────────────────────────────────────

interface Props {
  studentId: number
  enrollment: Enrollment | null
  onClose: () => void
  onSaved: () => void
}

export default function EnrollmentFormModal({ studentId, enrollment, onClose, onSaved }: Props) {
  const isCreating = !enrollment

  // 共通
  const [applicationType, setApplicationType] = useState<ApplicationType>('new')
  const [menu,   setMenu]   = useState('')
  const [status, setStatus] = useState<Enrollment['status']>('pending')
  const [note,   setNote]   = useState('')

  // 受講申請専用
  const [courseSessions, setCourseSessions] = useState<CourseSession[]>([{ ...EMPTY_SESSION }])
  const [examDate,       setExamDate]       = useState('')
  const [examLocation,   setExamLocation]   = useState('')
  const [examStartTime,  setExamStartTime]  = useState('')
  const [examQualType,   setExamQualType]   = useState('')

  // 更新・失効専用
  const [renewalCourseDate, setRenewalCourseDate] = useState('')
  const [courseLocation,    setCourseLocation]    = useState('')
  const [courseTime,        setCourseTime]        = useState('')

  // メニュー管理
  const [menuOptions,   setMenuOptions]   = useState<string[]>(loadMenus)
  const [showAddMenu,   setShowAddMenu]   = useState(false)
  const [newMenuName,   setNewMenuName]   = useState('')
  const [showMenuMgr,   setShowMenuMgr]   = useState(false)
  const newMenuRef = useRef<HTMLInputElement>(null)

  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  useEffect(() => {
    const ex = readExtra(enrollment)
    setApplicationType(ex.applicationType)
    setCourseSessions(ex.courseSessions)
    setRenewalCourseDate(ex.renewalCourseDate)
    setCourseLocation(ex.courseLocation)
    setCourseTime(ex.courseTime)
    setExamDate(ex.examDate)
    setExamLocation(ex.examLocation)
    setExamStartTime(ex.examStartTime)
    setExamQualType(ex.examQualType)
    setMenu(enrollment?.menu ?? '')
    setStatus(enrollment?.status ?? 'pending')
    setNote(enrollment?.note ?? '')
    setError('')
  }, [enrollment])

  useEffect(() => {
    if (showAddMenu) setTimeout(() => newMenuRef.current?.focus(), 50)
  }, [showAddMenu])

  // 種別切り替え
  const handleTypeChange = (t: ApplicationType) => {
    setApplicationType(t)
    if (t === 'new') {
      setCourseSessions([{ ...EMPTY_SESSION }])
      setExamDate(''); setExamLocation(''); setExamStartTime(''); setExamQualType('')
    } else {
      setRenewalCourseDate('')
    }
  }

  // セッション操作
  const addSession    = () => setCourseSessions(s => [...s, { ...EMPTY_SESSION }])
  const removeSession = (i: number) => setCourseSessions(s => s.filter((_, idx) => idx !== i))
  const updateSession = (i: number, field: keyof CourseSession, value: string) =>
    setCourseSessions(s => s.map((sess, idx) => idx === i ? { ...sess, [field]: value } : sess))

  // メニュー追加
  const handleAddMenu = () => {
    const name = newMenuName.trim()
    if (!name) return
    if (menuOptions.includes(name)) { setMenu(name); setShowAddMenu(false); setNewMenuName(''); return }
    const updated = [...menuOptions, name]
    setMenuOptions(updated)
    persistMenus(updated)
    setMenu(name)
    setNewMenuName('')
    setShowAddMenu(false)
  }

  // メニュー削除
  const handleDeleteMenu = (name: string) => {
    const updated = menuOptions.filter(m => m !== name)
    setMenuOptions(updated)
    persistMenus(updated)
    if (menu === name) setMenu('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (applicationType === 'new' && !menu.trim()) { setError('メニューは必須です'); return }
    setError('')
    setSaving(true)

    try {
      let prevExtra: Record<string, unknown> = {}
      try { prevExtra = JSON.parse(enrollment?.extra_json ?? '{}') as Record<string, unknown> } catch { /* ignore */ }

      const extra: Record<string, unknown> = { ...prevExtra, application_type: applicationType }

      let primaryCourseDate: string | null = null
      let primaryVenue: string | null      = null

      if (applicationType === 'new') {
        const valid = courseSessions.filter(s => s.date.trim())
        extra.course_sessions = valid
        extra.course_dates    = valid.map(s => s.date)   // CalendarModal 後方互換
        primaryCourseDate     = valid[0]?.date ?? null
        primaryVenue          = valid[0]?.venue.trim() || null
        // 後方互換（旧コードが読む場合）
        extra.course_location = valid[0]?.venue.trim() || undefined
        extra.course_time     = valid[0]?.time.trim()  || undefined

        if (examDate.trim())      extra.exam_date       = examDate.trim();       else delete extra.exam_date
        if (examLocation.trim())  extra.exam_location   = examLocation.trim();   else delete extra.exam_location
        if (examStartTime.trim()) extra.exam_start_time = examStartTime.trim();  else delete extra.exam_start_time
        if (examQualType.trim())  extra.exam_qual_type  = examQualType.trim();   else delete extra.exam_qual_type
        delete extra.course_dates_renewal
      } else {
        primaryCourseDate = renewalCourseDate.trim() || null
        primaryVenue      = courseLocation.trim() || null
        if (courseLocation.trim()) extra.course_location = courseLocation.trim(); else delete extra.course_location
        if (courseTime.trim())     extra.course_time     = courseTime.trim();     else delete extra.course_time
        delete extra.course_sessions
        delete extra.course_dates
        delete extra.exam_date
        delete extra.exam_location
        delete extra.exam_start_time
      }

      const body: EnrollmentInput = {
        student_id:  studentId,
        menu:        applicationType === 'new' ? menu.trim() : '',
        course_date: primaryCourseDate,
        venue:       primaryVenue,
        status,
        extra_json:  JSON.stringify(extra),
        note:        note.trim() || null,
      }

      if (isCreating) {
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

        {/* ヘッダー */}
        <div className="px-6 py-4 border-b border-lavender-100 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-base font-semibold text-gray-700">
            {isCreating ? '申込を追加' : '申込・講習情報を編集'}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none" tabIndex={-1}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* ① 申込種別 */}
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

          {/* ② 受講申請専用フィールド */}
          {isNewType && (
            <>
              {/* メニュー */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="field-label mb-0">
                    メニュー<span className="text-red-400 ml-0.5">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowMenuMgr(m => !m)}
                    className="text-xs text-lavender-400 hover:text-lavender-600"
                  >
                    メニュー管理
                  </button>
                </div>

                <div className="flex gap-2">
                  <select
                    value={menu}
                    onChange={(e) => {
                      if (e.target.value === '__add__') { setShowAddMenu(true); setMenu('') }
                      else { setMenu(e.target.value); setShowAddMenu(false) }
                    }}
                    className="field-select flex-1"
                  >
                    <option value="">-- 選択してください --</option>
                    {menuOptions.map(m => <option key={m} value={m}>{m}</option>)}
                    <option value="__add__">＋ 新しいメニューを追加...</option>
                  </select>
                </div>

                {/* 新メニュー入力 */}
                {showAddMenu && (
                  <div className="mt-2 flex gap-2">
                    <input
                      ref={newMenuRef}
                      type="text"
                      value={newMenuName}
                      onChange={e => setNewMenuName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddMenu() } }}
                      className="field-input flex-1"
                      placeholder="メニュー名を入力"
                    />
                    <button type="button" onClick={handleAddMenu} className="btn-primary btn-sm">追加</button>
                    <button type="button" onClick={() => { setShowAddMenu(false); setNewMenuName('') }} className="btn-secondary btn-sm">×</button>
                  </div>
                )}

                {/* メニュー管理パネル */}
                {showMenuMgr && (
                  <div className="mt-2 border border-lavender-100 rounded-xl p-3 bg-lavender-50/30 max-h-44 overflow-y-auto">
                    <p className="text-xs text-gray-400 mb-2">登録メニュー（×で削除）</p>
                    <div className="flex flex-wrap gap-1.5">
                      {menuOptions.map(m => (
                        <span key={m} className="flex items-center gap-1 text-xs bg-white border border-lavender-100 rounded-full px-2.5 py-1">
                          {m}
                          <button
                            type="button"
                            onClick={() => handleDeleteMenu(m)}
                            className="text-gray-300 hover:text-red-400 leading-none ml-0.5"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 講習日程（複数・各行に会場・時刻・講習内容） */}
              <fieldset>
                <legend className="text-xs font-semibold text-lavender-400 uppercase tracking-wide mb-2">講習日程</legend>
                <div className="space-y-2">
                  {courseSessions.map((session, i) => (
                    <div key={i} className="border border-lavender-100 rounded-xl p-3 space-y-2 bg-lavender-50/20">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-lavender-500">日程 {i + 1}</span>
                        {courseSessions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSession(i)}
                            className="text-xs text-red-400 hover:text-red-600"
                          >
                            削除
                          </button>
                        )}
                      </div>

                      {/* 日付 */}
                      <div>
                        <label className="field-label">日付</label>
                        <input
                          type="date"
                          value={session.date}
                          onChange={e => updateSession(i, 'date', e.target.value)}
                          className="field-input"
                        />
                      </div>

                      {/* 会場・時刻 */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="field-label">会場</label>
                          <input
                            type="text"
                            value={session.venue}
                            onChange={e => updateSession(i, 'venue', e.target.value)}
                            className="field-input"
                            placeholder="講習会場"
                          />
                        </div>
                        <div>
                          <label className="field-label">開始時刻</label>
                          <input
                            type="text"
                            value={session.time}
                            onChange={e => updateSession(i, 'time', e.target.value)}
                            className="field-input"
                            placeholder="例：09:00"
                          />
                        </div>
                      </div>

                      {/* 講習内容 */}
                      <div>
                        <label className="field-label">講習内容</label>
                        <div className="flex flex-wrap gap-1.5">
                          {LESSON_TYPES.map(lt => (
                            <button
                              key={lt}
                              type="button"
                              onClick={() => updateSession(i, 'lessonType', session.lessonType === lt ? '' : lt)}
                              className={[
                                'px-3 py-1 rounded-full text-xs font-medium border transition',
                                session.lessonType === lt
                                  ? 'bg-lavender-400 text-white border-lavender-400'
                                  : 'bg-white text-gray-500 border-gray-200 hover:border-lavender-300',
                              ].join(' ')}
                            >
                              {lt}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* 日程追加ボタン */}
                  <button
                    type="button"
                    onClick={addSession}
                    className="w-full py-2 border border-dashed border-lavender-200 rounded-xl text-xs text-lavender-400 hover:border-lavender-400 hover:text-lavender-600 transition"
                  >
                    ＋ 日程を追加
                  </button>
                </div>
              </fieldset>

              {/* 試験 */}
              <fieldset className="border border-lavender-100 rounded-xl p-4 space-y-3">
                <legend className="text-xs font-semibold text-lavender-400 uppercase tracking-wide px-1">試験</legend>

                {/* 受験種別 */}
                <div>
                  <label className="field-label">受験種別</label>
                  <div className="flex gap-2">
                    {EXAM_QUAL_TYPES.map(q => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setExamQualType(examQualType === q ? '' : q)}
                        className={[
                          'flex-1 py-1.5 rounded-lg border text-sm font-medium transition',
                          examQualType === q
                            ? 'bg-lavender-400 text-white border-lavender-400'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-lavender-300',
                        ].join(' ')}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">試験日</label>
                    <input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} className="field-input" />
                  </div>
                  <div>
                    <label className="field-label">試験開始時間</label>
                    <input type="text" value={examStartTime} onChange={e => setExamStartTime(e.target.value)} className="field-input" placeholder="例：10:00" />
                  </div>
                </div>
                <div>
                  <label className="field-label">試験地</label>
                  <input type="text" value={examLocation} onChange={e => setExamLocation(e.target.value)} className="field-input" placeholder="試験会場" />
                </div>
              </fieldset>
            </>
          )}

          {/* ③ 更新講習・失効再交付専用フィールド */}
          {!isNewType && (
            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold text-lavender-400 uppercase tracking-wide mb-2">講習</legend>
              <div>
                <label className="field-label">講習日</label>
                <input type="date" value={renewalCourseDate} onChange={e => setRenewalCourseDate(e.target.value)} className="field-input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">講習地</label>
                  <input type="text" value={courseLocation} onChange={e => setCourseLocation(e.target.value)} className="field-input" placeholder="講習会場" />
                </div>
                <div>
                  <label className="field-label">講習時間</label>
                  <input type="text" value={courseTime} onChange={e => setCourseTime(e.target.value)} className="field-input" placeholder="例：14:00" />
                </div>
              </div>
            </fieldset>
          )}

          {/* ④ ステータス・備考（共通） */}
          <div>
            <label className="field-label">ステータス</label>
            <select value={status} onChange={e => setStatus(e.target.value as Enrollment['status'])} className="field-select">
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label className="field-label">備考</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} className="field-input min-h-[72px] resize-y" rows={3} />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-lavender-100">
            <button type="button" onClick={onClose} className="btn-secondary">キャンセル</button>
            <button type="submit" disabled={saving} className="btn-primary min-w-[88px]">
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
