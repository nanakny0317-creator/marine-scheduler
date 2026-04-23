import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CsvImportModal from '../components/students/CsvImportModal'
import StudentForm from '../components/students/StudentForm'
import PendingReviewDetailModal from '../components/PendingReviewDetailModal'
import type { PendingReviewWithStudents } from '../types'
import { pendingReviewsApi } from '../lib/api'
import DevPanel from '../components/DevPanel'

// ────────────────────────────────────────
// ボタン定義
// ────────────────────────────────────────

type BtnColor = 'lavender' | 'mint' | 'peach' | 'gray' | 'sky'

/**
 * Tailwind の JIT が静的解析できるよう、クラス文字列は必ずここで完全な形で書く。
 * テンプレートリテラルで色名を埋め込むと Tailwind がパースできないため注意。
 */
const COLOR_STYLES: Record<BtnColor, { wrap: string; title: string }> = {
  sky: {
    wrap: [
      'bg-sky-50 border-sky-200',
      'shadow-[0_7px_0_0_#7dd3fc]',
      'hover:shadow-[0_11px_0_0_#7dd3fc] hover:-translate-y-1',
      'active:shadow-[0_1px_0_0_#7dd3fc] active:translate-y-[6px]',
    ].join(' '),
    title: 'text-sky-500',
  },
  lavender: {
    wrap: [
      'bg-lavender-50 border-lavender-300',
      'shadow-[0_7px_0_0_#c4b5fd]',
      'hover:shadow-[0_11px_0_0_#c4b5fd] hover:-translate-y-1',
      'active:shadow-[0_1px_0_0_#c4b5fd] active:translate-y-[6px]',
    ].join(' '),
    title: 'text-lavender-600',
  },
  mint: {
    wrap: [
      'bg-mint-50 border-mint-300',
      'shadow-[0_7px_0_0_#86efac]',
      'hover:shadow-[0_11px_0_0_#86efac] hover:-translate-y-1',
      'active:shadow-[0_1px_0_0_#86efac] active:translate-y-[6px]',
    ].join(' '),
    title: 'text-mint-500',
  },
  peach: {
    wrap: [
      'bg-peach-50 border-peach-300',
      'shadow-[0_7px_0_0_#fdba74]',
      'hover:shadow-[0_11px_0_0_#fdba74] hover:-translate-y-1',
      'active:shadow-[0_1px_0_0_#fdba74] active:translate-y-[6px]',
    ].join(' '),
    title: 'text-peach-500',
  },
  gray: {
    wrap: 'bg-gray-50 border-gray-200 shadow-[0_5px_0_0_#e5e7eb]',
    title: 'text-gray-400',
  },
}

interface BtnProps {
  icon: string
  title: string
  desc: string
  color: BtnColor
  /** true: 中央に表示する主要ボタン（やや大きめ） */
  primary?: boolean
  onClick?: () => void
  disabled?: boolean
}

