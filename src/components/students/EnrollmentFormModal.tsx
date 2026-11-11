import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { ApplicationType, Classroom, Enrollment, EnrollmentInput, ExamRecord, ExamSession, PhysicalExam, RenewalSession } from '../../types'
import { classroomsApi, enrollmentsApi, examRecordsApi, examSessionsApi, physicalExamsApi, renewalSessionsApi } from '../../lib/api'
import ExamSessionFormModal, { makeEmptyExamSession } from '../ExamSessionFormModal'
import DateTextInput from '../DateTextInput'
import { PREV_EXAM_FIELDS } from '../../lib/prevExam'
import { PASS_VALID_YEARS, expiryAfterYears, fmtYmd, isValidOn, todayIso } from '../../lib/validity'
import Section from '../FormSection'
import VenueSelect from '../VenueSelect'

// ── 定数 ────────────────────────────────────────────────────

const APP_TYPE_OPTIONS: { value: ApplicationType; label: string }[] = [
  { value: 'new',     label: '試験申請' },
  { value: 'renewal', label: '更新講習' },
  { value: 'lapsed',  label: '失効再交付' },
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
  examGakka: boolean      // 学科試験を受ける
  examJitsugi: boolean    // 実技試験を受ける
  prevExam: PrevExam      // 免除の根拠：過去に合格した試験（申請書②欄）
  shintai: '' | 'need' | 'have'
}

// 免除の根拠：過去に合格した試験（申請書②欄：資格・試験開始日・試験地・受験番号）
interface PrevExam {
  recordId: number | null   // 試験記録から選んだ場合
  qual: string
  date: string
  location: string
  number: string
  examId: string            // 試験ID（試験機関に確認して後から入力することが多い）
  resultDate: string        // 合格日（判定日）。有効期限＝合格から2年
}
const EMPTY_PREV: PrevExam = { recordId: null, qual: '', date: '', location: '', number: '', examId: '', resultDate: '' }
function readPrevExam(v: unknown): PrevExam {
  if (!v || typeof v !== 'object') return { ...EMPTY_PREV }
  const o = v as Record<string, unknown>
  const str = (x: unknown) => (typeof x === 'string' ? x : '')
  return {
    recordId: typeof o.record_id === 'number' ? o.record_id : null,
    qual: str(o.qual), date: str(o.date), location: str(o.location), number: str(o.number),
    examId: str(o.exam_id),
    resultDate: str(o.result_date),
  }
}

