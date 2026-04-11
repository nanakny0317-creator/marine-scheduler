import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Venue, VenueInput } from '../types'
import { venuesApi } from '../lib/api'

// 地域の表示順
const REGION_ORDER = ['近畿', '中部']

function sortedRegions(regions: string[]): string[] {
  return [...regions].sort((a, b) => {
    const ia = REGION_ORDER.indexOf(a)
    const ib = REGION_ORDER.indexOf(b)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a.localeCompare(b)
  })
}

// 都道府県の表示順（地域ごと）
const PREF_ORDER: Record<string, string[]> = {
  '近畿': ['滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県'],
  '中部': ['山梨県', '新潟県', '富山県', '石川県', '長野県', '福井県', '岐阜県', '静岡県', '愛知県'],
}

function sortedPrefs(venues: Venue[], region: string): string[] {
  const order = PREF_ORDER[region] ?? []
  const prefs = Array.from(new Set(venues.map((v) => v.prefecture)))
  return prefs.sort((a, b) => {
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a.localeCompare(b)
  })
}

// ── 追加/編集モーダル ───────────────────────────────────────────

function makeEmpty(region: string): VenueInput {
  return { region, prefecture: '', city: null, name: '', sort_order: 0, active: true }
}

interface FormModalProps {
  initial: VenueInput
  editId: number | null
  regions: string[]
  onSave: (input: VenueInput) => Promise<void>
  onCancel: () => void
}

