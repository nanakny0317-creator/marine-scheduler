/**
 * 免許申請の作業画面（試験合格者の免許申請を運輸局に出す）
 *
 * 左：試験日程（発表済み／発表前／すべて・検索）
 * 右：その試験の受験者。合格発表の日に、ここで学科・実技の合否（と受験番号）を入力する
 *     → 試験記録（exam_records）に保存。両方合格（または免除）の人が「合格者」として免許申請の対象になる
 * 全員の合否が入ったら、その試験の「発表確認済み」を自動で付ける
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { Enrollment, ExamRecord, ExamRecordInput, ExamResult, ExamSession, Student } from '../types'
import { enrollmentsApi, examRecordsApi, examSessionsApi } from '../lib/api'
import { resultDateOf, todayIsoLocal, daysBetween } from '../lib/examResult'
import { rosterEntriesFor, type RosterEntry } from '../lib/rosterPrint'
import ScheduleItemDetailModal from '../components/students/ScheduleItemDetailModal'

type Filter = 'announced' | 'before' | 'all'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'announced', label: '発表済み' },
  { key: 'before',    label: '発表前' },
  { key: 'all',       label: 'すべて' },
]

function fmt(d: string, f = 'M/d(E)') {
  try { return format(new Date(d + 'T00:00'), f, { locale: ja }) } catch { return d }
}
function extraOf(e: Enrollment): Record<string, unknown> {
  try { return JSON.parse(e.extra_json) as Record<string, unknown> } catch { return {} }
}

/** この申込・試験日程の試験記録 */
function recordFor(x: RosterEntry, s: ExamSession, records: ExamRecord[]): ExamRecord | null {
  return records.find(r => r.enrollment_id === x.enrollment.id)
    ?? records.find(r => r.student_id === x.student.id && (r.gakka_session_id === s.id || r.jitsugi_session_id === s.id))
    ?? null
}

interface Status {
  takesGakka: boolean
  takesJitsugi: boolean
  gakka: ExamResult      // 受けない科目は '免'
  jitsugi: ExamResult
  passed: boolean
  pending: boolean       // まだ入力していない科目がある
}
function statusOf(x: RosterEntry, rec: ExamRecord | null): Status {
  const ex = extraOf(x.enrollment)
  const takesGakka = ex.exam_gakka !== false
  const takesJitsugi = ex.exam_jitsugi !== false
  const gakka = takesGakka ? rec?.gakka_result ?? null : '免'
  const jitsugi = takesJitsugi ? rec?.jitsugi_result ?? null : '免'
  const ok = (r: ExamResult) => r === '合' || r === '免'
  return { takesGakka, takesJitsugi, gakka, jitsugi, passed: ok(gakka) && ok(jitsugi), pending: gakka == null || jitsugi == null }
}

const RESULT_BTNS: { v: Exclude<ExamResult, null | '免'>; label: string; on: string }[] = [
  { v: '合', label: '合', on: 'bg-mint-500 text-white border-mint-500' },
  { v: '否', label: '否', on: 'bg-red-400 text-white border-red-400' },
  { v: '不', label: '欠', on: 'bg-gray-400 text-white border-gray-400' },
]

