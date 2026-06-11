import { useState, useMemo } from 'react'
import {
  format, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, isSameDay, addMonths, subMonths,
} from 'date-fns'
import { ja } from 'date-fns/locale'
import type { Enrollment, Student } from '../../types'
import type { SessionItem, Tab } from '../../contexts/SessionContext'
import { TABS } from '../../contexts/SessionContext'
import ScheduleItemDetailModal from './ScheduleItemDetailModal'

// ── 型 ──────────────────────────────────────────────────────

interface CalendarEvent {
  appType: string
  venue: string | null
  lessonType: string   // 一般学科 / 上級学科 / 実技 / 学科 など
  menu: string
  items: SessionItem[]
}

// ── ヘルパー ─────────────────────────────────────────────────

function getAppType(enrollment: Enrollment): string {
  try { return JSON.parse(enrollment.extra_json).application_type ?? 'new' } catch { return 'new' }
}

/** course_sessions があればセッションごとに展開、なければ旧形式フォールバック */
interface SessionEntry { date: string; venue: string; lessonType: string }

function getSessionEntries(enrollment: Enrollment): SessionEntry[] {
  const appType = getAppType(enrollment)
  if (appType === 'new') {
    try {
      const extra = JSON.parse(enrollment.extra_json)
      const raw = extra.course_sessions
      if (Array.isArray(raw) && raw.length > 0) {
        return (raw as Record<string, string>[])
          .filter(s => s.date)
          .map(s => ({ date: s.date, venue: s.venue ?? '', lessonType: s.lessonType ?? '' }))
      }
      // 旧形式：course_dates + グローバル venue
      const dates: string[] = Array.isArray(extra.course_dates) ? extra.course_dates as string[] : []
      const venue = typeof extra.course_location === 'string' ? extra.course_location : (enrollment.venue ?? '')
      if (dates.length > 0) return dates.filter(Boolean).map(d => ({ date: d, venue, lessonType: '' }))
    } catch { /* ignore */ }
    return enrollment.course_date ? [{ date: enrollment.course_date, venue: enrollment.venue ?? '', lessonType: '' }] : []
  }
  // 更新・失効：単一日
  if (!enrollment.course_date) return []
  try {
    const extra = JSON.parse(enrollment.extra_json)
    const venue = typeof extra.course_location === 'string' ? extra.course_location : (enrollment.venue ?? '')
    return [{ date: enrollment.course_date, venue, lessonType: '' }]
  } catch { /* ignore */ }
  return [{ date: enrollment.course_date, venue: enrollment.venue ?? '', lessonType: '' }]
}

const TYPE_LABEL: Record<string, string> = {
  new: '受講', renewal: '更新', lapsed: '失効',
}
const TYPE_COLOR: Record<string, string> = {
  new:     'bg-mint-100 text-mint-700 border-mint-200',
  renewal: 'bg-blue-100 text-blue-600 border-blue-200',
  lapsed:  'bg-orange-100 text-orange-600 border-orange-200',
}
const TYPE_HEADER: Record<string, string> = {
  new:     'bg-mint-50 border-mint-100',
  renewal: 'bg-blue-50 border-blue-100',
  lapsed:  'bg-orange-50 border-orange-100',
}
const TYPE_BADGE: Record<string, string> = {
  new:     'bg-mint-100 text-mint-700',
  renewal: 'bg-blue-100 text-blue-600',
  lapsed:  'bg-orange-100 text-orange-600',
}

const WEEK_DAYS = ['月', '火', '水', '木', '金', '土', '日']

// ── コンポーネント ────────────────────────────────────────────

interface Props {
  allItems: SessionItem[]
  onClose: () => void
  onUpdated: () => void
}

