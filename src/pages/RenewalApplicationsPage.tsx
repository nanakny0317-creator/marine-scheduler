/**
 * 更新・失効の作業画面（試験申請の画面と同じ形）
 *
 * 左：更新講習の日程（これから／過去／すべて・検索）
 * 右：選んだ講習日の受講者（更新・失効再交付）と書類（申請日・申請書・受領書）
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { Enrollment, RenewalSession, Student } from '../types'
import { enrollmentsApi, renewalSessionsApi } from '../lib/api'
import { todayIsoLocal } from '../lib/examResult'
import { getApplicationDate, formatApplicationDate } from '../lib/applicationDate'
import { printApplicationForms } from '../lib/applicationPrint'
import ApplicationDateModal from '../components/students/ApplicationDateModal'
import ScheduleItemDetailModal from '../components/students/ScheduleItemDetailModal'
import ReceiptPrintModal from '../components/students/ReceiptPrintModal'

interface Entry { enrollment: Enrollment; student: Student }

type Filter = 'upcoming' | 'past' | 'all'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'upcoming', label: 'これから' },
  { key: 'past',     label: '過去' },
  { key: 'all',      label: 'すべて' },
]

type Kind = 'all' | 'renewal' | 'lapsed'
const KINDS: { key: Kind; label: string }[] = [
  { key: 'all',     label: '両方' },
  { key: 'renewal', label: '更新' },
  { key: 'lapsed',  label: '失効再交付' },
]

// 日程未登録の申込をまとめる仮の日程
const UNREGISTERED_ID = -1

function fmt(d: string, f = 'M/d(E)') {
  try { return format(new Date(d + 'T00:00'), f, { locale: ja }) } catch { return d }
}
function extraOf(e: Enrollment): Record<string, unknown> {
  try { return JSON.parse(e.extra_json) as Record<string, unknown> } catch { return {} }
}
function kindOf(e: Enrollment): 'renewal' | 'lapsed' {
  return extraOf(e).application_type === 'lapsed' ? 'lapsed' : 'renewal'
}
function str(v: unknown): string { return typeof v === 'string' ? v : '' }

/** 申込がこの講習日程のものか（日付＋会場、時刻が入っていれば時刻も） */
function matches(s: RenewalSession, e: Enrollment): boolean {
  if (e.course_date !== s.course_date) return false
  if ((e.venue ?? '') !== s.location) return false
  const t = str(extraOf(e).course_time)
  return !t || !s.start_time || t === s.start_time
}

/** 受講者ごとのやり残し */
function issuesOf(x: Entry): string[] {
  const ex = extraOf(x.enrollment)
  const out: string[] = []
  if (!getApplicationDate(x.enrollment)) out.push('申請日')
  if (!x.student.license_number) out.push('免許番号')
  if (!x.student.license_expiry) out.push('有効期限')
  if (ex.license_return !== 'yes' && ex.license_return !== 'no') out.push('免許証返納')
  return out
}

const KIND_LABEL = { renewal: '更新', lapsed: '失効' }
const KIND_CLASS = { renewal: 'bg-blue-50 text-blue-500', lapsed: 'bg-orange-50 text-orange-500' }