function HomeButton({ icon, title, desc, color, primary = false, onClick, disabled }: BtnProps) {
  const c = COLOR_STYLES[color]
  return (
    <button
      onClick={disabled ? undefined : onClick}
      className={[
        'relative rounded-3xl border-2 flex flex-col items-center gap-3 transition-all duration-100 select-none',
        primary ? 'w-52 px-6 py-10' : 'w-44 px-5 py-7',
        c.wrap,
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      <span className={primary ? 'text-6xl leading-none' : 'text-5xl leading-none'}>{icon}</span>
      <span className={['font-bold leading-tight text-center', primary ? 'text-base' : 'text-sm', c.title].join(' ')}>
        {title}
      </span>
      <span className="text-xs text-gray-400 text-center leading-relaxed whitespace-pre-line">{desc}</span>
      {disabled && (
        <span className="absolute top-2.5 right-3 text-[10px] bg-gray-100 text-gray-400 rounded-full px-2 py-0.5 font-medium">
          準備中
        </span>
      )}
    </button>
  )
}

// ────────────────────────────────────────
// トップページ本体
// ────────────────────────────────────────

export default function HomePage() {
  const navigate = useNavigate()
  const [showCsvImport, setShowCsvImport]   = useState(false)
  const [showNewStudent, setShowNewStudent] = useState(false)
  const [pendingReviews, setPendingReviews] = useState<PendingReviewWithStudents[]>([])
  const [showPending, setShowPending] = useState(false)
  const [selectedPr, setSelectedPr] = useState<PendingReviewWithStudents | null>(null)

  const loadPending = () => {
    pendingReviewsApi.list().then(setPendingReviews).catch(() => {})
  }

  useEffect(() => { loadPending() }, [])

  const handleResolve = async (id: number, resolution: 'merged' | 'different') => {
    await pendingReviewsApi.resolve(id, resolution)
    loadPending()
  }

  const handleDetailResolved = () => {
    setSelectedPr(null)
    setShowPending(false)
    loadPending()
  }

  const parseReasons = (raw: string) => {
    try { return JSON.parse(raw) as string[] } catch { return [raw] }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-lavender-50 via-white to-mint-50 flex flex-col items-center gap-10 py-12 px-8">

      {/* ロゴ・タイトル */}
      <div className="text-center">
        <div className="text-7xl mb-4 drop-shadow-sm select-none">⚓</div>
        <h1 className="text-2xl font-bold text-lavender-600 tracking-wide">リブレボート免許教室</h1>
        <p className="text-sm text-gray-400 mt-1 tracking-widest">受 講 者 管 理 シ ス テ ム</p>
      </div>

      {/* メインボタン群 */}
      <div className="flex items-center gap-7 flex-wrap justify-center">
        <HomeButton
          icon="📥"
          title="新規取り込み"
          desc={"CSVから受講者を\n一括インポート"}
          color="mint"
          onClick={() => setShowCsvImport(true)}
        />
        <HomeButton
          icon="📅"
          title="スケジュール確認"
          desc={"講習日・会場ごとの\n申込状況を確認"}
          color="lavender"
          primary
          onClick={() => navigate('/students')}
        />
        <HomeButton
          icon="✏️"
          title="新規個人登録"
          desc={"手動で受講者情報\nを入力"}
          color="peach"
          onClick={() => setShowNewStudent(true)}
        />
      </div>

      {/* サブボタン群 */}
      <div className="flex gap-5 flex-wrap justify-center">
        <HomeButton
          icon="🏛️"
          title="会場管理"
          desc={"会場マスターの\n追加・編集"}
          color="sky"
          onClick={() => navigate('/venues')}
        />
        <HomeButton
          icon="👤"
          title="会員一覧"
          desc={"会員情報と講習日程\nの確認・編集"}
          color="lavender"
          onClick={() => navigate('/members')}
        />
        <HomeButton
          icon="🖨️"
          title="宛名印刷"
          desc={"宛名ラベル・受講票\nの印刷"}
          color="gray"
          disabled
        />
      </div>

      {/* ─── ダッシュボード：要対応一覧 ─── */}
      <div className="w-full max-w-3xl">
        <div className={`rounded-2xl border-2 overflow-hidden shadow-sm ${
          pendingReviews.length > 0 ? 'border-amber-300 bg-white' : 'border-gray-200 bg-white/60'
        }`}>
          {/* パネルヘッダー */}
          <div className={`px-5 py-3 flex items-center gap-2 border-b ${
            pendingReviews.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100'
          }`}>
            <span className="text-base">{pendingReviews.length > 0 ? '⚠️' : '✅'}</span>
            <span className={`font-bold text-sm ${pendingReviews.length > 0 ? 'text-amber-700' : 'text-gray-500'}`}>
              重複 要対応一覧
            </span>
            {pendingReviews.length > 0 && (
              <span className="ml-1 px-2 py-0.5 bg-amber-500 text-white text-xs font-bold rounded-full">
                {pendingReviews.length}
              </span>
            )}
            <span className="ml-auto text-xs text-gray-400">
              {new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })} 時点
            </span>
          </div>

          {/* 件数0の場合 */}
          {pendingReviews.length === 0 && (
            <div className="px-5 py-5 text-sm text-gray-400 text-center">
              未対応の重複確認はありません
            </div>
          )}

          {/* 件数あり：インライン表示（最大5件） */}
          {pendingReviews.slice(0, 5).map((pr, idx) => (
            <div
              key={pr.id}
              className={`px-5 py-3.5 flex items-center gap-4 hover:bg-amber-50/60 transition ${
                idx < Math.min(pendingReviews.length, 5) - 1 ? 'border-b border-amber-100' : ''
              }`}
            >
              {/* 新規会員 */}
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400 mb-0.5">新規登録</p>
                <p className="text-sm font-bold text-gray-800 truncate">
                  {pr.student.last_name} {pr.student.first_name}
                </p>
                <p className="text-[10px] text-gray-400 truncate">
                  {pr.student.birth_date ?? '生年月日不明'}
                </p>
              </div>

              {/* 矢印＋一致理由 */}
              <div className="text-center shrink-0">
                <p className="text-gray-300 text-lg leading-none">↔</p>
                <div className="flex flex-wrap gap-1 justify-center mt-1 max-w-[120px]">
                  {parseReasons(pr.match_reasons).map((r: string) => (
                    <span key={r} className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-600 rounded-full whitespace-nowrap">
                      {r}
                    </span>
                  ))}
                </div>
              </div>

              {/* 既存会員 */}
              <div className="flex-1 min-w-0 text-right">
                <p className="text-[10px] text-gray-400 mb-0.5">重複候補（既存）</p>
                <p className="text-sm font-bold text-gray-800 truncate">
                  {pr.candidate.last_name} {pr.candidate.first_name}
                </p>
                <p className="text-[10px] text-gray-400 truncate">
                  {pr.candidate.birth_date ?? '生年月日不明'}
                </p>
              </div>

              {/* アクションボタン */}
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  onClick={() => setSelectedPr(pr)}
                  className="px-3 py-1.5 bg-amber-500 text-white text-[11px] font-semibold rounded-lg hover:bg-amber-600 transition whitespace-nowrap"
                >
                  詳細確認 →
                </button>
                <button
                  onClick={() => handleResolve(pr.id, 'different')}
                  className="px-3 py-1 bg-white border border-gray-200 text-gray-500 text-[11px] font-semibold rounded-lg hover:bg-gray-50 transition whitespace-nowrap"
                >
                  別会員
                </button>
              </div>
            </div>
          ))}

          {/* 5件超の場合 */}
          {pendingReviews.length > 5 && (
            <button
              onClick={() => setShowPending(true)}
              className="w-full px-5 py-3 text-xs font-semibold text-amber-600 hover:bg-amber-50 transition border-t border-amber-100 text-center"
            >
              他 {pendingReviews.length - 5} 件を表示 →
            </button>
          )}
        </div>
      </div>

      {/* モーダル：CSVインポート */}
      {showCsvImport && (
        <CsvImportModal
          onClose={() => setShowCsvImport(false)}
          onImported={() => { setShowCsvImport(false); navigate('/students') }}
        />
      )}

      {/* モーダル：新規個人登録 */}
      {showNewStudent && (
        <StudentForm
          student={null}
          onSaved={() => { setShowNewStudent(false); loadPending() }}
          onCancel={() => setShowNewStudent(false)}
        />
      )}

      {/* 開発専用パネル */}
      {import.meta.env.DEV && <DevPanel onDataChanged={loadPending} />}

      {/* 詳細比較モーダル */}
      {selectedPr && (
        <PendingReviewDetailModal
          pr={selectedPr}
          onClose={() => setSelectedPr(null)}
          onResolved={handleDetailResolved}
        />
      )}

      {/* 全件モーダル（6件以上のとき） */}
      {showPending && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col">
            <div className="border-b border-amber-100 px-6 py-4 flex items-center gap-3 bg-amber-50 rounded-t-2xl">
              <span className="text-xl">⚠️</span>
              <h2 className="text-base font-bold text-amber-700 flex-1">
                重複 要対応一覧（全 {pendingReviews.length} 件）
              </h2>
              <button onClick={() => setShowPending(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              {pendingReviews.map((pr) => (
                <div key={pr.id} className="border border-amber-200 bg-amber-50/40 rounded-xl p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 space-y-0.5">
                      <p className="text-[10px] text-gray-400">新規登録</p>
                      <p className="text-sm font-bold text-gray-800">
                        {pr.student.last_name} {pr.student.first_name}
                        <span className="ml-2 text-xs font-normal text-gray-400">{pr.student.last_kana} {pr.student.first_kana}</span>
                      </p>
                      <p className="text-xs text-gray-500">{pr.student.birth_date ?? ''}{pr.student.student_code ? `　No: ${pr.student.student_code}` : ''}</p>
                    </div>
                    <div className="text-gray-300 self-center text-lg">↔</div>
                    <div className="flex-1 space-y-0.5">
                      <p className="text-[10px] text-gray-400">重複候補（既存）</p>
                      <p className="text-sm font-bold text-gray-800">
                        {pr.candidate.last_name} {pr.candidate.first_name}
                        <span className="ml-2 text-xs font-normal text-gray-400">{pr.candidate.last_kana} {pr.candidate.first_kana}</span>
                      </p>
                      <p className="text-xs text-gray-500">{pr.candidate.birth_date ?? ''}{pr.candidate.student_code ? `　No: ${pr.candidate.student_code}` : ''}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">一致理由: {parseReasons(pr.match_reasons).join('・')}</p>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => setSelectedPr(pr)} className="px-3 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-lg hover:bg-amber-600 transition">詳細確認 →</button>
                    <button onClick={() => handleResolve(pr.id, 'different')} className="px-3 py-1.5 bg-white border border-gray-300 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50 transition">別会員として確認</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
