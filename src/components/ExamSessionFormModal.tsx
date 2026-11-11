/**
 * 試験日程の追加／編集フォーム（試験日程管理・申込入力の両方から使う）
 */
import { useEffect, useState } from 'react'
import type { ExamSessionInput } from '../types'
import { examSessionsApi } from '../lib/api'
import { normalizeExamLocation } from '../lib/examLocation'

export { normalizeExamLocation }

const QUAL_TYPES = ['一級', '二級', '特殊', '湖川']

// 試験地の候補（JMRA近畿「試験実施予定一覧表」2026年度2/4期に載っている試験地）。
// 登録済みの試験日程にある試験地も自動で候補に加わる
const DEFAULT_EXAM_LOCATIONS = [
  '滋賀県彦根市', '滋賀県大津市（浜大津）', '滋賀県大津市（下阪本）', '滋賀県大津市（今堅田）', '滋賀県守山市',
  '大阪府大阪市', '大阪府高石市', '大阪府門真市',
  '兵庫県西宮市', '兵庫県西宮市（今津西浜町）', '兵庫県神戸市', '兵庫県姫路市', '兵庫県たつの市',
  '京都府舞鶴市', '和歌山県和歌山市', '福井県坂井市', '福井県三方郡美浜町', '岡山県岡山市',
]


export function makeEmptyExamSession(): ExamSessionInput {
  return { exam_date: '', exam_location: '', qualification_type: '二級', exam_id: '', exam_type: '学科+実技', gakka_venue: '', jitsugi_venue: '' }
}

// ── 追加/編集フォームモーダル ─────────────────────────────────

interface FormModalProps {
  initial: ExamSessionInput
  editId: number | null
  onSave: (input: ExamSessionInput) => Promise<void>
  onCancel: () => void
}

export default function ExamSessionFormModal({ initial, editId, onSave, onCancel }: FormModalProps) {
  const [form, setForm] = useState<ExamSessionInput>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [locationOptions, setLocationOptions] = useState<string[]>(DEFAULT_EXAM_LOCATIONS)

  // 候補＝既定の試験地＋登録済みの試験地（重複なし・都道府県順）
  useEffect(() => {
    examSessionsApi.list()
      .then(list => {
        const all = new Set([...DEFAULT_EXAM_LOCATIONS, ...list.map(s => normalizeExamLocation(s.exam_location)).filter(Boolean)])
        setLocationOptions([...all].sort((a, b) => a.localeCompare(b, 'ja')))
      })
      .catch(() => {})
  }, [])

  const set = <K extends keyof ExamSessionInput>(k: K, v: ExamSessionInput[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.exam_date) { setError('試験日を入力してください'); return }
    const location = normalizeExamLocation(form.exam_location)
    if (!location) { setError('試験地を入力してください'); return }
    if (!form.exam_id.trim()) { setError('試験IDを入力してください'); return }
    setSaving(true)
    try {
      await onSave({ ...form, exam_location: location })
    } catch {
      setError('保存に失敗しました')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-lavender-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-700">
            {editId ? '試験日程を編集' : '試験日程を追加'}
          </h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div>
            <label className="block text-xs text-gray-500 mb-1">試験日</label>
            <input
              type="date"
              value={form.exam_date}
              onChange={e => set('exam_date', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-lavender-400"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              試験地
              <span className="ml-2 note-text">候補から選ぶか、新しい試験地を入力</span>
            </label>
            <input
              type="text"
              list="exam-location-options"
              value={form.exam_location}
              onChange={e => set('exam_location', e.target.value)}
              onBlur={e => set('exam_location', normalizeExamLocation(e.target.value))}
              placeholder="クリックで候補を表示／例：大阪府大阪市"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-lavender-400"
              required
            />
            <datalist id="exam-location-options">
              {locationOptions.map(l => <option key={l} value={l} />)}
            </datalist>
          </div>

          {/* 学科・実技の試験会場は入力しない（Excel取り込みで入った値は編集時もそのまま保持） */}

          <div>
            <label className="block text-xs text-gray-500 mb-1">資格種別</label>
            <div className="flex gap-2">
              {QUAL_TYPES.map(q => (
                <button
                  key={q}
                  type="button"
                  onClick={() => set('qualification_type', q)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition ${
                    form.qualification_type === q
                      ? 'bg-lavender-400 text-white border-lavender-400'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-lavender-300'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">試験ID</label>
            <input
              type="text"
              value={form.exam_id}
              onChange={e => set('exam_id', e.target.value)}
              placeholder="例：2025-A-001"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-lavender-400"
              required
            />
          </div>

          {/* 試験区分は入力しない（日程は「学科+実技」として登録。誰がどちらを受けるかは申込側で選ぶ） */}

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