export default function RenewalApplicationsPage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<RenewalSession[]>([])
  const [applicants, setApplicants] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('upcoming')
  const [kind, setKind] = useState<Kind>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState('')
  const [showAppDate, setShowAppDate] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)
  const [detail, setDetail] = useState<Entry | null>(null)

  const load = async () => {
    try {
      const [s, r, l] = await Promise.all([
        renewalSessionsApi.list(),
        enrollmentsApi.listAll('renewal'),
        enrollmentsApi.listAll('lapsed'),
      ])
      setSessions(s); setApplicants([...r, ...l])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const today = todayIsoLocal()

  // 日程ごとの受講者（カナ順）。どの日程にも当てはまらない申込は「日程未登録」へ
  const { bySession, unregistered } = useMemo(() => {
    const byKana = (a: Entry, b: Entry) => (a.student.last_kana ?? '').localeCompare(b.student.last_kana ?? '', 'ja')
    const pool = applicants.filter(x => kind === 'all' || kindOf(x.enrollment) === kind)
    const map = new Map<number, Entry[]>()
    const used = new Set<number>()
    for (const s of sessions) {
      const list = pool.filter(x => !used.has(x.enrollment.id) && matches(s, x.enrollment)).sort(byKana)
      list.forEach(x => used.add(x.enrollment.id))
      map.set(s.id, list)
    }
    return { bySession: map, unregistered: pool.filter(x => !used.has(x.enrollment.id)).sort(byKana) }
  }, [sessions, applicants, kind])

  // 検索：講習日・会場、または受講者の氏名・カナ
  const q = query.trim().replace(/\s/g, '')
  const nameHit = (x: Entry) => !!q && [x.student.last_name, x.student.first_name, x.student.last_kana, x.student.first_kana]
    .join('').replace(/\s/g, '').includes(q)
  const sessionHit = (s: RenewalSession) => !q || [s.course_date, s.course_date.replace(/-/g, '/'), fmt(s.course_date, 'M/d'), s.location]
    .some(v => v.includes(q)) || (bySession.get(s.id) ?? []).some(nameHit)

  const visible = useMemo(() => {
    const list = sessions.filter(s => {
      if (q) return true   // 検索中は過去も含めて全部から探す
      if (filter === 'upcoming') return s.course_date >= today
      if (filter === 'past')     return s.course_date < today
      return true
    }).filter(sessionHit)
    const desc = filter !== 'upcoming' || !!q
    return list.sort((a, b) => {
      const c = a.course_date.localeCompare(b.course_date) || a.start_time.localeCompare(b.start_time)
      return desc ? -c : c
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, filter, q, bySession, today])

  // 最初は一番近い日程を選ぶ
  useEffect(() => {
    if (selectedId != null && (selectedId === UNREGISTERED_ID || visible.some(s => s.id === selectedId))) return
    setSelectedId(visible[0]?.id ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const selected = sessions.find(s => s.id === selectedId) ?? null
  const entries: Entry[] = selectedId === UNREGISTERED_ID ? unregistered : selected ? (bySession.get(selected.id) ?? []) : []
  useEffect(() => { setChecked(new Set(entries.map(x => x.enrollment.id))) // 日程を変えたら全員選択
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, entries.length])

  const checkedEntries = entries.filter(x => checked.has(x.enrollment.id))
  const allChecked = entries.length > 0 && checkedEntries.length === entries.length
  const toggle = (id: number) => setChecked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  // ── 書類 ──
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    try { await fn() } catch (e) { alert(`${label}できませんでした。\n${e instanceof Error ? e.message : String(e)}`) } finally { setBusy('') }
  }
  const printApplications = () => run('申請書を印刷', async () => {
    if (checkedEntries.length === 0) { alert('印刷する受講者を選んでください'); return }
    const noDate = checkedEntries.filter(x => !getApplicationDate(x.enrollment)).length
    if (noDate > 0 && !window.confirm(`申請日が未設定の人が ${noDate} 名います。申請日の欄は空欄で印刷しますか？`)) return
    // 更新は更新申請書、失効は再交付申請書（種別ごとに書式を自動で選ぶ）
    await printApplicationForms(checkedEntries, '更新・失効再交付申請書')
  })

  const countOf = (s: RenewalSession) => {
    const list = bySession.get(s.id) ?? []
    return {
      renewal: list.filter(x => kindOf(x.enrollment) === 'renewal').length,
      lapsed: list.filter(x => kindOf(x.enrollment) === 'lapsed').length,
      issues: list.filter(x => issuesOf(x).length > 0).length,
    }
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-lavender-50 via-white to-mint-50">
      {/* ヘッダー */}
      <div className="shrink-0 px-6 py-4 flex items-center gap-4 border-b border-lavender-100 bg-white/70">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600 text-sm">← トップへ</button>
        <h1 className="text-lg font-bold text-gray-700">🔄 更新・失効</h1>
        <span className="note-text">講習日ごとに受講者と書類をまとめて準備します</span>
        <button onClick={() => navigate('/renewal-sessions')} className="ml-auto btn-secondary btn-sm">講習日程の登録・編集</button>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* ── 左：講習日程 ── */}
        <aside className="w-[24rem] shrink-0 border-r border-lavender-100 bg-white/60 flex flex-col">
          <div className="p-3 space-y-2 border-b border-lavender-100">
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="氏名・カナ・講習日（11/22）・会場で検索"
              className="field-input"
            />
            <div className="flex gap-1">
              {FILTERS.map(f => (
                <button key={f.key} type="button" onClick={() => setFilter(f.key)} disabled={!!q}
                  className={`flex-1 py-1 rounded-lg text-xs font-semibold border transition disabled:opacity-40 ${filter === f.key ? 'bg-lavender-400 text-white border-lavender-400' : 'bg-white text-gray-500 border-gray-200 hover:border-lavender-300'}`}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {KINDS.map(k => (
                <button key={k.key} type="button" onClick={() => setKind(k.key)}
                  className={`flex-1 py-1 rounded-lg text-xs font-semibold border transition ${kind === k.key ? 'bg-peach-400 text-white border-peach-400' : 'bg-white text-gray-500 border-gray-200 hover:border-peach-300'}`}>
                  {k.label}
                </button>
              ))}
            </div>
            {q && <p className="note-text">検索中は過去の講習も含めて表示します</p>}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="text-center text-gray-400 text-sm py-10">読み込み中…</p>
            ) : visible.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-10">該当する講習日程がありません</p>
            ) : visible.map(s => {
              const c = countOf(s)
              const total = c.renewal + c.lapsed
              const active = s.id === selectedId
              return (
                <button key={s.id} type="button" onClick={() => setSelectedId(s.id)}
                  className={`w-full text-left px-4 py-2.5 border-b border-gray-50 transition ${active ? 'bg-lavender-100/70' : 'hover:bg-lavender-50/60'} ${s.course_date < today && !active ? 'opacity-75' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-700 w-24 shrink-0">{fmt(s.course_date, 'yy/M/d(E)')}</span>
                    {s.start_time && <span className="text-xs font-semibold text-lavender-500 shrink-0">{s.start_time}</span>}
                    <span className="text-sm text-gray-700 truncate flex-1">{s.location}</span>
                    <span className={`text-xs font-bold shrink-0 ${total ? 'text-gray-700' : 'text-gray-300'}`}>{total}名</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 pl-24">
                    {c.renewal > 0 && <span className="text-[11px] text-blue-500">更新 {c.renewal}</span>}
                    {c.lapsed > 0 && <span className="text-[11px] text-orange-500">失効 {c.lapsed}</span>}
                    {c.issues > 0 && <span className="text-[11px] font-semibold text-red-500">⚠ 未入力 {c.issues}名</span>}
                    {q && (bySession.get(s.id) ?? []).filter(nameHit).map(x => (
                      <span key={x.enrollment.id} className="text-[11px] font-semibold text-amber-600">👤 {x.student.last_name} {x.student.first_name}</span>
                    ))}
                  </div>
                </button>
              )
            })}
            {unregistered.length > 0 && (
              <button type="button" onClick={() => setSelectedId(UNREGISTERED_ID)}
                className={`w-full text-left px-4 py-2.5 border-t-2 border-orange-100 ${selectedId === UNREGISTERED_ID ? 'bg-orange-50' : 'hover:bg-orange-50/50'}`}>
                <span className="text-sm font-semibold text-orange-600">講習日程が未登録の申込</span>
                <span className="ml-2 text-xs font-bold text-orange-600">{unregistered.length}名</span>
              </button>
            )}
          </div>
        </aside>

        {/* ── 右：受講者と書類 ── */}
        <main className="flex-1 min-w-0 flex flex-col">
          {selectedId == null ? (
            <p className="m-auto text-gray-400 text-sm">左から講習日程を選んでください</p>
          ) : (
            <>
              {/* 講習の情報 */}
              <div className="shrink-0 px-6 py-3 border-b border-lavender-100 bg-white/70 flex items-center gap-4 flex-wrap">
                {selected ? (
                  <>
                    <span className="text-base font-bold text-gray-700">{fmt(selected.course_date, 'yyyy年M月d日(E)')}</span>
                    {selected.start_time && <span className="text-sm font-semibold text-lavender-600">🕐 {selected.start_time}</span>}
                    <span className="text-sm text-gray-700">📍 {selected.location}</span>
                    {selected.note && <span className="text-xs text-gray-500">{selected.note}</span>}
                  </>
                ) : (
                  <span className="text-sm font-semibold text-orange-600">講習日程が未登録の申込（講習日程を登録するか、申込の講習日・会場を直してください）</span>
                )}
              </div>

              {/* 受講者 */}
              <div className="flex-1 overflow-y-auto">
                {entries.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-16">この講習の受講者はいません</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-lavender-50 text-xs text-gray-500">
                      <tr>
                        <th className="px-3 py-2 w-8"><input type="checkbox" checked={allChecked}
                          onChange={() => setChecked(allChecked ? new Set() : new Set(entries.map(x => x.enrollment.id)))} className="w-4 h-4 accent-lavender-500" /></th>
                        <th className="text-left px-2 py-2 font-medium">種別</th>
                        <th className="text-left px-2 py-2 font-medium">氏名</th>
                        <th className="text-left px-2 py-2 font-medium">生年月日</th>
                        <th className="text-left px-2 py-2 font-medium">免許番号</th>
                        <th className="text-left px-2 py-2 font-medium">有効期限</th>
                        <th className="text-left px-2 py-2 font-medium">返納</th>
                        <th className="text-left px-2 py-2 font-medium">申請日</th>
                        <th className="text-left px-2 py-2 font-medium">未入力</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map(x => {
                        const e = x.enrollment, st = x.student, ex = extraOf(e)
                        const k = kindOf(e)
                        const issues = issuesOf(x)
                        const hit = nameHit(x)
                        return (
                          <tr key={e.id} onDoubleClick={() => setDetail(x)} title="ダブルクリックで詳細・編集"
                            className={`border-b border-gray-50 cursor-pointer select-none ${hit ? 'bg-amber-50' : checked.has(e.id) ? 'bg-lavender-50/50' : 'hover:bg-lavender-50/40'}`}>
                            <td className="px-3 py-2"><input type="checkbox" checked={checked.has(e.id)} onChange={() => toggle(e.id)} onClick={ev => ev.stopPropagation()} className="w-4 h-4 accent-lavender-500" /></td>
                            <td className="px-2 py-2"><span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${KIND_CLASS[k]}`}>{KIND_LABEL[k]}</span></td>
                            <td className="px-2 py-2">
                              <span className="font-medium text-gray-700">{st.last_name} {st.first_name}</span>
                              <span className="block text-[11px] text-gray-400">{st.last_kana} {st.first_kana}</span>
                            </td>
                            <td className="px-2 py-2 text-gray-600">{st.birth_date ? fmt(st.birth_date, 'yyyy/M/d') : ''}</td>
                            <td className="px-2 py-2 text-gray-600 font-mono text-xs">{st.license_number ?? ''}</td>
                            <td className={`px-2 py-2 ${st.license_expiry && st.license_expiry < today ? 'text-orange-600 font-semibold' : 'text-gray-600'}`}>
                              {st.license_expiry ? fmt(st.license_expiry, 'yyyy/M/d') : ''}
                            </td>
                            <td className="px-2 py-2 text-gray-600">{ex.license_return === 'yes' ? '有' : ex.license_return === 'no' ? '無' : ''}</td>
                            <td className="px-2 py-2 text-gray-600">{formatApplicationDate(getApplicationDate(e))}</td>
                            <td className="px-2 py-2 text-xs font-semibold text-red-500">{issues.join('・')}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* 書類 */}
              <div className="shrink-0 border-t border-lavender-100 bg-white px-6 py-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-lavender-600 mr-1">選んだ {checkedEntries.length}名：</span>
                  <button type="button" onClick={() => setShowAppDate(true)} disabled={!checkedEntries.length || !!busy} className="btn-secondary btn-sm disabled:opacity-40">申請日を設定</button>
                  <button type="button" onClick={printApplications} disabled={!checkedEntries.length || !!busy} className="btn-primary btn-sm disabled:opacity-40"
                    title="更新は更新申請書、失効は再交付申請書で印刷します">
                    {busy === '申請書を印刷' ? '⏳ 印刷中…' : '🖨 申請書'}
                  </button>
                  <button type="button" onClick={() => setShowReceipt(true)} disabled={!checkedEntries.length || !!busy} className="btn-secondary btn-sm disabled:opacity-40">🖨 受領書</button>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {showAppDate && (
        <ApplicationDateModal
          items={checkedEntries}
          onClose={() => setShowAppDate(false)}
          onSaved={() => { setShowAppDate(false); load() }}
        />
      )}
      {showReceipt && (
        <ReceiptPrintModal items={checkedEntries} onClose={() => setShowReceipt(false)} />
      )}
      {detail && (
        <ScheduleItemDetailModal
          student={detail.student}
          enrollment={detail.enrollment}
          onClose={() => { setDetail(null); load() }}
          onUpdated={() => load()}
        />
      )}
    </div>
  )
}