function VenueFormModal({ initial, editId, regions, onSave, onCancel }: FormModalProps) {
  const [form, setForm] = useState<VenueInput>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = <K extends keyof VenueInput>(k: K, v: VenueInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.region.trim())     { setError('地域を選択してください'); return }
    if (!form.prefecture.trim()) { setError('都道府県を入力してください'); return }
    if (!form.name.trim())       { setError('会場名を入力してください'); return }
    setSaving(true)
    try {
      await onSave(form)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-lavender-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-700">
            {editId ? '会場を編集' : '会場を追加'}
          </h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-xl leading-none" tabIndex={-1}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">地域<span className="text-red-400 ml-0.5">*</span></label>
              <select
                value={form.region}
                onChange={(e) => set('region', e.target.value)}
                className="field-select"
                autoFocus
              >
                <option value="">選択</option>
                {regions.map((r) => <option key={r} value={r}>{r}</option>)}
                <option value="__new__">新しい地域を追加…</option>
              </select>
              {form.region === '__new__' && (
                <input
                  type="text"
                  placeholder="地域名を入力"
                  className="field-input mt-1"
                  onChange={(e) => set('region', e.target.value)}
                  autoFocus
                />
              )}
            </div>
            <div>
              <label className="field-label">都道府県<span className="text-red-400 ml-0.5">*</span></label>
              <input
                type="text"
                value={form.prefecture}
                onChange={(e) => set('prefecture', e.target.value)}
                placeholder="例：大阪府"
                className="field-input"
              />
            </div>
          </div>

          <div>
            <label className="field-label">市区町村</label>
            <input
              type="text"
              value={form.city ?? ''}
              onChange={(e) => set('city', e.target.value || null)}
              placeholder="例：大阪市北区"
              className="field-input"
            />
          </div>

          <div>
            <label className="field-label">会場名<span className="text-red-400 ml-0.5">*</span></label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="例：テクスピア大阪"
              className="field-input"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">表示順</label>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => set('sort_order', Number(e.target.value))}
                min={0}
                step={10}
                className="field-input"
              />
            </div>
            <div className="flex flex-col justify-end pb-0.5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <span
                  onClick={() => set('active', !form.active)}
                  className={[
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    form.active ? 'bg-lavender-400' : 'bg-gray-200',
                  ].join(' ')}
                >
                  <span className={[
                    'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                    form.active ? 'translate-x-6' : 'translate-x-1',
                  ].join(' ')} />
                </span>
                <span className={`text-sm font-medium ${form.active ? 'text-lavender-600' : 'text-gray-400'}`}>
                  {form.active ? '有効' : '無効'}
                </span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-lavender-100">
            <button type="button" onClick={onCancel} className="btn-secondary">キャンセル</button>
            <button type="submit" disabled={saving} className="btn-primary min-w-[80px]">
              {saving ? '保存中…' : editId ? '更新する' : '追加する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── ページ本体 ─────────────────────────────────────────────────

export default function VenueSettingsPage() {
  const navigate = useNavigate()
  const [venues, setVenues]           = useState<Venue[]>([])
  const [regions, setRegions]         = useState<string[]>([])
  const [activeRegion, setActiveRegion] = useState<string>('近畿')
  const [loading, setLoading]         = useState(true)
  const [showAll, setShowAll]         = useState(false)
  const [modalOpen, setModalOpen]     = useState(false)
  const [editTarget, setEditTarget]   = useState<Venue | null>(null)

  // 地域一覧を取得（初回のみ）
  useEffect(() => {
    venuesApi.regions().then((r) => {
      const sorted = sortedRegions(r)
      setRegions(sorted)
      if (sorted.length > 0 && !sorted.includes(activeRegion)) setActiveRegion(sorted[0])
    })
  }, [])

  const load = async (region = activeRegion, all = showAll) => {
    setLoading(true)
    const data = await venuesApi.list(!all, region)
    setVenues(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [activeRegion, showAll])

  const handleSave = async (input: VenueInput) => {
    if (editTarget) {
      await venuesApi.update(editTarget.id, input)
    } else {
      await venuesApi.create(input)
    }
    setModalOpen(false)
    setEditTarget(null)
    // 地域リストを再取得（新規地域追加の場合があるため）
    const updatedRegions = sortedRegions(await venuesApi.regions())
    setRegions(updatedRegions)
    if (input.region && input.region !== '__new__') setActiveRegion(input.region)
    load(input.region && input.region !== '__new__' ? input.region : activeRegion)
  }

  const handleDelete = async (v: Venue) => {
    if (!window.confirm(`「${v.name}」を削除しますか？\n過去の申込データには影響しません。`)) return
    await venuesApi.delete(v.id)
    load()
  }

  const openAdd  = () => { setEditTarget(null); setModalOpen(true) }
  const openEdit = (v: Venue) => { setEditTarget(v); setModalOpen(true) }

  const prefs = sortedPrefs(venues, activeRegion)
  const total = venues.length

  return (
    <div className="min-h-screen bg-gradient-to-br from-lavender-50 via-white to-mint-50 flex flex-col">

      {/* ヘッダー */}
      <header className="bg-white/80 backdrop-blur border-b border-lavender-100 px-6 py-4 flex items-center gap-4 shrink-0">
        <button
          onClick={() => navigate('/')}
          className="text-lavender-500 hover:text-lavender-700 text-sm font-medium flex items-center gap-1.5 transition"
        >
          ← ホームへ戻る
        </button>
        <span className="text-lavender-200">|</span>
        <h1 className="text-base font-bold text-gray-700">🏛️ 会場マスター管理</h1>
        <span className="text-xs text-gray-400 ml-1">（MRA 更新・失効再交付講習）</span>
      </header>

      {/* 地域タブ */}
      <div className="bg-white border-b border-lavender-100 px-6">
        <div className="flex gap-1 max-w-3xl mx-auto">
          {regions.map((r) => (
            <button
              key={r}
              onClick={() => setActiveRegion(r)}
              className={[
                'px-5 py-3 text-sm font-semibold border-b-2 transition',
                activeRegion === r
                  ? 'border-lavender-400 text-lavender-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600',
              ].join(' ')}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* コンテンツ */}
      <main className="flex-1 px-6 py-6 max-w-3xl w-full mx-auto">

        {/* ツールバー */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showAll}
                onChange={() => setShowAll((v) => !v)}
                className="rounded text-lavender-400"
              />
              無効会場も表示
            </label>
            <span className="text-xs text-gray-300">{total} 件</span>
          </div>
          <button onClick={openAdd} className="btn-primary text-sm">
            ＋ 会場を追加
          </button>
        </div>

        {/* 会場リスト */}
        {loading ? (
          <p className="text-center text-gray-400 py-16">読み込み中…</p>
        ) : venues.length === 0 ? (
          <p className="text-center text-gray-400 py-16">会場データがありません</p>
        ) : (
          <div className="space-y-5">
            {prefs.map((pref) => {
              const prefVenues = venues.filter((v) => v.prefecture === pref)
              return (
                <section key={pref}>
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="text-xs font-bold text-lavender-500 uppercase tracking-widest">{pref}</h2>
                    <span className="text-xs text-gray-300">{prefVenues.length}会場</span>
                  </div>
                  <div className="bg-white rounded-xl border border-lavender-100 overflow-hidden shadow-sm">
                    {prefVenues.map((v, i) => (
                      <div
                        key={v.id}
                        className={[
                          'flex items-center gap-3 px-4 py-3',
                          i > 0 ? 'border-t border-gray-50' : '',
                          !v.active ? 'opacity-40' : '',
                        ].join(' ')}
                      >
                        <span className={[
                          'shrink-0 w-1.5 h-1.5 rounded-full',
                          v.active ? 'bg-mint-400' : 'bg-gray-300',
                        ].join(' ')} />

                        <div className="flex-1 min-w-0">
                          <span className={`text-sm ${v.active ? 'text-gray-700' : 'text-gray-400'}`}>
                            {v.name}
                          </span>
                          {v.city && (
                            <span className="ml-2 text-xs text-gray-400">{v.city}</span>
                          )}
                        </div>

                        <span className="text-xs text-gray-300 shrink-0 w-10 text-right font-mono">
                          {v.sort_order}
                        </span>

                        {!v.active && (
                          <span className="text-[10px] bg-gray-100 text-gray-400 rounded px-1.5 py-0.5 shrink-0">
                            無効
                          </span>
                        )}

                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => openEdit(v)} className="btn-secondary btn-sm">編集</button>
                          <button onClick={() => handleDelete(v)} className="btn-danger btn-sm">削除</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </main>

      {/* モーダル */}
      {modalOpen && (
        <VenueFormModal
          initial={editTarget
            ? { region: editTarget.region, prefecture: editTarget.prefecture, city: editTarget.city, name: editTarget.name, sort_order: editTarget.sort_order, active: editTarget.active }
            : makeEmpty(activeRegion)
          }
          editId={editTarget?.id ?? null}
          regions={regions}
          onSave={handleSave}
          onCancel={() => { setModalOpen(false); setEditTarget(null) }}
        />
      )}
    </div>
  )
}
