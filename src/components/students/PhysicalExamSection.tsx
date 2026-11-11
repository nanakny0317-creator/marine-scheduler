/**
 * 身体検査の履歴（会員画面「試験記録」タブ）
 * - 受検日を入れると有効期限（受検日から1年）を自動で計算
 * - 有効／まもなく期限／期限切れ を色で表示
 */
import { useCallback, useEffect, useState } from 'react'
import type { PhysicalExam } from '../../types'
import { physicalExamsApi } from '../../lib/api'
import { PHYSICAL_VALID_YEARS, expiryAfterYears, fmtYmd, validityStatus } from '../../lib/validity'
import DateTextInput from '../DateTextInput'

const STATUS_STYLE = {
  valid:   { cls: 'bg-mint-50 text-mint-600 border-mint-200',       label: '有効' },
  soon:    { cls: 'bg-amber-50 text-amber-700 border-amber-200',    label: 'まもなく期限' },
  expired: { cls: 'bg-gray-100 text-gray-500 border-gray-200',      label: '期限切れ' },
  unknown: { cls: 'bg-gray-50 text-gray-400 border-gray-200',       label: '期限不明' },
} as const

interface Draft { id: number | null; exam_date: string; valid_until: string; note: string }
const EMPTY: Draft = { id: null, exam_date: '', valid_until: '', note: '' }

export default function PhysicalExamSection({ studentId, onChanged }: { studentId: number; onChanged?: () => void }) {
  const [list, setList] = useState<PhysicalExam[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setList(await physicalExamsApi.list(studentId).catch(() => []))
  }, [studentId])
  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!draft) return
    if (!draft.exam_date && !draft.valid_until) { alert('受検日を入力してください'); return }
    setSaving(true)
    try {
      const input = {
        student_id: studentId,
        exam_date: draft.exam_date || null,
        valid_until: draft.valid_until || expiryAfterYears(draft.exam_date, PHYSICAL_VALID_YEARS) || null,
        note: draft.note || null,
      }
      if (draft.id) await physicalExamsApi.update(draft.id, input)
      else await physicalExamsApi.create(input)
      setDraft(null)
      await load()
      onChanged?.()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (p: PhysicalExam) => {
    if (!window.confirm(`身体検査（${fmtYmd(p.exam_date) || '受検日不明'}）の記録を削除しますか？`)) return
    await physicalExamsApi.delete(p.id)
    await load()
    onChanged?.()
  }

  const editor = draft && (
    <div className="rounded-xl border border-lavender-200 bg-white p-3 grid grid-cols-[11rem_11rem_1fr_auto] gap-3 items-end">
      <div>
        <label className="field-label">受検日</label>
        <DateTextInput
          value={draft.exam_date}
          onChange={(v) => setDraft(d => d && ({ ...d, exam_date: v, valid_until: expiryAfterYears(v, PHYSICAL_VALID_YEARS) }))}
        />
      </div>
      <div>
        <label className="field-label">有効期限 <span className="font-normal text-gray-400">（自動）</span></label>
        <DateTextInput value={draft.valid_until} onChange={(v) => setDraft(d => d && ({ ...d, valid_until: v }))} />
      </div>
      <div>
        <label className="field-label">メモ</label>
        <input type="text" value={draft.note} onChange={(e) => setDraft(d => d && ({ ...d, note: e.target.value }))} className="field-input" placeholder="受検場所など" />
      </div>
      <div className="flex gap-2 pb-0.5">
        <button type="button" onClick={() => setDraft(null)} className="btn-secondary btn-sm">キャンセル</button>
        <button type="button" onClick={save} disabled={saving} className="btn-primary btn-sm">{saving ? '保存中…' : '保存'}</button>
      </div>
    </div>
  )

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-600">
          身体検査 <span className="ml-1 note-text font-normal">受検日から{PHYSICAL_VALID_YEARS}年有効</span>
        </h3>
        {!draft && (
          <button type="button" onClick={() => setDraft({ ...EMPTY })} className="btn-secondary btn-sm">＋ 身体検査を追加</button>
        )}
      </div>
      {draft && draft.id == null && editor}
      {list.length === 0 && !draft ? (
        <p className="text-sm text-gray-400 py-2">身体検査の記録がありません。</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map(p => {
            if (draft?.id === p.id) return <li key={p.id}>{editor}</li>
            const st = STATUS_STYLE[validityStatus(p.valid_until)]
            return (
              <li key={p.id} className="flex items-center gap-3 rounded-lg border border-lavender-100 bg-white px-3 py-2 text-sm">
                <span className={`text-xs font-bold px-2 py-0.5 rounded border ${st.cls}`}>{st.label}</span>
                <span className="text-gray-700">受検 {fmtYmd(p.exam_date) || '—'}</span>
                <span className="text-gray-500">{p.valid_until ? `${fmtYmd(p.valid_until)} まで` : ''}</span>
                {p.note && <span className="text-gray-400 truncate">{p.note}</span>}
                <span className="ml-auto flex gap-2">
                  <button type="button" onClick={() => setDraft({ id: p.id, exam_date: p.exam_date ?? '', valid_until: p.valid_until ?? '', note: p.note ?? '' })} className="btn-secondary btn-sm">編集</button>
                  <button type="button" onClick={() => remove(p)} className="btn-danger btn-sm">削除</button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
