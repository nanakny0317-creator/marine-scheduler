/**
 * 合否の入力（試験申請 → 合格確認）
 *
 * 合格発表の日に、学科・実技の合否と受験番号を入れて「合否を確定」する。
 * 確定した試験の合格者だけが免許申請の画面に出る。
 */
import { useState } from 'react'
import type { ExamRecord, ExamRecordInput, ExamResult, ExamSession } from '../../types'
import { examSessionsApi } from '../../lib/api'
import type { RosterEntry } from '../../lib/rosterPrint'
import { recordFor, saveResult, statusOf } from '../../lib/examResultEntry'

const RESULT_BTNS: { v: Exclude<ExamResult, null | '免'>; label: string; on: string }[] = [
  { v: '合', label: '合', on: 'bg-mint-500 text-white border-mint-500' },
  { v: '否', label: '否', on: 'bg-red-400 text-white border-red-400' },
  { v: '不', label: '欠', on: 'bg-gray-400 text-white border-gray-400' },
]

interface Props {
  session: ExamSession
  entries: RosterEntry[]
  records: ExamRecord[]
  onRecordsChange: (records: ExamRecord[]) => void
  onSessionChange: (session: ExamSession) => void
  onOpenDetail: (x: RosterEntry) => void
  highlight?: (x: RosterEntry) => boolean
}

export default function ResultEntryPanel({ session, entries, records, onRecordsChange, onSessionChange, onOpenDetail, highlight }: Props) {
  const [saving, setSaving] = useState<number | null>(null)
  const confirmed = session.result_checked

  const rows = entries.map(x => {
    const rec = recordFor(x, session, records)
    return { x, rec, st: statusOf(x, rec) }
  })
  const pending = rows.filter(r => r.st.pending).length
  const passed = rows.filter(r => r.st.passed).length

  const save = async (x: RosterEntry, patch: Partial<ExamRecordInput>) => {
    setSaving(x.enrollment.id)
    try {
      const saved = await saveResult(x, session, records, patch)
      onRecordsChange(records.some(r => r.id === saved.id) ? records.map(r => r.id === saved.id ? saved : r) : [saved, ...records])
    } catch (e) {
      alert(`保存できませんでした。\n${e instanceof Error ? e.message : String(e)}`)
    } finally { setSaving(null) }
  }

  const setConfirmed = async (value: boolean) => {
    if (value && pending > 0) { alert(`合否が未入力の人が ${pending} 名います。欠席の人は「欠」を選んでください。`); return }
    if (!value && !window.confirm('確定を取り消しますか？\n取り消すと、この試験の合格者は免許申請の画面に出なくなります。')) return
    const { id: _id, created_at: _c, updated_at: _u, ...input } = session
    try {
      const updated = await examSessionsApi.update(session.id, { ...input, result_checked: value })
      onSessionChange(updated ?? { ...session, result_checked: value })
    } catch (e) {
      alert(`保存できませんでした。\n${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const resultButtons = (x: RosterEntry, takes: boolean, cur: ExamResult, key: 'gakka_result' | 'jitsugi_result') =>
    !takes ? <span className="text-xs font-semibold text-amber-600">免除</span> : (
      <div className="flex gap-1">
        {RESULT_BTNS.map(b => (
          <button key={b.v} type="button" disabled={confirmed || saving === x.enrollment.id}
            onClick={() => save(x, { [key]: cur === b.v ? null : b.v })}
            className={`w-7 h-7 rounded border text-xs font-bold transition disabled:cursor-not-allowed ${cur === b.v ? b.on : `bg-white text-gray-400 border-gray-200 ${confirmed ? 'opacity-40' : 'hover:border-lavender-300'}`}`}>
            {b.label}
          </button>
        ))}
      </div>
    )

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-16">この試験の受験者はいません</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-lavender-50 text-xs text-gray-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">氏名</th>
                <th className="text-left px-2 py-2 font-medium">受験番号</th>
                <th className="text-left px-2 py-2 font-medium">学科</th>
                <th className="text-left px-2 py-2 font-medium">実技</th>
                <th className="text-left px-2 py-2 font-medium">結果</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ x, rec, st }) => (
                <tr key={x.enrollment.id} onDoubleClick={() => onOpenDetail(x)} title="ダブルクリックで詳細・編集"
                  className={`border-b border-gray-50 ${highlight?.(x) ? 'bg-amber-50' : st.passed && !st.pending ? 'bg-mint-50/40' : ''}`}>
                  <td className="px-4 py-2">
                    <span className="font-medium text-gray-700">{x.student.last_name} {x.student.first_name}</span>
                    <span className="block text-[11px] text-gray-400">{x.student.last_kana} {x.student.first_kana}</span>
                  </td>
                  <td className="px-2 py-2">
                    <input type="text" defaultValue={rec?.gakka_exam_number ?? rec?.jitsugi_exam_number ?? ''} key={rec?.id ?? 'new'}
                      disabled={confirmed}
                      onBlur={e => {
                        const v = e.target.value.trim() || null
                        if (v === (rec?.gakka_exam_number ?? rec?.jitsugi_exam_number ?? null)) return
                        save(x, { ...(st.takesGakka ? { gakka_exam_number: v } : {}), ...(st.takesJitsugi ? { jitsugi_exam_number: v } : {}) })
                      }}
                      className="field-input w-24 disabled:bg-gray-50" placeholder="0001" />
                  </td>
                  <td className="px-2 py-2">{resultButtons(x, st.takesGakka, st.gakka, 'gakka_result')}</td>
                  <td className="px-2 py-2">{resultButtons(x, st.takesJitsugi, st.jitsugi, 'jitsugi_result')}</td>
                  <td className="px-2 py-2 text-xs font-bold">
                    {st.pending ? <span className="text-gray-400">未入力</span>
                      : st.passed ? <span className="text-mint-600">合格{confirmed ? ' → 免許申請' : ''}</span>
                      : <span className="text-red-500">不合格</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="px-6 py-2 note-text">「欠」は欠席（不受験）。合否は入れた時点で試験記録に保存され、合格日は合格発表日になります。「合否を確定」すると合格者が免許申請の画面に出ます。</p>
      </div>

      <div className="shrink-0 border-t border-lavender-100 bg-white px-6 py-3 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-bold text-mint-600">合格 {passed}名</span>
        <span className="text-sm text-gray-500">/ {entries.length}名</span>
        {pending > 0 && <span className="text-sm font-semibold text-blue-600">未入力 {pending}名</span>}
        {confirmed ? (
          <>
            <span className="ml-auto text-sm font-semibold text-mint-600">✓ 合否確定済み（合格者は免許申請へ）</span>
            <button type="button" onClick={() => setConfirmed(false)} className="btn-secondary btn-sm">確定を取り消す</button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmed(true)} disabled={entries.length === 0}
            className="ml-auto btn-primary btn-sm disabled:opacity-40"
            title={pending > 0 ? '全員の合否を入れると確定できます' : '合格者を免許申請の画面に送ります'}>
            ✓ 合否を確定
          </button>
        )}
      </div>
    </>
  )
}
