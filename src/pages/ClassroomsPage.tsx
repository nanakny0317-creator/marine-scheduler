import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Classroom } from '../types'
import { classroomsApi } from '../lib/api'

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-lavender-400'

export default function ClassroomsPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Classroom[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<number | null>(null)   // null=新規入力欄
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    classroomsApi.list().then(c => { setItems(c); setLoading(false) }).catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const reset = () => { setEditId(null); setName(''); setNote(''); setError('') }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) { setError('会場名を入力してください'); return }
    if (items.some(c => c.name === n && c.id !== editId)) { setError('同じ名前の会場が登録済みです'); return }
    try {
      if (editId != null) {
        const cur = items.find(c => c.id === editId)
        await classroomsApi.update(editId, { name: n, note: note.trim() || null, sort_order: cur?.sort_order ?? 0 })
      } else {
        const maxOrder = items.reduce((m, c) => Math.max(m, c.sort_order), 0)
        await classroomsApi.create({ name: n, note: note.trim() || null, sort_order: maxOrder + 10 })
      }
      reset()
      load()
    } catch {
      setError('保存に失敗しました')
    }
  }

  const handleDelete = async (c: Classroom) => {
    if (!window.confirm(`授業会場「${c.name}」を削除しますか？\n（登録済みの申込に入っている会場名は消えません）`)) return
    await classroomsApi.delete(c.id)
    if (editId === c.id) reset()
    load()
  }

  // 並び替え：隣と sort_order を入れ替える
  const move = async (idx: number, dir: -1 | 1) => {
    const a = items[idx], b = items[idx + dir]
    if (!a || !b) return
    const ao = a.sort_order === b.sort_order ? a.sort_order + dir : b.sort_order
    await classroomsApi.update(a.id, { name: a.name, note: a.note, sort_order: ao })
    await classroomsApi.update(b.id, { name: b.name, note: b.note, sort_order: a.sort_order })
    load()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-lavender-50 via-white to-mint-50 py-10 px-6">
      <div className="max-w-2xl mx-auto space-y-6">

        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/settings')} className="text-gray-400 hover:text-gray-600 text-sm">← 戻る</button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-700">授業会場管理</h1>
            <p className="text-xs text-gray-400 mt-0.5">試験申請の「講習日程」で選べる教室を登録します（上から順に表示）</p>
          </div>
        </div>

        {/* 入力欄 */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-lavender-100 shadow-sm p-4 space-y-3">
          {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">会場名</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="例：本校 2F教室" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">メモ（住所など・任意）</label>
              <input type="text" value={note} onChange={e => setNote(e.target.value)} className={inputCls} />
            </div>
            <div className="flex gap-2">
              {editId != null && <button type="button" onClick={reset} className="btn-secondary">取消</button>}
              <button type="submit" className="btn-primary">{editId != null ? '更新' : '＋ 追加'}</button>
            </div>
          </div>
        </form>

        {/* 一覧 */}
        <div className="bg-white rounded-2xl border border-lavender-100 overflow-hidden shadow-sm">
          {loading ? (
            <p className="text-center text-gray-400 text-sm py-16">読み込み中…</p>
          ) : items.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-16">登録された授業会場がありません</p>
          ) : (
            items.map((c, i) => (
              <div key={c.id} className={`px-5 py-3 flex items-center gap-3 border-b border-gray-50 last:border-0 ${editId === c.id ? 'bg-lavender-50' : 'hover:bg-lavender-50/40'}`}>
                <div className="flex flex-col shrink-0">
                  <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="text-xs text-gray-400 hover:text-lavender-600 disabled:opacity-20 leading-none">▲</button>
                  <button type="button" disabled={i === items.length - 1} onClick={() => move(i, 1)} className="text-xs text-gray-400 hover:text-lavender-600 disabled:opacity-20 leading-none">▼</button>
                </div>
                <span className="text-sm text-gray-700 flex-1">
                  {c.name}
                  {c.note && <span className="ml-2 text-xs text-gray-400">{c.note}</span>}
                </span>
                <button onClick={() => { setEditId(c.id); setName(c.name); setNote(c.note ?? ''); setError('') }} className="btn-secondary btn-sm">編集</button>
                <button onClick={() => handleDelete(c)} className="btn-danger btn-sm">削除</button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
