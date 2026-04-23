import { useState } from 'react'
import type { PendingReviewWithStudents, Student } from '../types'
import { pendingReviewsApi } from '../lib/api'

interface Props {
  pr: PendingReviewWithStudents
  onClose: () => void
  onResolved: () => void
}

interface FieldRow {
  label: string
  left: string | null
  right: string | null
}

function isDiff(a: string | null, b: string | null) {
  return (a ?? '') !== (b ?? '')
}

function fieldRows(s: Student, c: Student): FieldRow[] {
  return [
    { label: '氏名',         left: `${s.last_name} ${s.first_name}`,         right: `${c.last_name} ${c.first_name}` },
    { label: 'フリガナ',     left: `${s.last_kana ?? ''} ${s.first_kana ?? ''}`.trim() || null, right: `${c.last_kana ?? ''} ${c.first_kana ?? ''}`.trim() || null },
    { label: '生年月日',     left: s.birth_date,    right: c.birth_date },
    { label: '性別',         left: s.gender === 'male' ? '男性' : s.gender === 'female' ? '女性' : s.gender ? 'その他' : null, right: c.gender === 'male' ? '男性' : c.gender === 'female' ? '女性' : c.gender ? 'その他' : null },
    { label: '会員コード',   left: s.student_code,  right: c.student_code },
    { label: '免許番号',     left: s.license_number, right: c.license_number },
    { label: '郵便番号',     left: s.postal_code,   right: c.postal_code },
    { label: '都道府県',     left: s.prefecture,    right: c.prefecture },
    { label: '市区町村',     left: s.city,          right: c.city },
    { label: '番地',         left: s.address1,      right: c.address1 },
    { label: 'マンション等', left: s.address2,      right: c.address2 },
    { label: '電話',         left: s.phone,         right: c.phone },
    { label: '携帯',         left: s.mobile,        right: c.mobile },
    { label: 'メール',       left: s.email,         right: c.email },
    { label: '備考',         left: s.note,          right: c.note },
    { label: '登録日',       left: s.created_at?.slice(0, 10) ?? null, right: c.created_at?.slice(0, 10) ?? null },
  ]
}

export default function PendingReviewDetailModal({ pr, onClose, onResolved }: Props) {
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<'left' | 'right' | null>(null)

  const parseReasons = (raw: string) => {
    try { return JSON.parse(raw) as string[] } catch { return [raw] }
  }

  const handleMerge = async (keepId: number) => {
    setBusy(true)
    try {
      await pendingReviewsApi.merge(pr.id, keepId)
      onResolved()
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  const handleDifferent = async () => {
    setBusy(true)
    try {
      await pendingReviewsApi.resolve(pr.id, 'different')
      onResolved()
    } finally {
      setBusy(false)
    }
  }

  const rows = fieldRows(pr.student, pr.candidate)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">

        {/* ヘッダー */}
        <div className="border-b border-amber-100 px-6 py-4 flex items-center gap-3 bg-amber-50 rounded-t-2xl shrink-0">
          <span className="text-xl">⚠️</span>
          <div className="flex-1">
            <h2 className="text-base font-bold text-amber-700">重複確認 — 詳細比較</h2>
            <div className="flex gap-1.5 mt-1 flex-wrap">
              {parseReasons(pr.match_reasons).map((r) => (
                <span key={r} className="text-[10px] px-2 py-0.5 bg-amber-200 text-amber-700 rounded-full">{r}</span>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {/* テーブル */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {/* 列ヘッダー */}
          <div className="grid grid-cols-[120px_1fr_1fr] gap-0 mb-2 sticky top-0 bg-white pb-2 z-10">
            <div />
            <div className="text-center">
              <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
                新規登録（左）
              </span>
            </div>
            <div className="text-center">
              <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">
                既存会員（右）
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 overflow-hidden">
            {rows.map((row, i) => {
              const diff = isDiff(row.left, row.right)
              return (
                <div
                  key={row.label}
                  className={[
                    'grid grid-cols-[120px_1fr_1fr] divide-x divide-gray-100',
                    i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60',
                    diff ? 'ring-1 ring-inset ring-amber-300' : '',
                  ].join(' ')}
                >
                  <div className="px-3 py-2.5 text-xs text-gray-500 font-medium flex items-center gap-1">
                    {diff && <span className="text-amber-400 text-[10px]">●</span>}
                    {row.label}
                  </div>
                  <div className={`px-3 py-2.5 text-sm ${diff ? 'text-blue-700 font-semibold bg-blue-50/40' : 'text-gray-700'}`}>
                    {row.left ?? <span className="text-gray-300 text-xs">—</span>}
                  </div>
                  <div className={`px-3 py-2.5 text-sm ${diff ? 'text-emerald-700 font-semibold bg-emerald-50/40' : 'text-gray-700'}`}>
                    {row.right ?? <span className="text-gray-300 text-xs">—</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* フッター：アクションボタン */}
        <div className="border-t border-gray-100 px-6 py-4 shrink-0">
          {confirm === null ? (
            <div className="flex gap-3 flex-wrap items-center justify-between">
              <p className="text-xs text-gray-400">どちらかの情報を正として統合するか、別会員として確定してください。</p>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setConfirm('left')}
                  disabled={busy}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition disabled:opacity-40"
                >
                  左（新規）を正として統合
                </button>
                <button
                  onClick={() => setConfirm('right')}
                  disabled={busy}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition disabled:opacity-40"
                >
                  右（既存）を正として統合
                </button>
                <button
                  onClick={handleDifferent}
                  disabled={busy}
                  className="px-4 py-2 bg-white border-2 border-gray-300 hover:border-gray-400 text-gray-600 text-sm font-semibold rounded-xl transition disabled:opacity-40"
                >
                  別会員として確定
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3 items-center justify-end">
              <p className="text-sm text-amber-700 flex-1">
                {confirm === 'left'
                  ? '⚠️ 新規（左）の情報を保持し、既存（右）の記録は削除されます。続けますか？'
                  : '⚠️ 既存（右）の情報を保持し、新規（左）の記録は削除されます。続けますか？'}
              </p>
              <button
                onClick={() => setConfirm(null)}
                disabled={busy}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-500 text-sm rounded-xl hover:bg-gray-50 transition"
              >
                キャンセル
              </button>
              <button
                onClick={() => handleMerge(confirm === 'left' ? pr.student.id : pr.candidate.id)}
                disabled={busy}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl transition disabled:opacity-40"
              >
                {busy ? '処理中…' : '統合を実行'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