function readExtra(enrollment: Enrollment | null): ExtraResult {
  if (!enrollment) {
    return {
      applicationType: 'new',
      courseSessions: [{ ...EMPTY_SESSION }],
      renewalCourseDate: '',
      courseLocation: '', courseTime: '',
      examDate: '', examLocation: '', examStartTime: '', examQualType: '',
      examGakka: true, examJitsugi: true, prevExam: { ...EMPTY_PREV }, shintai: '',
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
      // 未設定（以前の申込）は学科・実技とも受験扱い
      examGakka:     extra.exam_gakka   !== false,
      examJitsugi:   extra.exam_jitsugi !== false,
      prevExam:      readPrevExam(extra.prev_exam),
      shintai:       extra.shintai === 'need' || extra.shintai === 'have' ? extra.shintai : '',
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
    examGakka: true, examJitsugi: true, prevExam: { ...EMPTY_PREV }, shintai: '',
  }
}

// ── コンポーネント ────────────────────────────────────────────

/**
 * 申込入力欄（申込種別〜ステータス・備考）の状態とUIをまとめたフック。
 * 「受講者を追加」画面と、スケジュール等から開く申込編集モーダルの両方で使い、入力画面を統一する。
 */
export function useEnrollmentForm(enrollment: Enrollment | null, studentId?: number) {
  // 共通
  const [applicationType, setApplicationType] = useState<ApplicationType>('new')
  const [menu,   setMenu]   = useState('')
  const [note,   setNote]   = useState('')

  // 試験申請専用
  const [courseSessions, setCourseSessions] = useState<CourseSession[]>([{ ...EMPTY_SESSION }])
  const [examDate,       setExamDate]       = useState('')
  const [examLocation,   setExamLocation]   = useState('')
  const [examStartTime,  setExamStartTime]  = useState('')
  const [examQualType,   setExamQualType]   = useState('')
  const [examGakka,      setExamGakka]      = useState(true)
  const [examJitsugi,    setExamJitsugi]    = useState(true)
  const [prevExam,       setPrevExam]       = useState<PrevExam>({ ...EMPTY_PREV })
  const [examRecords,    setExamRecords]    = useState<ExamRecord[]>([])
  const [physicalExams,  setPhysicalExams]  = useState<PhysicalExam[]>([])
  const [physicalLoaded, setPhysicalLoaded] = useState(false)
  const [shintai,        setShintai]        = useState<'' | 'need' | 'have'>('')   // 身体検査：受検が必要／有効な証明書あり

  // 更新・失効専用
  const [renewalCourseDate, setRenewalCourseDate] = useState('')
  const [courseLocation,    setCourseLocation]    = useState('')
  const [courseTime,        setCourseTime]        = useState('')

  // 本籍・国籍（全種別共通）

  // メニュー管理
  const [menuOptions,   setMenuOptions]   = useState<string[]>(loadMenus)
  const [showAddMenu,   setShowAddMenu]   = useState(false)
  const [newMenuName,   setNewMenuName]   = useState('')
  const [showMenuMgr,   setShowMenuMgr]   = useState(false)
  const newMenuRef = useRef<HTMLInputElement>(null)

  // 事前登録済み日程
  const [examSessions,    setExamSessions]    = useState<ExamSession[]>([])
  const [showAddExamSession, setShowAddExamSession] = useState(false)
  const [renewalSessions, setRenewalSessions] = useState<RenewalSession[]>([])
  const [classrooms,      setClassrooms]      = useState<Classroom[]>([])

  const [menuError, setMenuError] = useState(false)

  useEffect(() => {
    examSessionsApi.list().then(setExamSessions).catch(() => setExamSessions([]))
    if (studentId) examRecordsApi.list(studentId).then(setExamRecords).catch(() => setExamRecords([]))
    if (studentId) physicalExamsApi.list(studentId).then(setPhysicalExams).catch(() => setPhysicalExams([])).finally(() => setPhysicalLoaded(true))
    else setPhysicalLoaded(true)
    renewalSessionsApi.list().then(setRenewalSessions).catch(() => setRenewalSessions([]))
    classroomsApi.list().then(setClassrooms).catch(() => setClassrooms([]))
  }, [])

  const today = format(new Date(), 'yyyy-MM-dd')

  // ── 免除：受けない方の試験に過去合格している記録を候補にする ──
  const exemptSubject: '学科' | '実技' | null = !examGakka ? '学科' : !examJitsugi ? '実技' : null
  const prevCandidates = exemptSubject == null ? [] : examRecords
    .filter(r => (exemptSubject === '学科' ? r.gakka_result : r.jitsugi_result) === '合')
    .map(r => {
      const sid = exemptSubject === '学科' ? r.gakka_session_id : r.jitsugi_session_id
      const ses = examSessions.find(x => x.id === sid)
      return {
        recordId: r.id,
        qual: r.qualification_type,
        date: ses?.exam_date ?? '',
        location: ses?.exam_location ?? '',
        number: (exemptSubject === '学科' ? r.gakka_exam_number : r.jitsugi_exam_number) ?? '',
        examId: ses?.exam_id ?? '',
        resultDate: (exemptSubject === '学科' ? r.gakka_result_date : r.jitsugi_result_date) ?? '',
      } satisfies PrevExam
    })
    .sort((a, b) => b.date.localeCompare(a.date))
  const setPrev = <K extends keyof PrevExam>(k: K, v: PrevExam[K]) => setPrevExam(p => ({ ...p, [k]: v }))
  const passExpiryOf = (p: PrevExam) => expiryAfterYears(p.resultDate || p.date || null, PASS_VALID_YEARS)
  const checkDate = examDate || todayIso()
  const prevExpiry = passExpiryOf(prevExam)
  const prevMissing = exemptSubject
    ? PREV_EXAM_FIELDS.filter(f => !String({ qual: prevExam.qual, date: prevExam.date, location: prevExam.location, number: prevExam.number, exam_id: prevExam.examId }[f.key] ?? '').trim()).map(f => f.label)
    : []

  // ── 身体検査：有効な記録（今回の試験日時点）があれば「証明書あり」、無ければ「受検が必要」 ──
  const validPhysical = physicalExams.find(p => isValidOn(p.valid_until, checkDate)) ?? null
  useEffect(() => {
    if (shintai === '' && physicalLoaded) setShintai(validPhysical ? 'have' : 'need')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [physicalLoaded, validPhysical?.id])
  // 免除を選んだとき、まだ空なら一番新しい合格記録を自動で入れる
  useEffect(() => {
    if (exemptSubject && !prevExam.date && !prevExam.number && prevCandidates.length > 0) {
      setPrevExam(prevCandidates[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exemptSubject, examRecords.length, examSessions.length])

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
    setExamGakka(ex.examGakka)
    setExamJitsugi(ex.examJitsugi)
    setPrevExam(ex.prevExam)
    setShintai(ex.shintai)
    setMenu(enrollment?.menu ?? '')
    setNote(enrollment?.note ?? '')
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
    setMenuError(false)
    return null
  }

  /** 保存用データを組み立てる（既存の extra_json の他項目は保持） */
  const buildInput = (studentId: number): EnrollmentInput => {
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
      extra.exam_gakka   = examGakka
      extra.exam_jitsugi = examJitsugi
      if (exemptSubject) {
        extra.prev_exam = {
          subject: exemptSubject,
          record_id: prevExam.recordId,
          qual: prevExam.qual, date: prevExam.date,
          location: prevExam.location.trim(), number: prevExam.number.trim(),
          exam_id: prevExam.examId.trim(),
          result_date: prevExam.resultDate || undefined,
        }
      } else delete extra.prev_exam
      if (shintai) extra.shintai = shintai; else delete extra.shintai
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
      delete extra.exam_gakka
      delete extra.exam_jitsugi
      delete extra.prev_exam
      delete extra.shintai
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
      status:      enrollment?.status ?? 'pending',  // ステータス欄は廃止。既存の値はそのまま保持
      extra_json:  JSON.stringify(extra),
      note:        note.trim() || null,
    }
  }

  const isNewType = applicationType === 'new'

  const fields = (
    <div className="grid grid-cols-2 gap-4 bg-lavender-50/30 -mx-2 p-2 rounded-2xl items-start">

      {/* 試験日程をこの画面から追加 → 追加後はその日程を選択した状態にする */}
      {showAddExamSession && (
        <ExamSessionFormModal
          initial={{
            ...makeEmptyExamSession(),
            qualification_type: examQualType || '二級',
            exam_date: examDate,
            exam_location: examLocation,
          }}
          editId={null}
          onSave={async (input) => {
            const created = await examSessionsApi.create(input)
            const list = await examSessionsApi.list().catch(() => null)
            setExamSessions(list ?? [...examSessions, created])
            setExamQualType(created.qualification_type)
            setExamDate(created.exam_date)
            setExamLocation(created.exam_location)
            setShowAddExamSession(false)
          }}
          onCancel={() => setShowAddExamSession(false)}
        />
      )}

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
            {/* ② 試験 */}
            <Section
              step="2"
              title="試験"
              action={
                <button
                  type="button"
                  onClick={() => setShowAddExamSession(true)}
                  className="text-xs font-medium text-lavender-500 hover:text-lavender-700"
                >
                  ＋ 試験日程を追加
                </button>
              }
            >
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
              <div>
                <label className="field-label">受験する試験</label>
                <div className="flex items-center gap-2">
                  {([['学科', examGakka, setExamGakka, examJitsugi], ['実技', examJitsugi, setExamJitsugi, examGakka]] as const).map(([label, on, setOn, other]) => (
                    <label
                      key={label}
                      className={[
                        'flex items-center gap-2 px-4 py-1.5 rounded-lg border text-sm font-medium cursor-pointer select-none transition',
                        on ? 'bg-lavender-50 border-lavender-400 text-lavender-700' : 'bg-white border-gray-200 text-gray-400',
                      ].join(' ')}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        // どちらか一方は必ず受ける（両方は外せない）
                        onChange={(e) => { if (e.target.checked || other) setOn(e.target.checked) }}
                        className="rounded"
                      />
                      {label}
                    </label>
                  ))}
                  <span className="note-text ml-1">
                    {examGakka && examJitsugi ? '学科・実技とも受験' : examGakka ? '学科のみ（実技は免除など）' : '実技のみ（学科は免除・合格済みなど）'}
                  </span>
                </div>
              </div>
              {exemptSubject && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-amber-800">過去に{exemptSubject}に合格した試験</span>
                    <span className="note-text">申請書の②欄に印字</span>
                  </div>
                  {prevCandidates.length > 0 ? (
                    <select
                      value={prevExam.recordId ?? ''}
                      onChange={e => {
                        const c = prevCandidates.find(x => String(x.recordId) === e.target.value)
                        setPrevExam(c ?? { ...EMPTY_PREV })
                      }}
                      className="field-select"
                    >
                      <option value="">-- 試験記録から選ぶ（手入力も可） --</option>
                      {prevCandidates.map(c => (
                        <option key={c.recordId} value={c.recordId!}>
                          {c.date ? fmtShortDate(c.date) : '日付不明'}　{c.location || '試験地不明'}　{c.qual}{c.number ? `（受験番号 ${c.number}）` : ''}{passExpiryOf(c) ? `　合格有効 ${fmtYmd(passExpiryOf(c))}まで${isValidOn(passExpiryOf(c), checkDate) ? '' : '【期限切れ】'}` : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="note-text">
                      {studentId ? `試験記録に${exemptSubject}の合格がありません。` : ''}下に直接入力してください（試験記録に登録しておくと次回から選べます）
                    </p>
                  )}
                  <div className="grid grid-cols-[6rem_9rem_1fr_7rem_7rem] gap-2">
                    <div>
                      <label className="field-label">資格</label>
                      <select value={prevExam.qual} onChange={e => setPrev('qual', e.target.value)} className="field-select">
                        <option value="">--</option>
                        {EXAM_QUAL_TYPES.map(q => <option key={q} value={q}>{q}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="field-label">試験開始日</label>
                      <DateTextInput value={prevExam.date} onChange={v => setPrev('date', v)} placeholder="2025/07/01" />
                    </div>
                    <div>
                      <label className="field-label">試験地</label>
                      <input type="text" value={prevExam.location} onChange={e => setPrev('location', e.target.value)} className="field-input" placeholder="大阪府大阪市" />
                    </div>
                    <div>
                      <label className="field-label">受験番号</label>
                      <input type="text" value={prevExam.number} onChange={e => setPrev('number', e.target.value)} className="field-input" />
                    </div>
                    <div>
                      <label className="field-label">試験ID</label>
                      <input type="text" value={prevExam.examId} onChange={e => setPrev('examId', e.target.value)} className="field-input" placeholder="000000" />
                    </div>
                  </div>
                  {prevMissing.length > 0 && (
                    <p className="text-xs font-semibold text-red-600">
                      未入力：{prevMissing.join('・')}　— 空欄のまま保存できます。試験機関に確認して後から入力してください（スケジュール画面などに「未入力」と表示されます）
                    </p>
                  )}
                  {prevExpiry && (
                    isValidOn(prevExpiry, checkDate) ? (
                      <p className="note-text">合格の有効期限：{fmtYmd(prevExpiry)} まで（合格から{PASS_VALID_YEARS}年）</p>
                    ) : (
                      <p className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                        ⚠ 合格の有効期限（{fmtYmd(prevExpiry)}）を{examDate ? '今回の試験日時点で' : ''}過ぎています。{exemptSubject}も受験が必要です
                      </p>
                    )
                  )}
                </div>
              )}
              {/* 身体検査（受検日から1年有効） */}
              <div>
                <label className="field-label">身体検査</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {([['need', '受検が必要'], ['have', '有効な証明書あり']] as const).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setShintai(v)}
                      className={[
                        'px-4 py-1.5 rounded-lg border text-sm font-medium transition',
                        shintai === v ? 'bg-lavender-400 text-white border-lavender-400' : 'bg-white text-gray-500 border-gray-200 hover:border-lavender-300',
                      ].join(' ')}
                    >
                      {label}
                    </button>
                  ))}
                  <span className="note-text">
                    {validPhysical
                      ? `記録あり：${fmtYmd(validPhysical.exam_date) || '受検日不明'} 受検（${fmtYmd(validPhysical.valid_until)} まで有効）`
                      : physicalExams.length > 0
                        ? `${examDate ? '試験日' : '今日'}時点で有効な身体検査の記録がありません`
                        : studentId ? '身体検査の記録がありません' : ''}
                  </span>
                </div>
              </div>
              {!examQualType ? (
                <p className="note-text">資格種別を選ぶと、登録済みの試験日程から選択できます</p>
              ) : qualSessions.length === 0 && !examDate && !examLocation ? (
                <p className="text-xs text-orange-500 bg-orange-50 rounded-lg px-3 py-2">
                  {examQualType}の試験日程が登録されていません。右上の「＋ 試験日程を追加」から登録できます。
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
                  {matchedExamSession.gakka_venue && (
                    <div>学科試験会場：<span className="font-medium text-gray-700">{matchedExamSession.gakka_venue}</span></div>
                  )}
                  {matchedExamSession.gakka_venue && (
                    <div>実技試験会場：<span className="font-medium text-gray-700">{matchedExamSession.jitsugi_venue || '（学科と同じ）'}</span></div>
                  )}
                  <div className="text-gray-400">
                    試験ID：<span className="font-mono">{matchedExamSession.exam_id}</span>
                    <span className="ml-2">{matchedExamSession.exam_type}</span>
                  </div>
                </div>
              )}
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
        {isNewType && (
          <>
          {/* ③ 講習日程（受講メニュー＋授業日程） */}
          <Section step="3" title="講習日程" hint="任意">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="field-label">受講メニュー</label>
                <button
                  type="button"
                  onClick={() => setShowMenuMgr(m => !m)}
                  className="text-xs text-lavender-500 hover:text-lavender-700 mb-1"
                >
                  {showMenuMgr ? 'メニュー管理を閉じる' : 'メニュー管理'}
                </button>
              </div>
              <select
                value={menu}
                onChange={(e) => {
                  if (e.target.value === '__add__') { setShowAddMenu(true); setMenu('') }
                  else { setMenu(e.target.value); setShowAddMenu(false) }
                }}
                className="field-select"
              >
                <option value="">-- 選択しない --</option>
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
            </div>
            <p className="note-text -mt-1">
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
        )}
      </div>

      {/* 備考（この申込についてのメモ） */}
      <Section title="備考" hint="この申込についてのメモ" className="col-span-2">
        <textarea value={note} onChange={e => setNote(e.target.value)} className="field-input resize-none" rows={2} placeholder="例：入金は当日現金／2回目の受験 など" />
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
  const { fields, validate, buildInput } = useEnrollmentForm(enrollment, studentId)
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