export default function LicenseApplicationsPage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<ExamSession[]>([])
  const [applicants, setApplicants] = useState<RosterEntry[]>([])
  const [records, setRecords] = useState<ExamRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('announced')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [detail, setDetail] = useState<{ student: Student; enrollment: Enrollment } | null>(null)
  const [saving, setSaving] = useState<number | null>(null)

  const load = async () => {
    try {
      const [s, a, r] = await Promise.all([examSessionsApi.list(), enrollmentsApi.listAll('new'), examRecordsApi.listAll()])
      setSessions(s); setApplicants(a); setRecords(r)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const today = todayIsoLocal()
  const bySession = useMemo(() => {
    const m = new Map<number, RosterEntry[]>()
    for (const s of sessions) m.set(s.id, rosterEntriesFor(s, applicants))
    return m
  }, [sessions, applicants])

  const q = query.trim().replace(/\s/g, '')
  const nameHit = (x: RosterEntry) => !!q && [x.student.last_name, x.student.first_name, x.student.last_kana, x.student.first_kana]
    .join('').replace(/\s/g, '').includes(q)

  const summary = (s: ExamSession) => {
    const list = bySession.get(s.id) ?? []
    const st = list.map(x => statusOf(x, recordFor(x, s, records)))
    return { count: list.length, passed: st.filter(x => x.passed).length, pending: st.filter(x => x.pending).length }
  }

  const visible = useMemo(() => sessions.filter(s => {
    if ((bySession.get(s.id)?.length ?? 0) === 0) return false
    if (q) return [s.exam_date, s.exam_date.replace(/-/g, '/'), fmt(s.exam_date, 'M/d'), s.exam_location, s.qualification_type, s.exam_id].some(v => v.includes(q))
      || (bySession.get(s.id) ?? []).some(nameHit)
    const rd = resultDateOf(s)
    if (filter === 'announced') return !!rd && rd <= today
    if (filter === 'before') return !rd || rd > today
    return true
  }).sort((a, b) => filter === 'before' && !q ? a.exam_date.localeCompare(b.exam_date) : b.exam_date.localeCompare(a.exam_date)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [sessions, bySession, filter, q, today])

  useEffect(() => {
    if (selectedId != null && visible.some(s => s.id === selectedId)) return
    setSelectedId(visible[0]?.id ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const selected = sessions.find(s => s.id === selectedId) ?? null
  const entries = selected ? (bySession.get(selected.id) ?? []) : []
  const rows = entries.map(x => ({ x, rec: selected ? recordFor(x, selected, records) : null }))
    .map(r => ({ ...r, st: statusOf(r.x, r.rec) }))
  const passers = rows.filter(r => r.st.passed)

  useEffect(() => { setChecked(new Set(passers.map(r => r.x.enrollment.id))) // 合格者は最初から選択
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, passers.length])

  // ── 合否・受験番号の保存 ──
  const saveRecord = async (x: RosterEntry, patch: Partial<ExamRecordInput>) => {
    if (!selected) return
    setSaving(x.enrollment.id)
    try {
      const rec = recordFor(x, selected, records)
      const st = statusOf(x, rec)
      const rd = resultDateOf(selected) || null
      const base: ExamRecordInput = rec
        ? { ...rec }
        : {
            student_id: x.student.id, enrollment_id: x.enrollment.id, qualification_type: selected.qualification_type,
            shintai_cert: false, shintai_valid_until: null,
            gakka_session_id: st.takesGakka ? selected.id : null, gakka_exam_number: null,
            gakka_result: st.takesGakka ? null : '免', gakka_result_date: null,
            jitsugi_session_id: st.takesJitsugi ? selected.id : null, jitsugi_exam_number: null,
            jitsugi_result: st.takesJitsugi ? null : '免', jitsugi_result_date: null,
            note: null,
          }
      const next: ExamRecordInput = { ...base, enrollment_id: base.enrollment_id ?? x.enrollment.id, ...patch }
      // 合否を入れたら合格日（＝発表日）も入れる
      if (patch.gakka_result !== undefined) next.gakka_result_date = patch.gakka_result ? (base.gakka_result_date || rd) : null
      if (patch.jitsugi_result !== undefined) next.jitsugi_result_date = patch.jitsugi_result ? (base.jitsugi_result_date || rd) : null
      const { id: _i, created_at: _c, updated_at: _u, ...input } = next as ExamRecordInput & Partial<ExamRecord>
      const saved = rec ? await examRecordsApi.update(rec.id, input) : await examRecordsApi.create(input)
      const nextRecords = rec ? records.map(r => r.id === saved.id ? saved : r) : [saved, ...records]
      setRecords(nextRecords)
      // 全員の合否が入ったら「発表確認済み」にする
      const allDone = entries.every(e => !statusOf(e, recordFor(e, selected, nextRecords)).pending)
      if (allDone && !selected.result_checked) {
        const { id: _sid, created_at: _sc, updated_at: _su, ...si } = selected
        await examSessionsApi.update(selected.id, { ...si, result_checked: true })
        setSessions(ss => ss.map(s => s.id === selected.id ? { ...s, result_checked: true } : s))
      }
    } catch (e) {
      alert(`保存できませんでした。\n${e instanceof Error ? e.message : String(e)}`)
    } finally { setSaving(null) }
  }

  const resultButtons = (x: RosterEntry, rec: ExamRecord | null, takes: boolean, cur: ExamResult, key: 'gakka_result' | 'jitsugi_result') =>
    !takes ? <span className="text-xs font-semibold text-amber-600">免除</span> : (
      <div className="flex gap-1">
        {RESULT_BTNS.map(b => (
          <button key={b.v} type="button" disabled={saving === x.enrollment.id}
            onClick={() => saveRecord(x, { [key]: cur === b.v ? null : b.v })}
            className={`w-7 h-7 rounded border text-xs font-bold transition ${cur === b.v ? b.on : 'bg-white text-gray-400 border-gray-200 hover:border-lavender-300'}`}>
            {b.label}
          </button>
        ))}
      </div>
    )

  const checkedPassers = passers.filter(r => checked.has(r.x.enrollment.id))

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-lavender-50 via-white to-mint-50">
      <div className="shrink-0 px-6 py-4 flex items-center gap-4 border-b border-lavender-100 bg-white/70">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600 text-sm">← トップへ</button>
        <h1 className="text-lg font-bold text-gray-700">🎓 免許申請</h1>
        <span className="note-text">合格発表の日に合否を入れると、合格者が免許申請の対象になります</span>
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
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? <p className="text-center text-gray-400 text-sm py-10">読み込み中…</p>
              : visible.length === 0 ? <p className="text-center text-gray-400 text-sm py-10">該当する試験日程がありません</p>
              : visible.map(s => {
                const sm = summary(s)
                const rd = resultDateOf(s)
                const days = rd ? daysBetween(today, rd) : 999
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
                      <span className="text-gray-400">発表 {rd ? fmt(rd) : '—'}{days === 0 ? '（今日）' : ''}</span>
                      {days <= 0 && sm.pending > 0 && <span className="font-semibold text-blue-600">合否未入力 {sm.pending}名</span>}
                      {sm.passed > 0 && <span className="font-semibold text-mint-600">合格 {sm.passed}名</span>}
                      {q && (bySession.get(s.id) ?? []).filter(nameHit).map(x => (
                        <span key={x.enrollment.id} className="font-semibold text-amber-600">👤 {x.student.last_name} {x.student.first_name}</span>
                      ))}
                    </div>
                  </button>
                )
              })}
          </div>
        </aside>

        {/* ── 右：合否と合格者 ── */}
        <main className="flex-1 min-w-0 flex flex-col">
          {!selected ? <p className="m-auto text-gray-400 text-sm">左から試験日程を選んでください</p> : (
            <>
              <div className="shrink-0 px-6 py-3 border-b border-lavender-100 bg-white/70 flex items-center gap-4 flex-wrap">
                <span className="text-base font-bold text-gray-700">{fmt(selected.exam_date, 'yyyy年M月d日(E)')}</span>
                <span className="text-sm font-semibold text-lavender-600">{selected.qualification_type}</span>
                <span className="text-sm text-gray-700">{selected.exam_location}</span>
                <span className="text-xs text-gray-500">試験ID <span className="font-mono">{selected.exam_id}</span></span>
                <span className="text-xs text-gray-500">合格発表 {resultDateOf(selected) ? fmt(resultDateOf(selected)) : '—'}</span>
                {selected.result_checked && <span className="text-xs font-semibold text-mint-600">✓ 発表確認済み</span>}
                <span className="ml-auto text-sm font-bold text-mint-600">合格 {passers.length}名 / {entries.length}名</span>
              </div>

              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-lavender-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-3 py-2 w-8"></th>
                      <th className="text-left px-2 py-2 font-medium">氏名</th>
                      <th className="text-left px-2 py-2 font-medium">受験番号</th>
                      <th className="text-left px-2 py-2 font-medium">学科</th>
                      <th className="text-left px-2 py-2 font-medium">実技</th>
                      <th className="text-left px-2 py-2 font-medium">結果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ x, rec, st }) => (
                      <tr key={x.enrollment.id} onDoubleClick={() => setDetail({ student: x.student, enrollment: x.enrollment })} title="ダブルクリックで詳細・編集"
                        className={`border-b border-gray-50 ${nameHit(x) ? 'bg-amber-50' : st.passed ? 'bg-mint-50/40' : ''}`}>
                        <td className="px-3 py-2">
                          {st.passed && <input type="checkbox" checked={checked.has(x.enrollment.id)}
                            onChange={() => setChecked(p => { const n = new Set(p); if (n.has(x.enrollment.id)) n.delete(x.enrollment.id); else n.add(x.enrollment.id); return n })}
                            className="w-4 h-4 accent-lavender-500" />}
                        </td>
                        <td className="px-2 py-2">
                          <span className="font-medium text-gray-700">{x.student.last_name} {x.student.first_name}</span>
                          <span className="block text-[11px] text-gray-400">{x.student.last_kana} {x.student.first_kana}</span>
                        </td>
                        <td className="px-2 py-2">
                          <input type="text" defaultValue={rec?.gakka_exam_number ?? rec?.jitsugi_exam_number ?? ''} key={rec?.id ?? 'new'}
                            onBlur={e => {
                              const v = e.target.value.trim() || null
                              if (v === (rec?.gakka_exam_number ?? rec?.jitsugi_exam_number ?? null)) return
                              saveRecord(x, { ...(st.takesGakka ? { gakka_exam_number: v } : {}), ...(st.takesJitsugi ? { jitsugi_exam_number: v } : {}) })
                            }}
                            className="field-input w-24" placeholder="0001" />
                        </td>
                        <td className="px-2 py-2">{resultButtons(x, rec, st.takesGakka, st.gakka, 'gakka_result')}</td>
                        <td className="px-2 py-2">{resultButtons(x, rec, st.takesJitsugi, st.jitsugi, 'jitsugi_result')}</td>
                        <td className="px-2 py-2 text-xs font-bold">
                          {st.passed ? <span className="text-mint-600">合格 → 免許申請</span>
                            : st.pending ? <span className="text-gray-400">未入力</span>
                            : <span className="text-red-500">不合格</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="px-6 py-2 note-text">「欠」は欠席（不受験）。合否を入れると試験記録に保存され、合格日は合格発表日になります。</p>
              </div>

              <div className="shrink-0 border-t border-lavender-100 bg-white px-6 py-3 flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-lavender-600 mr-1">選んだ合格者 {checkedPassers.length}名：</span>
                <span className="text-xs text-gray-400 mr-1">準備中：</span>
                {['免許申請書', '免許委任状（個別）', '免許委任状（一覧）', 'ラベル印刷'].map(l => (
                  <button key={l} type="button" disabled className="btn-secondary btn-sm opacity-40 cursor-not-allowed" title="様式を確認してから作ります">{l}</button>
                ))}
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