export default function CalendarModal({ allItems, onClose, onUpdated }: Props) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [calTab, setCalTab]             = useState<Tab>('all')
  const [selectedDay, setSelectedDay]   = useState<string | null>(null)
  const [detailItem, setDetailItem]     = useState<{ student: Student; enrollment: Enrollment } | null>(null)

  // タブフィルタ
  const filteredItems = useMemo(() => {
    if (calTab === 'all') return allItems
    return allItems.filter(({ enrollment }) => getAppType(enrollment) === calTab)
  }, [allItems, calTab])

  // 日付 → CalendarEvent[] のマップ（セッションごとに会場・講習内容を個別展開）
  const eventsByDate = useMemo(() => {
    const map = new Map<string, Map<string, CalendarEvent>>()
    for (const item of filteredItems) {
      const appType  = getAppType(item.enrollment)
      const menu     = item.enrollment.menu ?? ''
      const entries  = getSessionEntries(item.enrollment)

      for (const { date: dateStr, venue, lessonType } of entries) {
        if (!dateStr) continue
        // 同じ日・会場・講習内容・種別のものをグループ化
        const eventKey = `${appType}__${venue}__${lessonType}__${menu}`
        if (!map.has(dateStr)) map.set(dateStr, new Map())
        const dayMap = map.get(dateStr)!
        if (!dayMap.has(eventKey)) {
          dayMap.set(eventKey, { appType, venue: venue || null, lessonType, menu, items: [] })
        }
        dayMap.get(eventKey)!.items.push(item)
      }
    }
    const result = new Map<string, CalendarEvent[]>()
    for (const [date, dayMap] of map) {
      result.set(date, Array.from(dayMap.values()))
    }
    return result
  }, [filteredItems])

  // 選択日のイベント一覧
  const selectedDayEvents = useMemo(
    () => (selectedDay ? (eventsByDate.get(selectedDay) ?? []) : []),
    [selectedDay, eventsByDate],
  )

  // カレンダーの日付リスト（月曜始まり）
  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 })
    const end   = endOfWeek(endOfMonth(currentMonth),   { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [currentMonth])

  const today = new Date()

  return (
    <>
      {/* ── カレンダー本体 ───────────────────────────────────── */}
      <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col">

          {/* ヘッダー */}
          <div className="px-6 py-4 border-b border-lavender-100 flex items-center justify-between shrink-0">
            <h2 className="text-base font-semibold text-gray-700">カレンダービュー</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
          </div>

          {/* コントロール */}
          <div className="px-6 py-3 flex items-center gap-4 border-b border-lavender-50 shrink-0 flex-wrap">
            <div className="flex items-center gap-2">
              <button onClick={() => setCurrentMonth(m => subMonths(m, 1))} className="btn-secondary btn-sm px-2.5">‹</button>
              <span className="font-semibold text-gray-700 w-28 text-center text-sm">
                {format(currentMonth, 'yyyy年M月', { locale: ja })}
              </span>
              <button onClick={() => setCurrentMonth(m => addMonths(m, 1))} className="btn-secondary btn-sm px-2.5">›</button>
              <button onClick={() => setCurrentMonth(new Date())} className="btn-secondary btn-sm text-xs">今月</button>
            </div>
            <div className="flex gap-1">
              {TABS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setCalTab(key)}
                  className={`px-3 py-1 text-xs rounded-full border transition ${
                    calTab === key
                      ? 'bg-lavender-400 text-white border-lavender-400'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-lavender-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 ml-auto hidden sm:block">日付をクリックで詳細表示</p>
          </div>

          {/* カレンダーグリッド */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {/* 曜日ヘッダー */}
            <div className="grid grid-cols-7 mb-1">
              {WEEK_DAYS.map((d, i) => (
                <div key={d} className={`text-center text-xs font-medium py-1 ${i === 5 ? 'text-blue-400' : i === 6 ? 'text-red-400' : 'text-gray-400'}`}>
                  {d}
                </div>
              ))}
            </div>

            {/* 日付グリッド */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day) => {
                const dateStr        = format(day, 'yyyy-MM-dd')
                const isCurrentMonth = isSameMonth(day, currentMonth)
                const isToday        = isSameDay(day, today)
                const isSelected     = selectedDay === dateStr
                const events         = eventsByDate.get(dateStr) ?? []
                const dow            = day.getDay()
                const hasEvents      = events.length > 0

                return (
                  <div
                    key={dateStr}
                    onClick={() => isCurrentMonth && setSelectedDay(dateStr)}
                    className={[
                      'min-h-[90px] rounded-lg border p-1.5 flex flex-col gap-0.5 transition-all',
                      isCurrentMonth ? 'cursor-pointer' : 'cursor-default',
                      isSelected
                        ? 'border-lavender-400 ring-2 ring-lavender-200 bg-lavender-50'
                        : isToday
                          ? 'bg-lavender-50 border-lavender-300 hover:border-lavender-400'
                          : !isCurrentMonth
                            ? 'bg-gray-50 border-gray-100'
                            : hasEvents
                              ? 'bg-white border-gray-200 hover:border-lavender-300 hover:shadow-sm'
                              : 'bg-white border-gray-100 hover:border-gray-200',
                    ].join(' ')}
                  >
                    {/* 日付番号 */}
                    <div className="flex justify-end mb-0.5">
                      <span className={`text-[11px] font-semibold w-5 h-5 flex items-center justify-center rounded-full ${
                        !isCurrentMonth ? 'text-gray-300' :
                        isToday        ? 'bg-lavender-400 text-white' :
                        dow === 6      ? 'text-blue-400' :
                        dow === 0      ? 'text-red-400'  :
                        'text-gray-500'
                      }`}>
                        {format(day, 'd')}
                      </span>
                    </div>

                    {/* イベントチップ（クリックは日セル全体に委譲） */}
                    {events.map((event, idx) => {
                      // チップ：会場 + 講習内容を優先表示
                      const chip = [event.venue, event.lessonType].filter(Boolean).join(' ') || event.menu
                      const tip  = [TYPE_LABEL[event.appType], event.venue, event.lessonType, event.menu, `${event.items.length}名`].filter(Boolean).join('　')
                      return (
                        <div
                          key={idx}
                          className={`w-full px-1.5 py-0.5 rounded border text-[10px] leading-snug truncate pointer-events-none ${TYPE_COLOR[event.appType] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}
                          title={tip}
                        >
                          <span className="font-bold">{TYPE_LABEL[event.appType] ?? ''}</span>
                          {chip && <span className="ml-0.5">{chip}</span>}
                          <span className="ml-0.5 opacity-60">{event.items.length}名</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── 日フォーカスパネル ───────────────────────────────── */}
      {selectedDay && !detailItem && (
        <div
          className="fixed inset-0 bg-black/20 flex items-center justify-center z-[55] p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedDay(null) }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">

            {/* ヘッダー */}
            <div className="px-5 py-4 border-b border-lavender-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-semibold text-gray-800 text-base">
                  {format(new Date(selectedDay), 'yyyy年M月d日(E)', { locale: ja })}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {selectedDayEvents.reduce((acc, e) => acc + e.items.length, 0)} 名 ／ {selectedDayEvents.length} 件
                </p>
              </div>
              <button onClick={() => setSelectedDay(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            {/* イベント＋受講者リスト */}
            <div className="flex-1 overflow-y-auto divide-y divide-lavender-50">
              {selectedDayEvents.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-10">この日の予定はありません</p>
              ) : (
                selectedDayEvents.map((event, eIdx) => {
                  // 会場・講習内容を主体に、メニューをサブ表示
                  const mainTitle = [event.venue, event.lessonType].filter(Boolean).join('　') || event.menu || '（未設定）'
                  const subTitle  = (event.venue || event.lessonType) && event.menu ? event.menu : ''
                  return (
                    <div key={eIdx}>
                      {/* イベントヘッダー */}
                      <div className={`px-5 py-2.5 flex items-center gap-2 border-b ${TYPE_HEADER[event.appType] ?? 'bg-gray-50 border-gray-100'}`}>
                        <span className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-bold ${TYPE_BADGE[event.appType] ?? 'bg-gray-100 text-gray-500'}`}>
                          {TYPE_LABEL[event.appType] ?? event.appType}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-700 truncate">{mainTitle}</div>
                          {subTitle && <div className="text-xs text-gray-400 truncate">{subTitle}</div>}
                        </div>
                        <span className="ml-auto text-xs text-gray-400 shrink-0">{event.items.length} 名</span>
                      </div>

                      {/* 受講者行 */}
                      {event.items.map(({ student, enrollment }) => (
                        <button
                          key={enrollment.id}
                          onClick={() => setDetailItem({ student, enrollment })}
                          className="w-full text-left px-5 py-3 border-b border-gray-50 last:border-0 hover:bg-lavender-50 transition flex items-center gap-3"
                        >
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-gray-700">
                              {student.last_name} {student.first_name}
                            </span>
                            {(student.last_kana || student.first_kana) && (
                              <span className="text-xs text-gray-400 ml-2">
                                {student.last_kana} {student.first_kana}
                              </span>
                            )}
                            {(student.phone || student.mobile) && (
                              <span className="text-xs text-gray-300 ml-2">
                                {student.phone || student.mobile}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-lavender-400 shrink-0">詳細 ›</span>
                        </button>
                      ))}
                    </div>
                  )
                })
              )}
            </div>

            {/* フッター */}
            <div className="px-5 py-3 border-t border-lavender-100 flex justify-end shrink-0">
              <button onClick={() => setSelectedDay(null)} className="btn-secondary btn-sm">閉じる</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 受講者詳細モーダル ───────────────────────────────── */}
      {detailItem && (
        <ScheduleItemDetailModal
          student={detailItem.student}
          enrollment={detailItem.enrollment}
          onClose={() => setDetailItem(null)}
          onUpdated={() => { onUpdated(); setDetailItem(null) }}
        />
      )}
    </>
  )
}
