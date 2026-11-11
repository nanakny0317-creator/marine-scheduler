import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { RenewalSession, RenewalSessionInput } from '../types'
import { renewalSessionsApi } from '../lib/api'
import VenueSelect from '../components/VenueSelect'

function fmtDate(d: string) {
  try { return format(new Date(d), 'yyyy年M月d日(E)', { locale: ja }) } catch { return d }
}

function makeEmpty(): RenewalSessionInput {
  return { course_date: '', location: '', start_time: '', note: null }
}

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-lavender-400'

// ── 追加/編集フォームモーダル ─────────────────────────────────

interface FormModalProps {
  initial: RenewalSessionInput
  editId: number | null
  onSave: (input: RenewalSessionInput) => Promise<void>
  onCancel: () => void
}

function RenewalSessionFormModal({ initial, editId, onSave, onCancel }: FormModalProps) {
  const [form, setForm] = useState<RenewalSessionInput>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = <K extends keyof RenewalSessionInput>(k: K, v: RenewalSessionInput[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.course_date) { setError('講習日を入力してください'); return }
    setSaving(true)
    try {
      await onSave({
        course_date: form.course_date,
        location:    form.location.trim(),
        start_time:  form.start_time.trim(),
        note:        form.note?.trim() || null,
      })
    } catch {
      setError('保存に失敗しました')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-lavender-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-700">
            {editId ? '更新講習日程を編集' : '更新講習日程を追加'}
          </h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">講習日</label>
              <input type="date" value={form.course_date} onChange={e => set('course_date', e.target.value)} className={inputCls} required />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">開始時間</label>
              <input type="text" value={form.start_time} onChange={e => set('start_time', e.target.value)} placeholder="14:00" className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">講習地</label>
            <VenueSelect value={form.location} onChange={v => set('location', v)} className={inputCls} />
            <p className="text-[12px] text-gray-400 mt-1">候補にない会場は「会場・日程の設定」→「更新講習会場」で追加できます</p>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">メモ</label>
            <input type="text" value={form.note ?? ''} onChange={e => set('note', e.target.value)} placeholder="任意" className={inputCls} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onCancel} className="flex-1 btn-secondary">キャンセル</button>
            <button type="submit" disabled={saving} className="flex-1 btn-primary disabled:opacity-40">
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── メインページ ───────────────────────────────────────────────

export default function RenewalSessionsPage() {
  const navigate = useNavigate()

  const [sessions, setSessions] = useState<RenewalSession[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<RenewalSession | null>(null)
  const [showPast, setShowPast] = useState(false)

  const load = () => {
    setLoading(true)
    renewalSessionsApi.list().then(s => { setSessions(s); setLoading(false) }).catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleSave = async (input: RenewalSessionInput) => {
    if (editTarget) {
      await renewalSessionsApi.update(editTarget.id, input)
    } else {
      await renewalSessionsApi.create(input)
    }
    setFormOpen(false)
    setEditTarget(null)
    load()
  }

  const handleDelete = async (s: RenewalSession) => {
    if (!window.confirm(`更新講習日程「${fmtDate(s.course_date)} ${s.location}」を削除しますか？`)) return
    await renewalSessionsApi.delete(s.id)
    load()
  }

  const today = format(new Date(), 'yyyy-MM-dd')
  const pastCount = sessions.filter(s => s.course_date < today).length
  const visible = showPast ? sessions : sessions.filter(s => s.course_date >= today)

  return (
    <div className="min-h-screen bg-gradient-to-br from-lavender-50 via-white to-mint-50 py-10 px-6">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* ヘッダー */}
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/settings')} className="text-gray-400 hover:text-gray-600 text-sm">← 戻る</button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-700">更新講習日程管理</h1>
            <p className="text-xs text-gray-400 mt-0.5">登録した日程は申込画面のプルダウンから選択できます</p>
          </div>
          <button
            onClick={() => { setEditTarget(null); setFormOpen(true) }}
            className="btn-primary flex items-center gap-1.5"
          >
            <span>＋</span> 日程を追加
          </button>
        </div>

        {pastCount > 0 && (
          <label className="flex items-center gap-2 text-xs text-gray-500">
            <input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} />
            過去の日程も表示（{pastCount} 件）
          </label>
        )}

        {/* 一覧 */}
        <div className="bg-white rounded-2xl border border-lavender-100 overflow-hidden shadow-sm">
          {loading ? (
            <p className="text-center text-gray-400 text-sm py-16">読み込み中…</p>
          ) : visible.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-400 text-sm">登録された更新講習日程がありません</p>
              <p className="text-gray-300 text-xs mt-2">「日程を追加」で登録してください</p>
            </div>
          ) : (
            visible.map(s => (
              <div
                key={s.id}
                className={`px-5 py-3 flex items-center gap-4 border-b border-gray-50 last:border-0 hover:bg-lavender-50/40 transition ${s.course_date < today ? 'opacity-50' : ''}`}
              >
                <span className="w-40 shrink-0 text-sm font-semibold text-lavender-700">{fmtDate(s.course_date)}</span>
                <span className="w-14 shrink-0 font-mono text-sm text-gray-600">{s.start_time || '—'}</span>
                <span className="text-sm text-gray-700 flex-1">
                  {s.location || '—'}
                  {s.note && <span className="ml-2 text-xs text-gray-400">{s.note}</span>}
                </span>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => { setEditTarget(s); setFormOpen(true) }} className="btn-secondary btn-sm">編集</button>
                  <button onClick={() => handleDelete(s)} className="btn-danger btn-sm">削除</button>
                </div>
              </div>
            ))
          )}
        </div>

        <p className="text-xs text-gray-400 text-right">合計 {sessions.length} 件</p>
      </div>

      {formOpen && (
        <RenewalSessionFormModal
          initial={editTarget
            ? { course_date: editTarget.course_date, location: editTarget.location, start_time: editTarget.start_time, note: editTarget.note }
            : makeEmpty()
          }
          editId={editTarget?.id ?? null}
          onSave={handleSave}
          onCancel={() => { setFormOpen(false); setEditTarget(null) }}
        />
      )}
    </div>
  )
}
