import { useState } from 'react'
import type { Enrollment, Student } from '../../types'
import DateTextInput from '../DateTextInput'
import { getApplicationDate, setApplicationDates } from '../../lib/applicationDate'

function todayIso(): string {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

/** 選んだ受講者の申請日（申請書に印字する日付）をまとめて設定する */
export default function ApplicationDateModal({ items, onClose, onSaved }: {
  items: { student: Student; enrollment: Enrollment }[]
  onClose: () => void
  onSaved: () => void
}) {
  // 全員が同じ申請日ならそれを初期値に、ばらばら・未設定なら今日
  const current = new Set(items.map(({ enrollment }) => getApplicationDate(enrollment)))
  const [date, setDate] = useState(current.size === 1 && [...current][0] ? [...current][0] : todayIso())
  const [saving, setSaving] = useState(false)

  const save = async (iso: string) => {
    setSaving(true)
    try {
      await setApplicationDates(items.map(({ enrollment }) => enrollment), iso)
      onSaved()
    } catch (e) {
      alert(`申請日を保存できませんでした。\n${e instanceof Error ? e.message : String(e)}`)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-700">申請日を設定（{items.length}名）</h2>
          <p className="text-xs text-gray-400 mt-1">申請書の「申請日」「申請月日」欄に印字する日付です。</p>
        </div>
        <DateTextInput value={date} onChange={setDate} placeholder="2026/11/16・R8/11/16" />
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => save('')}
            disabled={saving}
            className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40"
          >
            申請日を消す
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>キャンセル</button>
            <button type="button" onClick={() => save(date)} className="btn-primary" disabled={saving || !date}>
              {saving ? '保存中…' : '設定する'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
