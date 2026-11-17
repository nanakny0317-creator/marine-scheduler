/**
 * 試験申請の作業画面（旧うーみーくんの「試験申請書類の印刷」画面に相当）
 *
 * 左：試験日程（これから／発表待ち／過去／すべて・検索）
 * 右：選んだ試験の受験者と、その試験の書類（申請日・申請書・名簿・委任状・ラベル）
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { Enrollment, ExamRecord, ExamSession, Student } from '../types'
import { enrollmentsApi, examRecordsApi, examSessionsApi } from '../lib/api'
import { needsResultCheck } from '../lib/examResultEntry'
import ResultEntryPanel from '../components/exams/ResultEntryPanel'
import { resultDateOf, todayIsoLocal, daysBetween } from '../lib/examResult'
import { buildRosterHtml, rosterEntriesFor, type RosterEntry } from '../lib/rosterPrint'
import { loadFees, loadOrgName } from '../lib/examFees'
import { getApplicationDate, formatApplicationDate } from '../lib/applicationDate'
import { missingPrevExam } from '../lib/prevExam'
import { jointIdOf, findJointPartner, examDateOf } from '../lib/jointApplication'
import { printApplicationForms } from '../lib/applicationPrint'
import ApplicationDateModal from '../components/students/ApplicationDateModal'
import ScheduleItemDetailModal from '../components/students/ScheduleItemDetailModal'

type Filter = 'upcoming' | 'waiting' | 'past' | 'all'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'upcoming', label: 'これから' },
  { key: 'waiting',  label: '合格確認' },
  { key: 'past',     label: '過去' },
  { key: 'all',      label: 'すべて' },
]

// 日程未登録の申込をまとめる仮の日程
const UNREGISTERED_ID = -1

function fmt(d: string, f = 'M/d(E)') {
  try { return format(new Date(d + 'T00:00'), f, { locale: ja }) } catch { return d }
}
function extraOf(e: Enrollment): Record<string, unknown> {
  try { return JSON.parse(e.extra_json) as Record<string, unknown> } catch { return {} }
}

/** 受験者ごとのやり残し */
function issuesOf(e: Enrollment): string[] {
  const x = extraOf(e)
  const out: string[] = []
  if (!getApplicationDate(e)) out.push('申請日')
  if (!x.shintai) out.push('身体検査')
  if (x.shintai === 'omit') {
    const sp = (x.shintai_pass ?? {}) as Record<string, unknown>
    if (!sp.date) out.push('身体検査の合格日')
  }
  const miss = missingPrevExam(e)
  if (miss.length) out.push(`合格歴（${miss.join('・')}）`)
  return out
}

const SHINTAI_LABEL: Record<string, string> = { need: '当日検査', have: '提出', omit: '省略' }

