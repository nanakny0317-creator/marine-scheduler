import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DEFAULT_FEES, FEE_GROUPS, loadFees, loadOrgName, saveFees, saveOrgName, type ExamFees } from '../lib/examFees'

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:border-lavender-400'

export default function FeesPage() {
  const navigate = useNavigate()
  const [fees, setFees] = useState<ExamFees | null>(null)
  const [orgName, setOrgName] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([loadFees(), loadOrgName()]).then(([f, o]) => { setFees(f); setOrgName(o) })
  }, [])

  const setFee = (k: keyof ExamFees, v: string) => {
    setSaved(false)
    const n = Number(v.normalize('NFKC').replace(/[,，\s]/g, ''))
    setFees(f => f && { ...f, [k]: Number.isFinite(n) ? n : 0 })
  }

  const handleSave = async () => {
    if (!fees) return
    try {
      await saveFees(fees)
      await saveOrgName(orgName.trim())
      setSaved(true); setError('')
    } catch {
      setError('保存に失敗しました')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-lavender-50 via-white to-mint-50 py-10 px-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/settings')} className="text-gray-400 hover:text-gray-600 text-sm">← 戻る</button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-700">受験料・登録免許税</h1>
            <p className="note-text mt-0.5">試験申請者名簿の料金欄などに使います。金額が改定されたらここで直してください</p>
          </div>
        </div>

        {!fees ? (
          <p className="text-center text-gray-400 text-sm py-16">読み込み中…</p>
        ) : (
          <>
            <section className="bg-white rounded-2xl border border-lavender-100 shadow-sm p-5 space-y-2">
              <h2 className="text-sm font-bold text-lavender-600">試験申請者名簿</h2>
              <label className="block text-xs text-gray-500">団体名</label>
              <input type="text" value={orgName} onChange={e => { setOrgName(e.target.value); setSaved(false) }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-lavender-400" />
            </section>

            {FEE_GROUPS.map(g => (
              <section key={g.title} className="bg-white rounded-2xl border border-lavender-100 shadow-sm p-5 space-y-3">
                <h2 className="text-sm font-bold text-lavender-600">{g.title}</h2>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {g.items.map(it => (
                    <div key={it.key} className="grid grid-cols-[1fr_7rem_auto] items-center gap-2">
                      <span className="text-sm text-gray-700">{it.label}</span>
                      <input type="text" inputMode="numeric" value={fees[it.key].toLocaleString()} onChange={e => setFee(it.key, e.target.value)} className={inputCls} />
                      <span className="text-xs text-gray-400">円</span>
                    </div>
                  ))}
                </div>
              </section>
            ))}

            <div className="flex items-center justify-end gap-3">
              {error && <span className="text-sm text-red-500">{error}</span>}
              {saved && <span className="text-sm font-medium text-mint-500">✓ 保存しました</span>}
              <button type="button" onClick={() => { if (window.confirm('金額を初期値（旧うーみーくんの金額）に戻しますか？')) { setFees({ ...DEFAULT_FEES }); setSaved(false) } }} className="btn-secondary">初期値に戻す</button>
              <button type="button" onClick={handleSave} className="btn-primary">保存</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
