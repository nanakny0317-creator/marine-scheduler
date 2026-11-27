import { useState } from 'react'
import type { Enrollment, Student } from '../../types'
import CalendarDateInput from '../CalendarDateInput'
import { formatApplicationDate, getApplicationDate, setApplicationDates, type AppDateKind } from '../../lib/applicationDate'

function todayIso(): string {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

/** 選んだ受講者の申請日（申請書に印字する日付）をまとめて設定する */
export default function ApplicationDateModal({ items, onClose, onSaved, kind = 'application', suggested }: {
  items: { student: Student; enrollment: Enrollment }[]
  onClose: () => void
  onSaved: () => void
  /** どの申請日か（既定は試験・更新などの申請書の申請日。'license' は免許申請書の申請月日） */
  kind?: AppDateKind
  /** 未設定のときの初期値と「候補」ボタン（例：免許申請は合格発表日） */
  suggested?: { iso: string; label: string }
}) {
  // 全員が同じ申請日ならそれを初期値に、ばらばら・未設定なら候補の日（なければ今日）
  const current = new Set(items.map(({ enrollment }) => getApplicationDate(enrollment, kind)))
  const [date, setDate] = useState(current.size === 1 && [...current][0] ? [...current][0] : suggested?.iso || todayIso())
  const [saving, setSaving] = useState(false)

  const save = async (iso: string) => {
    setSaving(true)
    try {
      await setApplicationDates(items.map(({ enrollment }) => enrollment), iso, kind)
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
          <h2 className="text-base font-semibold text-gray-700">{kind === 'license' ? '免許申請の申請日' : '申請日'}を設定（{items.length}名）</h2>
          <p className="text-xs text-gray-400 mt-1">{kind === 'license' ? '免許申請書の「申請月日」欄に印字する日付です。' : '申請書の「申請日」「申請月日」欄に印字する日付です。'}</p>
        </div>
        <CalendarDateInput value={date} onChange={setDate} autoFocus />
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <button type="button" onClick={() => setDate(todayIso())} className="btn-secondary btn-sm">今日</button>
          {suggested?.iso && (
            <button type="button" onClick={() => setDate(suggested.iso)} className="btn-secondary btn-sm">{suggested.label}（{formatApplicationDate(suggested.iso)}）</button>
          )}
        </div>
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