export default function ExamApplicationsPage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<ExamSession[]>([])
  const [applicants, setApplicants] = useState<RosterEntry[]>([])
  const [records, setRecords] = useState<ExamRecord[]>([])
  const [loading, setLoading] = useState(true)
  // ?tab=waiting で合格確認タブから開く（免許申請の画面からの案内）
  const [params] = useSearchParams()
  const initialFilter: Filter = params.get('tab') === 'waiting' ? 'waiting' : 'upcoming'
  const [filter, setFilterRaw] = useState<Filter>(initialFilter)
  // 右側の表示：書類の準備 or 合否の入力（合格確認タブでは合否から）
  const [mode, setMode] = useState<'docs' | 'results'>(initialFilter === 'waiting' ? 'results' : 'docs')
  const setFilter = (f: Filter) => { setFilterRaw(f); setMode(f === 'waiting' ? 'results' : 'docs') }
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState('')
  const [showAppDate, setShowAppDate] = useState(false)
  const [detail, setDetail] = useState<{ student: Student; enrollment: Enrollment } | null>(null)

  const load = async () => {
    try {
      const [s, a, r] = await Promise.all([examSessionsApi.list(), enrollmentsApi.listAll('new'), examRecordsApi.listAll()])
      setSessions(s); setApplicants(a); setRecords(r)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const today = todayIsoLocal()

  // 日程ごとの受験者。どの日程にも当てはまらない申込は「日程未登録」へ
  const { bySession, unregistered } = useMemo(() => {
    const map = new Map<number, RosterEntry[]>()
    const used = new Set<number>()
    for (const s of sessions) {
      const list = rosterEntriesFor(s, applicants)
      list.forEach(x => used.add(x.enrollment.id))
      map.set(s.id, list)
    }
    return { bySession: map, unregistered: applicants.filter(x => !used.has(x.enrollment.id)) }
  }, [sessions, applicants])

  // 検索：試験日・試験地・資格・試験ID、または受験者の氏名・カナ
  const q = query.trim().replace(/\s/g, '')
  const nameHit = (x: RosterEntry) => !!q && [x.student.last_name, x.student.first_name, x.student.last_kana, x.student.first_kana]
    .join('').replace(/\s/g, '').includes(q)
  const sessionHit = (s: ExamSession) => !q || [s.exam_date, s.exam_date.replace(/-/g, '/'), fmt(s.exam_date, 'M/d'), s.exam_location, s.qualification_type, s.exam_id]
    .some(v => v.includes(q)) || (bySession.get(s.id) ?? []).some(nameHit)

  const visible = useMemo(() => {
    const byFilter = sessions.filter(s => {
      if (q) return true   // 検索中は過去も含めて全部から探す
      if (filter === 'upcoming') return s.exam_date >= today
      if (filter === 'waiting')  return needsResultCheck(s, bySession.get(s.id)?.length ?? 0, today)
      if (filter === 'past')     return s.exam_date < today
      return true
    }).filter(sessionHit)
    const desc = filter === 'past' || filter === 'all' || !!q
    return byFilter.sort((a, b) => desc ? b.exam_date.localeCompare(a.exam_date) : a.exam_date.localeCompare(b.exam_date))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, filter, q, bySession, today])

  // 最初は一番近い日程を選ぶ
  useEffect(() => {
    if (selectedId != null && (selectedId === UNREGISTERED_ID || visible.some(s => s.id === selectedId))) return
    setSelectedId(visible[0]?.id ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const selected = sessions.find(s => s.id === selectedId) ?? null
  const entries: RosterEntry[] = selectedId === UNREGISTERED_ID ? unregistered : selected ? (bySession.get(selected.id) ?? []) : []
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
    if (checkedEntries.length === 0) { alert('印刷する受験者を選んでください'); return }
    const noDate = checkedEntries.filter(x => !getApplicationDate(x.enrollment)).length
    if (noDate > 0 && !window.confirm(`申請日が未設定の人が ${noDate} 名います。申請日の欄は空欄で印刷しますか？`)) return
    await printApplicationForms(checkedEntries, '試験申請書')
  })
  const printRoster = (blank: boolean) => run('名簿を印刷', async () => {
    if (!selected) return
    const [fees, org] = await Promise.all([loadFees(), loadOrgName()])
    await window.api.print.html(buildRosterHtml(selected, blank ? [] : entries, fees, org))
  })

  // 合否の確定が残っている試験の数（合格確認タブの通知）
  const waitingCount = sessions.filter(s => needsResultCheck(s, bySession.get(s.id)?.length ?? 0, today)).length

  const sessionBadge = (s: ExamSession) => {
    const list = bySession.get(s.id) ?? []
    const issues = list.filter(x => issuesOf(x.enrollment).length > 0).length
    const rd = resultDateOf(s)
    const waiting = s.exam_date < today && !s.result_checked && list.length > 0
    return { count: list.length, issues, rd, waiting, days: rd ? daysBetween(today, rd) : 999 }
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-lavender-50 via-white to-mint-50">
      {/* ヘッダー */}
      <div className="shrink-0 px-6 py-4 flex items-center gap-4 border-b border-lavender-100 bg-white/70">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600 text-sm">← トップへ</button>
        <h1 className="text-lg font-bold text-gray-700">🚤 試験申請</h1>
        <span className="note-text">試験ごとに受験者と書類をまとめて準備します</span>
        <button onClick={() => navigate('/exam-sessions')} className="ml-auto btn-secondary btn-sm">試験日程の登録・編集</button>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* ── 左：試験日程 ── */}
        <aside className="w-[24rem] shrink-0 border-r border-lavender-100 bg-white/60 flex flex-col">
          <div className="p-3 space-y-2 border-b border-lavender-100">
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="氏名・カナ・試験日（11/22）・試験地で検索"
              className="field-input"
            />
            <div className="flex gap-1">
              {FILTERS.map(f => (
                <button key={f.key} type="button" onClick={() => setFilter(f.key)} disabled={!!q}
                  className={`relative flex-1 py-1 rounded-lg text-xs font-semibold border transition disabled:opacity-40 ${filter === f.key ? 'bg-lavender-400 text-white border-lavender-400' : 'bg-white text-gray-500 border-gray-200 hover:border-lavender-300'}`}>
                  {f.label}
                  {f.key === 'waiting' && waitingCount > 0 && (
                    <span title={`合否の確定が残っている試験が ${waitingCount} 件あります`}
                      className="absolute -top-2 -right-1.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-[1.1rem] shadow">
                      {waitingCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {q && <p className="note-text">検索中は過去の試験も含めて表示します</p>}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="text-center text-gray-400 text-sm py-10">読み込み中…</p>
            ) : visible.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-10">該当する試験日程がありません</p>
            ) : visible.map(s => {
              const b = sessionBadge(s)
              const active = s.id === selectedId
              return (
                <button key={s.id} type="button" onClick={() => setSelectedId(s.id)}
                  className={`w-full text-left px-4 py-2.5 border-b border-gray-50 transition ${active ? 'bg-lavender-100/70' : 'hover:bg-lavender-50/60'} ${s.exam_date < today && !active ? 'opacity-75' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-700 w-24 shrink-0">{fmt(s.exam_date, 'yy/M/d(E)')}</span>
                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-lavender-50 text-lavender-600 border border-lavender-100">{s.qualification_type}</span>
                    <span className="text-sm text-gray-700 truncate flex-1">{s.exam_location}</span>
                    <span className={`text-xs font-bold shrink-0 ${b.count ? 'text-gray-700' : 'text-gray-300'}`}>{b.count}名</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 pl-24">
                    {b.issues > 0 && <span className="text-[11px] font-semibold text-red-500">⚠ 未入力 {b.issues}名</span>}
                    {b.waiting && (
                      <span className={`text-[11px] font-semibold ${b.days <= 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                        発表 {fmt(b.rd)}{b.days === 0 ? '（今日）' : b.days < 0 ? '（未確認）' : ''}
                      </span>
                    )}
                    {s.result_checked && <span className="text-[11px] text-mint-600">✓ 発表確認済み</span>}
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
                <span className="text-sm font-semibold text-orange-600">試験日程が未登録の申込</span>
                <span className="ml-2 text-xs font-bold text-orange-600">{unregistered.length}名</span>
              </button>
            )}
          </div>
        </aside>

        {/* ── 右：受験者と書類 ── */}
        <main className="flex-1 min-w-0 flex flex-col">
          {selectedId == null ? (
            <p className="m-auto text-gray-400 text-sm">左から試験日程を選んでください</p>
          ) : (
            <>
              {/* 試験の情報 */}
              <div className="shrink-0 px-6 py-3 border-b border-lavender-100 bg-white/70 flex items-center gap-4 flex-wrap">
                {selected ? (
                  <>
                    <span className="text-base font-bold text-gray-700">{fmt(selected.exam_date, 'yyyy年M月d日(E)')}</span>
                    <span className="text-sm font-semibold text-lavender-600">{selected.qualification_type}</span>
                    <span className="text-sm text-gray-700">{selected.exam_location}</span>
                    <span className="text-xs text-gray-500">試験ID <span className="font-mono">{selected.exam_id}</span></span>
                    <span className="text-xs text-gray-500">合格発表 {resultDateOf(selected) ? fmt(resultDateOf(selected)) : '—'}{selected.result_date ? '＊' : ''}</span>
                    {selected.result_checked && <span className="text-xs font-semibold text-mint-600">✓ 合否確定済み</span>}
                    {/* 書類 ⇔ 合否 の切り替え */}
                    <div className="ml-auto flex rounded-lg border border-lavender-200 overflow-hidden text-xs font-semibold">
                      {([['docs', '📄 書類'], ['results', '🎯 合否']] as const).map(([k, l]) => (
                        <button key={k} type="button" onClick={() => setMode(k)}
                          className={`px-3 py-1 transition ${mode === k ? 'bg-lavender-400 text-white' : 'bg-white text-gray-500 hover:bg-lavender-50'}`}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <span className="text-sm font-semibold text-orange-600">試験日程が未登録の申込（試験日程を登録するか、申込の試験日・試験地を直してください）</span>
                )}
              </div>

              {selected && mode === 'results' ? (
                <ResultEntryPanel
                  session={selected}
                  entries={entries}
                  records={records}
                  onRecordsChange={setRecords}
                  onSessionChange={s => setSessions(ss => ss.map(x => x.id === s.id ? s : x))}
                  onOpenDetail={x => setDetail({ student: x.student, enrollment: x.enrollment })}
                  highlight={nameHit}
                />
              ) : (<>
              {/* 受験者 */}
              <div className="flex-1 overflow-y-auto">
                {entries.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-16">この試験の受験者はいません</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-lavender-50 text-xs text-gray-500">
                      <tr>
                        <th className="px-3 py-2 w-8"><input type="checkbox" checked={allChecked}
                          onChange={() => setChecked(allChecked ? new Set() : new Set(entries.map(x => x.enrollment.id)))} className="w-4 h-4 accent-lavender-500" /></th>
                        <th className="text-left px-2 py-2 font-medium">氏名</th>
                        <th className="text-left px-2 py-2 font-medium">生年月日</th>
                        <th className="text-left px-2 py-2 font-medium">身体検査</th>
                        <th className="text-left px-2 py-2 font-medium">学科</th>
                        <th className="text-left px-2 py-2 font-medium">実技</th>
                        <th className="text-left px-2 py-2 font-medium">同時申請</th>
                        <th className="text-left px-2 py-2 font-medium">申請日</th>
                        <th className="text-left px-2 py-2 font-medium">未入力</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map(x => {
                        const e = x.enrollment, st = x.student, ex = extraOf(e)
                        const issues = issuesOf(e)
                        const partner = jointIdOf(e) != null ? findJointPartner(e, applicants.map(a => a.enrollment)) : null
                        const hit = nameHit(x)
                        return (
                          <tr key={e.id} onDoubleClick={() => setDetail({ student: st, enrollment: e })} title="ダブルクリックで詳細・編集"
                            className={`border-b border-gray-50 cursor-pointer select-none ${hit ? 'bg-amber-50' : checked.has(e.id) ? 'bg-lavender-50/50' : 'hover:bg-lavender-50/40'}`}>
                            <td className="px-3 py-2"><input type="checkbox" checked={checked.has(e.id)} onChange={() => toggle(e.id)} onClick={ev => ev.stopPropagation()} className="w-4 h-4 accent-lavender-500" /></td>
                            <td className="px-2 py-2">
                              <span className="font-medium text-gray-700">{st.last_name} {st.first_name}</span>
                              <span className="block text-[11px] text-gray-400">{st.last_kana} {st.first_kana}</span>
                            </td>
                            <td className="px-2 py-2 text-gray-600">{st.birth_date ? fmt(st.birth_date, 'yyyy/M/d') : ''}</td>
                            <td className="px-2 py-2 text-gray-600">{SHINTAI_LABEL[String(ex.shintai ?? '')] ?? ''}</td>
                            <td className={`px-2 py-2 ${ex.exam_gakka === false ? 'text-amber-600 font-semibold' : 'text-gray-600'}`}>{ex.exam_gakka === false ? '免除' : '受験'}</td>
                            <td className={`px-2 py-2 ${ex.exam_jitsugi === false ? 'text-amber-600 font-semibold' : 'text-gray-600'}`}>{ex.exam_jitsugi === false ? '免除' : '受験'}</td>
                            <td className="px-2 py-2 text-xs text-gray-600">{partner ? `${String(extraOf(partner).exam_qual_type ?? '')} ${examDateOf(partner) ? fmt(examDateOf(partner)) : ''}` : ''}</td>
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
                  <button type="button" onClick={printApplications} disabled={!checkedEntries.length || !!busy} className="btn-primary btn-sm disabled:opacity-40">
                    {busy === '申請書を印刷' ? '⏳ 印刷中…' : '🖨 試験申請書'}
                  </button>
                  <span className="text-gray-200">|</span>
                  <span className="text-xs font-bold text-lavender-600 mr-1">この試験：</span>
                  <button type="button" onClick={() => printRoster(false)} disabled={!selected || !!busy} className="btn-secondary btn-sm disabled:opacity-40">🖨 試験申請者名簿</button>
                  <button type="button" onClick={() => printRoster(true)} disabled={!selected || !!busy} className="btn-secondary btn-sm disabled:opacity-40" title="受験者欄が空の名簿（手書き用）">名簿（白紙）</button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-400 mr-1">準備中：</span>
                  {['委任状（個別）', '委任状（一覧）', '免許委任状（個別）', '免許委任状（一覧）', 'ラベル印刷'].map(l => (
                    <button key={l} type="button" disabled className="btn-secondary btn-sm opacity-40 cursor-not-allowed" title="様式を確認してから作ります">{l}</button>
                  ))}
                </div>
              </div>
              </>)}
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
