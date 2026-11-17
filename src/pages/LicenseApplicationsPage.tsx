/**
 * 免許申請の作業画面（免許申請の書類を作る）
 *
 * 書類は合格発表の前に用意することが多く、イレギュラーにも備えて、いつでも誰の分でも作れるようにする。
 * 合否の入力と確定は「試験申請 → 合格確認」で行い、ここでは結果を表示するだけ。
 *
 * 左：受験者のいる試験日程（発表前／確定済み／すべて・検索）
 * 右：その試験の受験者全員（結果：合格／不合格／未確定）と、免許申請の書類
 *     最初の選択：確定前の試験は全員、確定済みの試験は合格者だけ。
 *     不合格・未確定の人を含めて印刷するときは確認を出す（止めはしない）。
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { Enrollment, ExamRecord, ExamResult, ExamSession, Student } from '../types'
import { enrollmentsApi, examRecordsApi, examSessionsApi } from '../lib/api'
import { resultDateOf, todayIsoLocal } from '../lib/examResult'
import { rosterEntriesFor, type RosterEntry } from '../lib/rosterPrint'
import { needsResultCheck, recordFor, statusOf, type ResultStatus } from '../lib/examResultEntry'
import ScheduleItemDetailModal from '../components/students/ScheduleItemDetailModal'

type Filter = 'open' | 'confirmed' | 'all'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'open',      label: '発表前' },
  { key: 'confirmed', label: '確定済み' },
  { key: 'all',       label: 'すべて' },
]

function fmt(d: string, f = 'M/d(E)') {
  try { return format(new Date(d + 'T00:00'), f, { locale: ja }) } catch { return d }
}

type Outcome = 'passed' | 'failed' | 'open'
interface Row { x: RosterEntry; rec: ExamRecord | null; st: ResultStatus; outcome: Outcome }

const OUTCOME_LABEL: Record<Outcome, { text: string; cls: string }> = {
  passed: { text: '合格',   cls: 'bg-mint-100 text-mint-700' },
  failed: { text: '不合格', cls: 'bg-red-50 text-red-500' },
  open:   { text: '未確定', cls: 'bg-gray-100 text-gray-500' },
}
const RESULT_TEXT: Record<string, { text: string; cls: string }> = {
  '合': { text: '合格', cls: 'text-mint-600' },
  '否': { text: '不合格', cls: 'text-red-500' },
  '不': { text: '欠席', cls: 'text-gray-500' },
  '免': { text: '免除', cls: 'text-amber-600' },
}
const resultCell = (r: ExamResult) => r ? <span className={`font-semibold ${RESULT_TEXT[r].cls}`}>{RESULT_TEXT[r].text}</span> : <span className="text-gray-300">—</span>

export default function LicenseApplicationsPage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<ExamSession[]>([])
  const [applicants, setApplicants] = useState<RosterEntry[]>([])
  const [records, setRecords] = useState<ExamRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('open')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [detail, setDetail] = useState<{ student: Student; enrollment: Enrollment } | null>(null)

  const load = async () => {
    try {
      const [s, a, r] = await Promise.all([examSessionsApi.list(), enrollmentsApi.listAll('new'), examRecordsApi.listAll()])
      setSessions(s); setApplicants(a); setRecords(r)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const today = todayIsoLocal()

  // 試験ごとの受験者と結果
  const rowsBySession = useMemo(() => {
    const m = new Map<number, Row[]>()
    for (const s of sessions) {
      const rows = rosterEntriesFor(s, applicants).map(x => {
        const rec = recordFor(x, s, records)
        const st = statusOf(x, rec)
        const outcome: Outcome = !s.result_checked ? 'open' : st.passed && !st.pending ? 'passed' : 'failed'
        return { x, rec, st, outcome }
      })
      if (rows.length) m.set(s.id, rows)
    }
    return m
  }, [sessions, applicants, records])

  // 合否確定待ちの試験の数（合格確認へ案内する）
  const unconfirmed = sessions.filter(s => needsResultCheck(s, rowsBySession.get(s.id)?.length ?? 0, today)).length

  const q = query.trim().replace(/\s/g, '')
  const nameHit = (x: RosterEntry) => !!q && [x.student.last_name, x.student.first_name, x.student.last_kana, x.student.first_kana]
    .join('').replace(/\s/g, '').includes(q)

  const visible = useMemo(() => sessions.filter(s => {
    const rows = rowsBySession.get(s.id)
    if (!rows) return false
    if (q) return [s.exam_date, s.exam_date.replace(/-/g, '/'), fmt(s.exam_date, 'M/d'), s.exam_location, s.qualification_type, s.exam_id].some(v => v.includes(q))
      || rows.some(r => nameHit(r.x))
    if (filter === 'open') return !s.result_checked
    if (filter === 'confirmed') return s.result_checked
    return true
  }).sort((a, b) => filter === 'open' && !q ? a.exam_date.localeCompare(b.exam_date) : b.exam_date.localeCompare(a.exam_date)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [sessions, rowsBySession, filter, q])

  useEffect(() => {
    if (selectedId != null && visible.some(s => s.id === selectedId)) return
    setSelectedId(visible[0]?.id ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const selected = sessions.find(s => s.id === selectedId) ?? null
  const rows = selected ? (rowsBySession.get(selected.id) ?? []) : []

  // 最初の選択：確定前は全員、確定済みは合格者だけ
  const defaultChecked = () => new Set(rows.filter(r => !selected?.result_checked || r.outcome === 'passed').map(r => r.x.enrollment.id))
  useEffect(() => { setChecked(defaultChecked())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, rows.length, selected?.result_checked])

  const checkedRows = rows.filter(r => checked.has(r.x.enrollment.id))
  const allChecked = rows.length > 0 && checkedRows.length === rows.length
  const someChecked = checkedRows.length > 0 && !allChecked
  const toggle = (id: number) => setChecked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(rows.map(r => r.x.enrollment.id)))
  const passedCount = rows.filter(r => r.outcome === 'passed').length

  /**
   * 印刷の前の確認。不合格・未確定の人が入っていたら確認する（止めはしない）。
   * 免許申請書などの印刷をつないだら、各ボタンの処理の最初で呼ぶ。
   */
  const confirmBeforePrint = (label: string): boolean => {
    if (checkedRows.length === 0) { alert('印刷する人を選んでください'); return false }
    const failed = checkedRows.filter(r => r.outcome === 'failed').length
    const open = checkedRows.filter(r => r.outcome === 'open').length
    const notes = [failed && `不合格の人が ${failed} 名`, open && `合否が未確定の人が ${open} 名`].filter(Boolean)
    if (notes.length === 0) return true
    return window.confirm(`${notes.join('、')}含まれています。\nこのまま${label}を印刷しますか？`)
  }
  void confirmBeforePrint

  const sessionSummary = (s: ExamSession) => {
    const list = rowsBySession.get(s.id) ?? []
    return { count: list.length, passed: list.filter(r => r.outcome === 'passed').length }
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-lavender-50 via-white to-mint-50">
      <div className="shrink-0 px-6 py-4 flex items-center gap-4 border-b border-lavender-100 bg-white/70">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600 text-sm">← トップへ</button>
        <h1 className="text-lg font-bold text-gray-700">🎓 免許申請</h1>
        <span className="note-text">免許申請の書類はいつでも作れます（合否の入力は 試験申請 → 合格確認）</span>
        {unconfirmed > 0 && (
          <button type="button" onClick={() => navigate('/exam-applications?tab=waiting')}
            className="ml-auto btn-secondary btn-sm text-red-500 font-semibold">
            🔔 合否確定待ちの試験 {unconfirmed}件 →
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* ── 左：試験日程 ── */}
        <aside className="w-[24rem] shrink-0 border-r border-lavender-100 bg-white/60 flex flex-col">
          <div className="p-3 space-y-2 border-b border-lavender-100">
            <input type="search" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="氏名・カナ・試験日（11/22）・試験地で検索" className="field-input" />
            <div className="flex gap-1">
              {FILTERS.map(f => (
                <button key={f.key} type="button" onClick={() => setFilter(f.key)} disabled={!!q}
                  className={`flex-1 py-1 rounded-lg text-xs font-semibold border transition disabled:opacity-40 ${filter === f.key ? 'bg-lavender-400 text-white border-lavender-400' : 'bg-white text-gray-500 border-gray-200 hover:border-lavender-300'}`}>
                  {f.label}
                </button>
              ))}
            </div>
            {q && <p className="note-text">検索中はすべての試験から探します</p>}
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? <p className="text-center text-gray-400 text-sm py-10">読み込み中…</p>
              : visible.length === 0 ? <p className="text-center text-gray-400 text-sm py-10">該当する試験日程がありません</p>
              : visible.map(s => {
                const sm = sessionSummary(s)
                const rd = resultDateOf(s)
                return (
                  <button key={s.id} type="button" onClick={() => setSelectedId(s.id)}
                    className={`w-full text-left px-4 py-2.5 border-b border-gray-50 transition ${s.id === selectedId ? 'bg-lavender-100/70' : 'hover:bg-lavender-50/60'}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-700 w-24 shrink-0">{fmt(s.exam_date, 'yy/M/d(E)')}</span>
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-lavender-50 text-lavender-600 border border-lavender-100">{s.qualification_type}</span>
                      <span className="text-sm text-gray-700 truncate flex-1">{s.exam_location}</span>
                      <span className="text-xs font-bold text-gray-700 shrink-0">{sm.count}名</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 pl-24 text-[11px]">
                      <span className="text-gray-400">発表 {rd ? fmt(rd) : '—'}</span>
                      {s.result_checked
                        ? <span className="font-semibold text-mint-600">✓ 確定 合格 {sm.passed}名</span>
                        : <span className="text-gray-400">未確定</span>}
                      {q && (rowsBySession.get(s.id) ?? []).filter(r => nameHit(r.x)).map(r => (
                        <span key={r.x.enrollment.id} className="font-semibold text-amber-600">👤 {r.x.student.last_name} {r.x.student.first_name}</span>
                      ))}
                    </div>
                  </button>
                )
              })}
          </div>
        </aside>

        {/* ── 右：受験者と書類 ── */}
        <main className="flex-1 min-w-0 flex flex-col">
          {!selected ? <p className="m-auto text-gray-400 text-sm">左から試験日程を選んでください</p> : (
            <>
              <div className="shrink-0 px-6 py-3 border-b border-lavender-100 bg-white/70 flex items-center gap-4 flex-wrap">
                <span className="text-base font-bold text-gray-700">{fmt(selected.exam_date, 'yyyy年M月d日(E)')}</span>
                <span className="text-sm font-semibold text-lavender-600">{selected.qualification_type}</span>
                <span className="text-sm text-gray-700">{selected.exam_location}</span>
                <span className="text-xs text-gray-500">試験ID <span className="font-mono">{selected.exam_id}</span></span>
                <span className="text-xs text-gray-500">合格発表 {resultDateOf(selected) ? fmt(resultDateOf(selected)) : '—'}</span>
                <span className="ml-auto text-sm font-bold">
                  {selected.result_checked
                    ? <span className="text-mint-600">✓ 合否確定　合格 {passedCount}名 / {rows.length}名</span>
                    : <span className="text-gray-500">合否未確定　受験者 {rows.length}名</span>}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-lavender-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-3 py-2 w-8">
                        <input type="checkbox" checked={allChecked} onChange={toggleAll} title="全員を選ぶ／選択を外す"
                          ref={el => { if (el) el.indeterminate = someChecked }}
                          className="w-4 h-4 accent-lavender-500 cursor-pointer" />
                      </th>
                      <th className="text-left px-2 py-2 font-medium">結果</th>
                      <th className="text-left px-2 py-2 font-medium">氏名</th>
                      <th className="text-left px-2 py-2 font-medium">生年月日</th>
                      <th className="text-left px-2 py-2 font-medium">受験番号</th>
                      <th className="text-left px-2 py-2 font-medium">学科</th>
                      <th className="text-left px-2 py-2 font-medium">実技</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const { x, rec, st, outcome } = r
                      const o = OUTCOME_LABEL[outcome]
                      return (
                        <tr key={x.enrollment.id} onDoubleClick={() => setDetail({ student: x.student, enrollment: x.enrollment })} title="ダブルクリックで詳細・編集"
                          className={`border-b border-gray-50 cursor-pointer select-none ${nameHit(x) ? 'bg-amber-50' : checked.has(x.enrollment.id) ? 'bg-lavender-50/50' : 'hover:bg-lavender-50/40'} ${outcome === 'failed' && !checked.has(x.enrollment.id) ? 'opacity-60' : ''}`}>
                          <td className="px-3 py-2"><input type="checkbox" checked={checked.has(x.enrollment.id)} onChange={() => toggle(x.enrollment.id)} onClick={ev => ev.stopPropagation()} className="w-4 h-4 accent-lavender-500 cursor-pointer" /></td>
                          <td className="px-2 py-2"><span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${o.cls}`}>{o.text}</span></td>
                          <td className="px-2 py-2">
                            <span className="font-medium text-gray-700">{x.student.last_name} {x.student.first_name}</span>
                            <span className="block text-[11px] text-gray-400">{x.student.last_kana} {x.student.first_kana}</span>
                          </td>
                          <td className="px-2 py-2 text-gray-600">{x.student.birth_date ? fmt(x.student.birth_date, 'yyyy/M/d') : ''}</td>
                          <td className="px-2 py-2 text-gray-600 font-mono text-xs">{rec?.gakka_exam_number ?? rec?.jitsugi_exam_number ?? ''}</td>
                          <td className="px-2 py-2 text-xs">{resultCell(st.gakka)}</td>
                          <td className="px-2 py-2 text-xs">{resultCell(st.jitsugi)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="shrink-0 border-t border-lavender-100 bg-white px-6 py-3 flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-lavender-600 mr-1">選んだ {checkedRows.length}名：</span>
                <span className="text-xs text-gray-400 mr-1">準備中：</span>
                {['免許申請書', '免許委任状（個別）', '免許委任状（一覧）', 'ラベル印刷'].map(l => (
                  <button key={l} type="button" disabled className="btn-secondary btn-sm opacity-40 cursor-not-allowed" title="様式を確認してから作ります">{l}</button>
                ))}
                <button type="button" onClick={() => setChecked(defaultChecked())} className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline">
                  {selected.result_checked ? '合格者だけ選び直す' : '全員を選び直す'}
                </button>
              </div>
            </>
          )}
        </main>
      </div>

      {detail && (
        <ScheduleItemDetailModal student={detail.student} enrollment={detail.enrollment}
          onClose={() => { setDetail(null); load() }} onUpdated={() => load()} />
      )}
    </div>
  )
}
