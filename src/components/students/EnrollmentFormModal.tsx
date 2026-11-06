import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { ApplicationType, Classroom, Enrollment, EnrollmentInput, ExamSession, RenewalSession } from '../../types'
import { classroomsApi, enrollmentsApi, examSessionsApi, renewalSessionsApi } from '../../lib/api'
import { NATIONALITIES } from '../../data/masterData'
import Section from '../FormSection'
import VenueSelect from '../VenueSelect'

// ── 定数 ────────────────────────────────────────────────────

const APP_TYPE_OPTIONS: { value: ApplicationType; label: string }[] = [
  { value: 'new',     label: '試験申請' },
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
const EXAM_QUAL_TYPES = ['一級', '二級', '特殊', '湖川']  // 試験記録と同じ

function fmtShortDate(d: string) {
  try { return format(new Date(d), 'yyyy/M/d(E)', { locale: ja }) } catch { return d }
}

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
  domicile: string
  nationality: string
}

function readExtra(enrollment: Enrollment | null): ExtraResult {
  if (!enrollment) {
    return {
      applicationType: 'new',
      courseSessions: [{ ...EMPTY_SESSION }],
      renewalCourseDate: '',
      courseLocation: '', courseTime: '',
      examDate: '', examLocation: '', examStartTime: '', examQualType: '',
      domicile: '', nationality: '',
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
      domicile:     typeof extra.domicile    === 'string' ? extra.domicile    : '',
      nationality:  typeof extra.nationality === 'string' ? extra.nationality : '',
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
    domicile:    typeof extra.domicile    === 'string' ? extra.domicile    : '',
    nationality: typeof extra.nationality === 'string' ? extra.nationality : '',
  }
}

// ── コンポーネント ────────────────────────────────────────────

/**
 * 申込入力欄（申込種別〜ステータス・備考）の状態とUIをまとめたフック。
 * 「受講者を追加」画面と、スケジュール等から開く申込編集モーダルの両方で使い、入力画面を統一する。
 */
export function useEnrollmentForm(enrollment: Enrollment | null) {
  // 共通
  const [applicationType, setApplicationType] = useState<ApplicationType>('new')
  const [menu,   setMenu]   = useState('')
  const [status, setStatus] = useState<Enrollment['status']>('pending')
  const [note,   setNote]   = useState('')

  // 試験申請専用
  const [courseSessions, setCourseSessions] = useState<CourseSession[]>([{ ...EMPTY_SESSION }])
  const [examDate,       setExamDate]       = useState('')
  const [examLocation,   setExamLocation]   = useState('')
  const [examStartTime,  setExamStartTime]  = useState('')
  const [examQualType,   setExamQualType]   = useState('')

  // 更新・失効専用
  const [renewalCourseDate, setRenewalCourseDate] = useState('')
  const [courseLocation,    setCourseLocation]    = useState('')
  const [courseTime,        setCourseTime]        = useState('')

  // 本籍・国籍（全種別共通）
  const [domicile,   setDomicile]   = useState('')
  const [nationality, setNationality] = useState('')

  // メニュー管理
  const [menuOptions,   setMenuOptions]   = useState<string[]>(loadMenus)
  const [showAddMenu,   setShowAddMenu]   = useState(false)
  const [newMenuName,   setNewMenuName]   = useState('')
  const [showMenuMgr,   setShowMenuMgr]   = useState(false)
  const newMenuRef = useRef<HTMLInputElement>(null)

  // 事前登録済み日程
  const [examSessions,    setExamSessions]    = useState<ExamSession[]>([])
  const [renewalSessions, setRenewalSessions] = useState<RenewalSession[]>([])
  const [classrooms,      setClassrooms]      = useState<Classroom[]>([])

  const [menuError, setMenuError] = useState(false)

  useEffect(() => {
    examSessionsApi.list().then(setExamSessions).catch(() => setExamSessions([]))
    renewalSessionsApi.list().then(setRenewalSessions).catch(() => setRenewalSessions([]))
    classroomsApi.list().then(setClassrooms).catch(() => setClassrooms([]))
  }, [])

  const today = format(new Date(), 'yyyy-MM-dd')

  // ── 試験日程：資格種別 → 試験日 ⇄ 試験地 を相互に絞り込み ──
  // 今日以降の日程のみ（ただし現在の選択値は過去でも候補に残す）
  const qualSessions = examSessions.filter(s =>
    s.qualification_type === examQualType &&
    (s.exam_date >= today || s.exam_date === examDate)
  )
  const uniq = (xs: string[]) => [...new Set(xs)]
  const examDateOptions = uniq(
    qualSessions.filter(s => !examLocation || s.exam_location === examLocation).map(s => s.exam_date)
  ).sort()
  const examLocationOptions = uniq(
    qualSessions.filter(s => !examDate || s.exam_date === examDate).map(s => s.exam_location)
  ).sort((a, b) => a.localeCompare(b, 'ja'))
  const matchedExamSession = qualSessions.find(s =>
    s.exam_date === examDate && s.exam_location === examLocation
  ) ?? null
  // マスター未登録の既存値（旧データの手入力など）は消さずに選択肢へ残す
  const legacyExamDate     = examDate     && !examDateOptions.includes(examDate)         ? examDate     : ''
  const legacyExamLocation = examLocation && !examLocationOptions.includes(examLocation) ? examLocation : ''

  const handleExamQualChange = (q: string) => {
    const next = examQualType === q ? '' : q
    setExamQualType(next)
    // 種別を変えたら、その種別に存在しない日程・会場はクリア
    const nextSessions = examSessions.filter(s => s.qualification_type === next)
    if (examDate && !nextSessions.some(s => s.exam_date === examDate)) setExamDate('')
    if (examLocation && !nextSessions.some(s => s.exam_location === examLocation)) setExamLocation('')
  }
  const handleExamDateChange = (d: string) => {
    setExamDate(d)
    // 選んだ日に選択中の会場で試験がなければ会場をクリア（1会場しかなければ自動選択）
    const locs = uniq(qualSessions.filter(s => s.exam_date === d).map(s => s.exam_location))
    if (d && examLocation && !locs.includes(examLocation)) setExamLocation(locs.length === 1 ? locs[0] : '')
    else if (d && !examLocation && locs.length === 1) setExamLocation(locs[0])
  }
  const handleExamLocationChange = (loc: string) => {
    setExamLocation(loc)
    const dates = uniq(qualSessions.filter(s => s.exam_location === loc).map(s => s.exam_date))
    if (loc && examDate && !dates.includes(examDate)) setExamDate(dates.length === 1 ? dates[0] : '')
    else if (loc && !examDate && dates.length === 1) setExamDate(dates[0])
  }

  // 更新講習日程の候補
  const renewalCandidates = renewalSessions.filter(s =>
    s.course_date >= today || (s.course_date === renewalCourseDate && s.location === courseLocation)
  )
  const selectedRenewalSession = renewalCandidates.find(s =>
    s.course_date === renewalCourseDate && s.location === courseLocation && s.start_time === courseTime
  ) ?? renewalCandidates.find(s =>
    s.course_date === renewalCourseDate && s.location === courseLocation
  )
  const handleSelectRenewalSession = (idStr: string) => {
    const s = renewalSessions.find(x => String(x.id) === idStr)
    if (!s) return
    setRenewalCourseDate(s.course_date)
    setCourseLocation(s.location)
    setCourseTime(s.start_time)
  }

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
    setDomicile(ex.domicile)
    setNationality(ex.nationality)
    setMenuError(false)
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

  /** 入力チェック。問題があればエラーメッセージを返す */
  const validate = (): string | null => {
    if (applicationType === 'new' && !menu.trim()) { setMenuError(true); return 'メニューは必須です' }
    setMenuError(false)
    return null
  }

  /** 保存用データを組み立てる（既存の extra_json の他項目は保持） */
  const buildInput = (studentId: number): EnrollmentInput => {
    let prevExtra: Record<string, unknown> = {}
    try { prevExtra = JSON.parse(enrollment?.extra_json ?? '{}') as Record<string, unknown> } catch { /* ignore */ }

    const extra: Record<string, unknown> = { ...prevExtra, application_type: applicationType }
    if (domicile.trim())    extra.domicile    = domicile.trim();    else delete extra.domicile
    if (nationality.trim()) extra.nationality = nationality.trim(); else delete extra.nationality

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
      if (matchedExamSession) {
        extra.exam_session_id = matchedExamSession.id
        extra.exam_id         = matchedExamSession.exam_id
        if (matchedExamSession.gakka_venue)   extra.exam_gakka_venue   = matchedExamSession.gakka_venue;   else delete extra.exam_gakka_venue
        if (matchedExamSession.jitsugi_venue) extra.exam_jitsugi_venue = matchedExamSession.jitsugi_venue; else delete extra.exam_jitsugi_venue
      } else {
        delete extra.exam_session_id
        delete extra.exam_id
        delete extra.exam_gakka_venue
        delete extra.exam_jitsugi_venue
      }
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
      delete extra.exam_qual_type
      delete extra.exam_session_id
      delete extra.exam_id
      delete extra.exam_gakka_venue
      delete extra.exam_jitsugi_venue
    }

    return {
      student_id:  studentId,
      menu:        applicationType === 'new' ? menu.trim() : '',
      course_date: primaryCourseDate,
      venue:       primaryVenue,
      status,
      extra_json:  JSON.stringify(extra),
      note:        note.trim() || null,
    }
  }

  const isNewType = applicationType === 'new'

  const fields = (
    <div className="grid grid-cols-2 gap-4 bg-lavender-50/30 -mx-2 p-2 rounded-2xl items-start">

      {/* ① 申込種別 */}
      <Section step="1" title="申込種別" className="col-span-2">
        <div className="flex gap-2">
          {APP_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleTypeChange(opt.value)}
              className={[
                'flex-1 py-2.5 px-3 rounded-lg text-sm font-semibold border-2 transition',
                applicationType === opt.value
                  ? TYPE_ACTIVE_CLASS[opt.value]
                  : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Section>

      {/* ── 左カラム ── */}
      <div className="space-y-4">
        {isNewType ? (
          <>
            {/* ② 受講メニュー */}
            <Section
              step="2"
              title="受講メニュー"
              hint="* 必須"
              action={
                <button
                  type="button"
                  onClick={() => setShowMenuMgr(m => !m)}
                  className="text-xs text-lavender-500 hover:text-lavender-700"
                >
                  {showMenuMgr ? 'メニュー管理を閉じる' : 'メニュー管理'}
                </button>
              }
            >
              <select
                value={menu}
                onChange={(e) => {
                  if (e.target.value === '__add__') { setShowAddMenu(true); setMenu('') }
                  else { setMenu(e.target.value); setShowAddMenu(false) }
                }}
                className={`field-select ${menuError && !menu ? 'ring-2 ring-red-300 border-red-300' : ''}`}
              >
                <option value="">-- 選択してください --</option>
                {menuOptions.map(m => <option key={m} value={m}>{m}</option>)}
                <option value="__add__">＋ 新しいメニューを追加...</option>
              </select>

              {/* 新メニュー入力 */}
              {showAddMenu && (
                <div className="flex gap-2">
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
                <div className="border border-lavender-100 rounded-lg p-3 bg-lavender-50/30 max-h-36 overflow-y-auto">
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
            </Section>

            {/* ③ 講習日程 */}
            <Section step="3" title="講習日程" hint="任意">
              <p className="text-xs text-gray-400 -mt-1">
                試験前の授業。再受験などで講習を受けない場合は空欄のままで保存できます
              </p>
              {courseSessions.map((session, i) => (
                <div key={i} className="rounded-lg border border-lavender-100 bg-lavender-50/20 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-lavender-500">日程 {i + 1}</span>
                    {courseSessions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSession(i)}
                        className="ml-auto text-xs text-red-400 hover:text-red-600"
                      >
                        削除
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-[1fr_1fr_6rem] gap-2">
                    <div>
                      <label className="field-label">日付</label>
                      <input
                        type="date"
                        value={session.date}
                        onChange={e => updateSession(i, 'date', e.target.value)}
                        className="field-input"
                      />
                    </div>
                    <div>
                      <label className="field-label">会場</label>
                      <select
                        value={session.venue}
                        onChange={e => updateSession(i, 'venue', e.target.value)}
                        className="field-select"
                      >
                        <option value="">{classrooms.length === 0 ? '-- 未登録（トップ「会場・日程の設定」で登録） --' : '-- 選択 --'}</option>
                        {session.venue && !classrooms.some(c => c.name === session.venue) && (
                          <option value={session.venue}>{session.venue}（未登録）</option>
                        )}
                        {classrooms.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="field-label">開始時刻</label>
                      <input
                        type="text"
                        value={session.time}
                        onChange={e => updateSession(i, 'time', e.target.value)}
                        className="field-input"
                        placeholder="09:00"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 shrink-0">講習内容</span>
                    <div className="flex flex-wrap gap-1.5">
                      {LESSON_TYPES.map(lt => (
                        <button
                          key={lt}
                          type="button"
                          onClick={() => updateSession(i, 'lessonType', session.lessonType === lt ? '' : lt)}
                          className={[
                            'px-3 py-0.5 rounded-full text-xs font-medium border transition',
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
              <button
                type="button"
                onClick={addSession}
                className="w-full py-2 border border-dashed border-lavender-200 rounded-lg text-xs text-lavender-400 hover:border-lavender-400 hover:text-lavender-600 transition"
              >
                ＋ 日程を追加
              </button>
            </Section>
          </>
        ) : (
          /* ② 講習（更新・失効） */
          <Section step="2" title="講習">
            <div>
              <label className="field-label">登録済み日程から選択</label>
              <select
                value={selectedRenewalSession ? String(selectedRenewalSession.id) : ''}
                onChange={e => handleSelectRenewalSession(e.target.value)}
                className="field-select"
              >
                <option value="">
                  {renewalCandidates.length === 0 ? '-- 登録済みの日程がありません --' : '-- 選択してください（手入力も可） --'}
                </option>
                {renewalCandidates.map(s => (
                  <option key={s.id} value={s.id}>
                    {fmtShortDate(s.course_date)}{s.start_time ? ` ${s.start_time}` : ''}　{s.location}{s.note ? `（${s.note}）` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">講習日</label>
              <input type="date" value={renewalCourseDate} onChange={e => setRenewalCourseDate(e.target.value)} className="field-input" />
            </div>
            <div className="grid grid-cols-[1fr_8rem] gap-3">
              <div>
                <label className="field-label">講習地</label>
                <VenueSelect value={courseLocation} onChange={setCourseLocation} />
              </div>
              <div>
                <label className="field-label">講習時間</label>
                <input type="text" value={courseTime} onChange={e => setCourseTime(e.target.value)} className="field-input" placeholder="14:00" />
              </div>
            </div>
          </Section>
        )}
      </div>

      {/* ── 右カラム ── */}
      <div className="space-y-4">
        {/* ④ 試験（試験申請のみ） */}
        {isNewType && (
          <Section step="4" title="試験">
            <div>
              <label className="field-label">資格種別</label>
              <div className="flex gap-2">
                {EXAM_QUAL_TYPES.map(q => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => handleExamQualChange(q)}
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
            {!examQualType ? (
              <p className="text-xs text-gray-400">資格種別を選ぶと、登録済みの試験日程から選択できます</p>
            ) : qualSessions.length === 0 && !examDate && !examLocation ? (
              <p className="text-xs text-orange-500 bg-orange-50 rounded-lg px-3 py-2">
                {examQualType}の試験日程が登録されていません。トップの「会場・日程の設定」→「試験日程」から登録してください。
              </p>
            ) : null}
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <div>
                <label className="field-label">試験日</label>
                <select
                  value={examDate}
                  onChange={e => handleExamDateChange(e.target.value)}
                  className="field-select"
                  disabled={!examQualType}
                >
                  <option value="">-- 選択 --</option>
                  {legacyExamDate && <option value={legacyExamDate}>{fmtShortDate(legacyExamDate)}（未登録）</option>}
                  {examDateOptions.map(d => <option key={d} value={d}>{fmtShortDate(d)}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">開始時間</label>
                <input type="text" value={examStartTime} onChange={e => setExamStartTime(e.target.value)} className="field-input" placeholder="10:00" />
              </div>
            </div>
            <div>
              <label className="field-label">
                試験地
                {examDate && <span className="ml-1 text-gray-400 font-normal">（{fmtShortDate(examDate)}に試験がある所）</span>}
              </label>
              <select
                value={examLocation}
                onChange={e => handleExamLocationChange(e.target.value)}
                className="field-select"
                disabled={!examQualType}
              >
                <option value="">-- 選択 --</option>
                {legacyExamLocation && <option value={legacyExamLocation}>{legacyExamLocation}（未登録）</option>}
                {examLocationOptions.map(l => {
                  const v = examDate ? qualSessions.find(s => s.exam_date === examDate && s.exam_location === l)?.gakka_venue : ''
                  return <option key={l} value={l}>{l}{v ? `（${v}）` : ''}</option>
                })}
              </select>
            </div>
            {matchedExamSession && (
              <div className="rounded-lg bg-lavender-50/60 border border-lavender-100 px-3 py-2 text-xs text-gray-600 space-y-0.5">
                <div>学科試験会場：<span className="font-medium text-gray-700">{matchedExamSession.gakka_venue || '—'}</span></div>
                <div>実技試験会場：<span className="font-medium text-gray-700">{matchedExamSession.jitsugi_venue || (matchedExamSession.gakka_venue ? '（学科と同じ）' : '—')}</span></div>
                <div className="text-gray-400">
                  試験ID：<span className="font-mono">{matchedExamSession.exam_id}</span>
                  <span className="ml-2">{matchedExamSession.exam_type}</span>
                </div>
              </div>
            )}
          </Section>
        )}

        {/* 申請者情報（本籍・国籍） */}
        <Section step={isNewType ? '5' : '3'} title="申請者情報" hint="免許申請書に記載">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">本籍地（都道府県）</label>
              <input
                type="text"
                value={domicile}
                onChange={e => setDomicile(e.target.value)}
                className="field-input"
                placeholder="例：大阪府"
              />
            </div>
            <div>
              <label className="field-label">国籍</label>
              <select
                value={nationality}
                onChange={e => setNationality(e.target.value)}
                className="field-select"
              >
                <option value="">日本（省略可）</option>
                {NATIONALITIES.filter(n => n.code !== 1).map(n => (
                  <option key={n.code} value={n.label}>{n.label}</option>
                ))}
              </select>
            </div>
          </div>
        </Section>
      </div>

      {/* 管理：ステータス・備考 */}
      <Section title="ステータス・備考" className="col-span-2">
        <div className="grid grid-cols-[auto_1fr] gap-4 items-start">
          <div>
            <label className="field-label">ステータス</label>
            <div className="flex gap-1.5">
              {STATUS_OPTIONS.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setStatus(o.value)}
                  className={[
                    'px-3 py-1.5 rounded-lg border text-sm font-medium transition',
                    status === o.value
                      ? o.value === 'cancelled'
                        ? 'bg-gray-400 text-white border-gray-400'
                        : 'bg-lavender-400 text-white border-lavender-400'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-lavender-300',
                  ].join(' ')}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="field-label">備考</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} className="field-input resize-none" rows={2} placeholder="連絡事項・注意点など" />
          </div>
        </div>
      </Section>
    </div>
  )

  return { fields, validate, buildInput }
}

// ── 申込編集モーダル（スケジュール・会員一覧から開く） ─────────────

interface Props {
  studentId: number
  enrollment: Enrollment | null
  onClose: () => void
  onSaved: () => void
}

export default function EnrollmentFormModal({ studentId, enrollment, onClose, onSaved }: Props) {
  const isCreating = !enrollment
  const { fields, validate, buildInput } = useEnrollmentForm(enrollment)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  useEffect(() => { setError('') }, [enrollment])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const msg = validate()
    if (msg) { setError(msg); return }
    setError('')
    setSaving(true)
    try {
      const body = buildInput(studentId)
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

  return (
    <div className="fixed inset-0 z-[60] bg-white flex flex-col">

        {/* sticky header */}
        <div className="shrink-0 px-8 py-5 border-b border-lavender-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-700">
            {isCreating ? '申込を追加' : '申込・講習情報を編集'}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none" tabIndex={-1}>
            ✕
          </button>
        </div>

        <form id="enrollment-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 py-4 space-y-4">
          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
          {fields}
        </div>
        </form>
        {/* sticky footer */}
        <div className="shrink-0 border-t border-lavender-100 bg-white">
          <div className="max-w-6xl mx-auto px-8 py-5 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">キャンセル</button>
            <button type="submit" form="enrollment-form" disabled={saving} className="btn-primary min-w-[88px]">
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
    </div>
  )
}
