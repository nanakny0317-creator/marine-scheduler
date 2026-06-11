import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import * as XLSX from 'xlsx'
import type { ExamSession, ExamSessionInput } from '../types'
import { examSessionsApi } from '../lib/api'

const QUAL_TYPES = ['一級', '二級', '特殊']

function fmtDate(d: string) {
  try { return format(new Date(d), 'yyyy年M月d日(E)', { locale: ja }) } catch { return d }
}

function makeEmpty(): ExamSessionInput {
  return { exam_date: '', exam_location: '', qualification_type: '二級', exam_id: '' }
}

// ── 追加/編集フォームモーダル ─────────────────────────────────

interface FormModalProps {
  initial: ExamSessionInput
  editId: number | null
  onSave: (input: ExamSessionInput) => Promise<void>
  onCancel: () => void
}

function ExamSessionFormModal({ initial, editId, onSave, onCancel }: FormModalProps) {
  const [form, setForm] = useState<ExamSessionInput>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = <K extends keyof ExamSessionInput>(k: K, v: ExamSessionInput[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.exam_date) { setError('試験日を入力してください'); return }
    if (!form.exam_location.trim()) { setError('試験地を入力してください'); return }
    if (!form.exam_id.trim()) { setError('試験IDを入力してください'); return }
    setSaving(true)
    try {
      await onSave(form)
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
            <label className="block text-xs text-gray-500 mb-1">試験地</label>
            <input
              type="text"
              value={form.exam_location}
              onChange={e => set('exam_location', e.target.value)}
              placeholder="例：大阪"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-lavender-400"
              required
            />
          </div>

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

// ── Excel プレビューモーダル ───────────────────────────────────

interface ImportPreviewModalProps {
  rows: ExamSessionInput[]
  onConfirm: () => Promise<void>
  onCancel: () => void
}

function ImportPreviewModal({ rows, onConfirm, onCancel }: ImportPreviewModalProps) {
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    setSaving(true)
    await onConfirm()
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="px-6 py-4 border-b border-lavender-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-700">インポートプレビュー</h2>
            <p className="text-xs text-gray-400 mt-0.5">{rows.length} 件を読み込みました。内容を確認して取り込んでください。</p>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-lavender-50 text-xs text-gray-500">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">試験日</th>
                <th className="text-left px-4 py-2.5 font-medium">試験地</th>
                <th className="text-left px-4 py-2.5 font-medium">資格種別</th>
                <th className="text-left px-4 py-2.5 font-medium">試験ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-lavender-50/40">
                  <td className="px-4 py-2.5 text-gray-700">{r.exam_date ? fmtDate(r.exam_date) : '—'}</td>
                  <td className="px-4 py-2.5 text-gray-700">{r.exam_location || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 rounded bg-lavender-50 text-lavender-600 text-xs font-medium border border-lavender-100">
                      {r.qualification_type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-gray-600">{r.exam_id || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="shrink-0 px-6 py-4 border-t border-lavender-100 flex items-center gap-3 bg-gray-50 rounded-b-2xl">
          <p className="flex-1 text-xs text-gray-400">
            同じ「試験日・試験地・資格種別」の組み合わせがある場合は試験IDを上書き更新します。
          </p>
          <button type="button" onClick={onCancel} className="btn-secondary btn-sm">キャンセル</button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || rows.length === 0}
            className="btn-primary btn-sm disabled:opacity-40"
          >
            {saving ? '取込中…' : `${rows.length} 件を取込む`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── メインページ ───────────────────────────────────────────────

export default function ExamSessionsPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [sessions, setSessions] = useState<ExamSession[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ExamSession | null>(null)
  const [previewRows, setPreviewRows] = useState<ExamSessionInput[] | null>(null)
  const [importResult, setImportResult] = useState<{ inserted: number; updated: number } | null>(null)

  const load = () => {
    setLoading(true)
    examSessionsApi.list().then(s => { setSessions(s); setLoading(false) }).catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Excel ファイル読み込み
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array', raw: true })

    // Excelシリアル値 → YYYY-MM-DD（UTC補正）
    const serialToDate = (n: number): string => {
      const d = new Date(Math.round((n - 25569) * 86400 * 1000))
      return format(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), 'yyyy-MM-dd')
    }

    // 記号のみ（◆◇◎★等）かどうか
    const isSymbol = (s: unknown): boolean =>
      !s || /^[◆◇◎★■□▲△●○※＊＋×\s]+$/.test(String(s).trim())

    const parsed: ExamSessionInput[] = []

    // 全シートを処理（一二級 + 特殊）
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true })

      let currentDate = ''
      let currentLocation = ''

      for (let i = 5; i < rows.length; i++) {
        const row = rows[i]
        if (!Array.isArray(row) || row.length < 4) continue

        const colA = row[0], colB = row[1], colC = row[2], colD = row[3]

        // A列が40000超の数値 → Excelシリアル日付
        if (typeof colA === 'number' && colA > 40000) {
          currentDate = serialToDate(colA)
        }

        // B列が実在する地名（記号でない）なら更新
        if (colB && !isSymbol(colB)) {
          currentLocation = String(colB).trim()
        }

        const qual = colC ? String(colC).trim() : ''
        if (!['一級', '二級', '特殊'].includes(qual)) continue
        if (!currentDate || !currentLocation) continue

        // D列：数値なら6桁ゼロ埋め、文字列ならそのまま
        const rawId = colD
        let examId = ''
        if (typeof rawId === 'number' && rawId > 0) {
          examId = String(Math.floor(rawId)).padStart(6, '0')
        } else if (rawId) {
          examId = String(rawId).trim()
        }
        if (!examId) continue

        parsed.push({
          exam_date: currentDate,
          exam_location: currentLocation,
          qualification_type: qual,
          exam_id: examId,
        })
      }
    }

    if (parsed.length > 0) {
      setPreviewRows(parsed)
    } else {
      alert('有効なデータが見つかりませんでした。\nJMRAの試験実施予定一覧表（.xls/.xlsx）を選択してください。')
    }
  }

  const handleImportConfirm = async () => {
    if (!previewRows) return
    const result = await examSessionsApi.upsert(previewRows)
    setImportResult(result)
    setPreviewRows(null)
    load()
  }

  const handleSave = async (input: ExamSessionInput) => {
    if (editTarget) {
      await examSessionsApi.update(editTarget.id, input)
    } else {
      await examSessionsApi.create(input)
    }
    setFormOpen(false)
    setEditTarget(null)
    load()
  }

  const handleDelete = async (s: ExamSession) => {
    if (!window.confirm(`試験日程「${fmtDate(s.exam_date)} ${s.exam_location} ${s.qualification_type}」を削除しますか？`)) return
    await examSessionsApi.delete(s.id)
    load()
  }

  // 日付でグルーピング
  const grouped = sessions.reduce<Record<string, ExamSession[]>>((acc, s) => {
    (acc[s.exam_date] ??= []).push(s)
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-gradient-to-br from-lavender-50 via-white to-mint-50 py-10 px-6">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* ヘッダー */}
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600 text-sm">← 戻る</button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-700">試験日程管理</h1>
            <p className="text-xs text-gray-400 mt-0.5">試験IDの事前登録・Excelインポート</p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary flex items-center gap-1.5"
          >
            <span>📂</span> Excelインポート
          </button>
          <button
            onClick={() => { setEditTarget(null); setFormOpen(true) }}
            className="btn-primary flex items-center gap-1.5"
          >
            <span>＋</span> 手動追加
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xls,.xlsx"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* インポート結果バナー */}
        {importResult && (
          <div className="bg-mint-50 border border-mint-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-mint-600 font-bold text-sm">
              取込完了：{importResult.inserted} 件追加 / {importResult.updated} 件更新
            </span>
            <button onClick={() => setImportResult(null)} className="ml-auto text-gray-400 hover:text-gray-600 text-sm">✕</button>
          </div>
        )}

        {/* 一覧 */}
        <div className="bg-white rounded-2xl border border-lavender-100 overflow-hidden shadow-sm">
          {loading ? (
            <p className="text-center text-gray-400 text-sm py-16">読み込み中…</p>
          ) : sessions.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-400 text-sm">登録された試験日程がありません</p>
              <p className="text-gray-300 text-xs mt-2">「Excelインポート」または「手動追加」で登録してください</p>
            </div>
          ) : (
            Object.entries(grouped)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([date, items]) => (
                <div key={date}>
                  <div className="px-5 py-2.5 bg-lavender-50 border-b border-lavender-100 flex items-center gap-2">
                    <span className="text-sm font-semibold text-lavender-700">{fmtDate(date)}</span>
                    <span className="text-xs text-lavender-400">{items.length} 件</span>
                  </div>
                  {items.map(s => (
                    <div
                      key={s.id}
                      className="px-5 py-3 flex items-center gap-4 border-b border-gray-50 last:border-0 hover:bg-lavender-50/40 transition"
                    >
                      <span className="w-20 shrink-0 text-xs font-medium px-2 py-1 rounded bg-lavender-50 text-lavender-600 border border-lavender-100 text-center">
                        {s.qualification_type}
                      </span>
                      <span className="text-sm text-gray-700 flex-1">{s.exam_location}</span>
                      <span className="font-mono text-sm text-gray-600 bg-gray-50 border border-gray-100 rounded px-2 py-0.5">
                        {s.exam_id}
                      </span>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => { setEditTarget(s); setFormOpen(true) }}
                          className="btn-secondary btn-sm"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => handleDelete(s)}
                          className="btn-danger btn-sm"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ))
          )}
        </div>

        <p className="text-xs text-gray-400 text-right">合計 {sessions.length} 件</p>
      </div>

      {/* 追加/編集モーダル */}
      {formOpen && (
        <ExamSessionFormModal
          initial={editTarget
            ? { exam_date: editTarget.exam_date, exam_location: editTarget.exam_location, qualification_type: editTarget.qualification_type, exam_id: editTarget.exam_id }
            : makeEmpty()
          }
          editId={editTarget?.id ?? null}
          onSave={handleSave}
          onCancel={() => { setFormOpen(false); setEditTarget(null) }}
        />
      )}

      {/* インポートプレビューモーダル */}
      {previewRows && (
        <ImportPreviewModal
          rows={previewRows}
          onConfirm={handleImportConfirm}
          onCancel={() => setPreviewRows(null)}
        />
      )}
    </div>
  )
}
