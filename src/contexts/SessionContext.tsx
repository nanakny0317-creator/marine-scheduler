/**
 * セッション（講習日×会場）の一覧・選択状態・タブをサイドバーとメインビューで共有するコンテキスト
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ApplicationType, Enrollment, Student } from '../types'
import { enrollmentsApi } from '../lib/api'

// ── 型定義 ─────────────────────────────────────────────────

export type Tab = ApplicationType | 'all'

export const TABS: { key: Tab; label: string }[] = [
  { key: 'all',     label: '全件' },
  { key: 'new',     label: '受講申請' },
  { key: 'renewal', label: '更新講習' },
  { key: 'lapsed',  label: '失効再交付' },
]

export interface SessionItem {
  enrollment: Enrollment
  student: Student
}

export interface SessionGroup {
  course_date: string | null
  course_time: string | null
  venue: string | null
  items: SessionItem[]
}

export function sessionKey(s: SessionGroup): string {
  return `${s.course_date ?? ''}__${s.course_time ?? ''}__${s.venue ?? ''}`
}

export function getCourseTime(enrollment: Enrollment): string | null {
  try { return JSON.parse(enrollment.extra_json).course_time ?? null } catch { return null }
}

function getAppType(enrollment: Enrollment): string {
  try { return JSON.parse(enrollment.extra_json).application_type ?? 'new' } catch { return 'new' }
}

// ── コンテキスト ───────────────────────────────────────────

interface SessionContextValue {
  sessions: SessionGroup[]       // activeTab でフィルタ済み
  loading: boolean
  selectedKey: string | null
  setSelectedKey: (k: string | null) => void
  selectedSession: SessionGroup | null
  activeTab: Tab
  setActiveTab: (tab: Tab) => void
  reload: () => void
}

const SessionContext = createContext<SessionContextValue | null>(null)

// ── プロバイダ ─────────────────────────────────────────────

export function SessionProvider({ children }: { children: ReactNode }) {
  const [allItems, setAllItems]       = useState<SessionItem[]>([])
  const [loading, setLoading]         = useState(true)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [activeTab, setActiveTab]     = useState<Tab>('all')

  const load = useCallback(async () => {
    setLoading(true)
    const data = await enrollmentsApi.listAll()
    setAllItems(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // activeTab でフィルタ → course_date × course_time × venue でグループ化 → 日付昇順ソート
  const sessions = useMemo<SessionGroup[]>(() => {
    const filtered = activeTab === 'all'
      ? allItems
      : allItems.filter(({ enrollment }) => getAppType(enrollment) === activeTab)

    const map = new Map<string, SessionGroup>()
    for (const item of filtered) {
      const time = getCourseTime(item.enrollment)
      const key = `${item.enrollment.course_date ?? ''}__${time ?? ''}__${item.enrollment.venue ?? ''}`
      if (!map.has(key)) {
        map.set(key, {
          course_date: item.enrollment.course_date,
          course_time: time,
          venue:       item.enrollment.venue,
          items:       [],
        })
      }
      map.get(key)!.items.push(item)
    }
    return Array.from(map.values()).sort((a, b) => {
      const da = a.course_date ?? 'zzzz'
      const db = b.course_date ?? 'zzzz'
      if (da !== db) return da.localeCompare(db)
      return (a.course_time ?? '').localeCompare(b.course_time ?? '')
    })
  }, [allItems, activeTab])

  // セッション一覧が変わったとき：選択が無効なら先頭を自動選択
  useEffect(() => {
    if (sessions.length === 0) { setSelectedKey(null); return }
    const keys = new Set(sessions.map(sessionKey))
    if (!selectedKey || !keys.has(selectedKey)) {
      setSelectedKey(sessionKey(sessions[0]))
    }
  }, [sessions])

  const selectedSession = useMemo(
    () => selectedKey ? (sessions.find((s) => sessionKey(s) === selectedKey) ?? null) : null,
    [sessions, selectedKey]
  )

  return (
    <SessionContext.Provider value={{
      sessions, loading,
      selectedKey, setSelectedKey,
      selectedSession,
      activeTab, setActiveTab,
      reload: load,
    }}>
      {children}
    </SessionContext.Provider>
  )
}

// ── フック ─────────────────────────────────────────────────

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}
