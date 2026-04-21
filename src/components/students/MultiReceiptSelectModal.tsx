import { useState } from 'react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { SessionGroup, SessionItem } from '../../contexts/SessionContext'
import { sessionKey } from '../../contexts/SessionContext'

interface Props {
  sessions: SessionGroup[]
  onConfirm: (items: SessionItem[]) => void
  onClose: () => void
}

function formatDate(d: string | null) {
  if (!d) return '日時未定'
  try { return format(new Date(d), 'yyyy年M月d日(E)', { locale: ja }) } catch { return d }
}

export default function MultiReceiptSelectModal({ sessions, onConfirm, onClose }: Props) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())

  const toggleSession = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedKeys.size === sessions.length) {
      setSelectedKeys(new Set())
    } else {
      setSelectedKeys(new Set(sessions.map(sessionKey)))
    }
  }

  const selectedItems = sessions
    .filter(s => selectedKeys.has(sessionKey(s)))
    .flatMap(s => s.items)

  const totalStudents = selectedItems.length
  const totalPages = Math.ceil(totalStudents / 10) || 0
  const allSelected = sessions.length > 0 && selectedKeys.size === sessions.length

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* ヘッダー */}
        <div className="sticky top-0 bg-white border-b border-lavender-100 px-6 py-4 flex items-center justify-between rounded-t-2xl shrink-0">
          <h2 className="text-base font-semibold text-gray-700">受領書印刷 — 日程選択</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {/* ボディ */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          <p className="text-xs text-gray-400 mb-3">印刷したい日程にチェックを入れてください。10名を超える場合は自動で2枚目に分かれます。</p>

          {/* 全選択 */}
          <label className="flex items-center gap-3 px-4 py-2 rounded-lg cursor-pointer select-none text-xs text-gray-500 hover:bg-gray-50">
            <input
              type="checkbox"
              checked={allSelected}
              ref={el => { if (el) el.indeterminate = selectedKeys.size > 0 && !allSelected }}
              onChange={toggleAll}
              className="w-4 h-4 accent-lavender-500"
            />
            すべて選択
          </label>

          <div className="border-t border-lavender-50 pt-2 space-y-1.5">
            {sessions.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">表示できる日程がありません</p>
            ) : (
              sessions.map(session => {
                const key = sessionKey(session)
                const checked = selectedKeys.has(key)
                return (
                  <label
                    key={key}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition select-none ${
                      checked
                        ? 'border-lavender-300 bg-lavender-50'
                        : 'border-lavender-100 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSession(key)}
                      className="w-4 h-4 accent-lavender-500 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700">{formatDate(session.course_date)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {session.course_time && <span className="mr-2">🕐 {session.course_time}</span>}
                        {session.venue && <span>📍 {session.venue}</span>}
                      </p>
                    </div>
                    <span className="text-xs text-lavender-500 font-semibold shrink-0 bg-lavender-50 border border-lavender-200 rounded-full px-2 py-0.5">
                      {session.items.length}名
                    </span>
                  </label>
                )
              })
            )}
          </div>
        </div>

        {/* フッター */}
        <div className="shrink-0 px-6 py-4 border-t border-lavender-100 flex items-center justify-between gap-2">
          <span className="text-sm text-gray-500">
            {totalStudents > 0
              ? <>{totalStudents}名 <span className="text-gray-400">/ {totalPages}枚</span></>
              : <span className="text-gray-400">日程を選択してください</span>
            }
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">キャンセル</button>
            <button
              type="button"
              onClick={() => onConfirm(selectedItems)}
              disabled={totalStudents === 0}
              className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              印刷に進む
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
