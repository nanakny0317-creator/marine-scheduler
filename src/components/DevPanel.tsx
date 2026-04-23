/**
 * 開発専用パネル
 * import.meta.env.DEV が true のときだけ HomePage から呼ばれる
 */
import { useEffect, useState } from 'react'
import { devApi } from '../lib/api'

interface Counts {
  students: number
  enrollments: number
  pendingReviews: number
}

interface Props {
  onDataChanged: () => void
}

export default function DevPanel({ onDataChanged }: Props) {
  const [open, setOpen] = useState(false)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [busy, setBusy] = useState(false)
  const [lastMsg, setLastMsg] = useState<string | null>(null)

  const refresh = () => devApi.counts().then(setCounts).catch(() => {})

  useEffect(() => { if (open) refresh() }, [open])

  const run = async (action: () => Promise<unknown>, msg: string) => {
    setBusy(true)
    setLastMsg(null)
    try {
      await action()
      setLastMsg(msg)
      await refresh()
      onDataChanged()
    } finally {
      setBusy(false)
    }
  }

  const handleReset = () =>
    run(devApi.resetAll, '✓ 全データを削除しました')

  const handleSeed = () =>
    run(async () => {
      const r = await devApi.seed()
      setLastMsg(`✓ テストデータを生成しました（会員 ${r.students} 件 / 申込 ${r.enrollments} 件 / 要対応 ${r.pendingReviews} 件）`)
    }, '')

  const handleResetAndSeed = () =>
    run(async () => {
      await devApi.resetAll()
      const r = await devApi.seed()
      setLastMsg(`✓ リセット＆生成完了（会員 ${r.students} 件 / 申込 ${r.enrollments} 件 / 要対応 ${r.pendingReviews} 件）`)
    }, '')

  return (
    <>
      {/* フローティングボタン */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 px-3 py-1.5 bg-gray-800 text-gray-100 text-xs font-mono font-bold rounded-xl shadow-lg hover:bg-gray-700 transition opacity-80 hover:opacity-100"
      >
        DEV
      </button>

      {/* パネルモーダル */}
      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-end z-50 p-4">
          <div className="bg-gray-900 text-gray-100 rounded-2xl shadow-2xl w-80 overflow-hidden font-mono text-sm">
            {/* ヘッダ */}
            <div className="px-4 py-3 bg-gray-800 flex items-center justify-between">
              <span className="font-bold text-yellow-400">🛠 DEV PANEL</span>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
            </div>

            <div className="p-4 space-y-4">
              {/* 現在のデータ件数 */}
              {counts && (
                <div className="bg-gray-800 rounded-xl px-4 py-3 space-y-1 text-xs">
                  <p className="text-gray-400 text-[10px] uppercase tracking-widest mb-1">現在のデータ</p>
                  <div className="flex justify-between"><span className="text-gray-400">会員</span><span className="text-white font-bold">{counts.students} 件</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">申込</span><span className="text-white font-bold">{counts.enrollments} 件</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">要対応</span><span className="text-yellow-400 font-bold">{counts.pendingReviews} 件</span></div>
                </div>
              )}

              {/* アクションボタン */}
              <div className="space-y-2">
                <button
                  onClick={handleResetAndSeed}
                  disabled={busy}
                  className="w-full py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 rounded-xl font-bold text-sm transition"
                >
                  {busy ? '処理中…' : '🔄 リセット＆テストデータ生成'}
                </button>
                <button
                  onClick={handleSeed}
                  disabled={busy}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-xl text-sm transition"
                >
                  🌱 テストデータだけ追加
                </button>
                <button
                  onClick={handleReset}
                  disabled={busy}
                  className="w-full py-2 bg-red-700 hover:bg-red-600 disabled:opacity-40 rounded-xl text-sm transition"
                >
                  🗑 全データ削除
                </button>
              </div>

              {/* テストデータの内容説明 */}
              <div className="bg-gray-800 rounded-xl px-3 py-2.5 text-[10px] text-gray-400 space-y-0.5">
                <p className="text-gray-300 font-bold mb-1">生成データの内容</p>
                <p>・通常会員 16名（氏名/住所/電話/生年月日）</p>
                <p>・申込 9件（日程・会場・種別あり）</p>
                <p>・同姓同名・別人ペア 1組（佐藤 健）</p>
                <p>・旧字体ペア 2組（要対応リスト入り）</p>
                <p className="text-yellow-400 mt-1">　髙橋↔高橋　齊藤↔斉藤</p>
              </div>

              {/* 結果メッセージ */}
              {lastMsg && (
                <p className="text-[11px] text-green-400 bg-green-900/30 rounded-lg px-3 py-2">{lastMsg}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
