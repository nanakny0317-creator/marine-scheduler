import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CsvImportModal from '../components/students/CsvImportModal'
import StudentForm from '../components/students/StudentForm'

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-lavender-50 via-white to-mint-50 flex flex-col items-center justify-center gap-14 p-8">

      {/* ロゴ・タイトル */}
      <div className="text-center">
        <div className="text-8xl mb-5 drop-shadow-sm select-none">⚓</div>
        <h1 className="text-2xl font-bold text-lavender-600 tracking-wide">リブレボート免許教室</h1>
        <p className="text-sm text-gray-400 mt-2 tracking-widest">受 講 者 管 理 シ ス テ ム</p>
      </div>

      {/* メインボタン群：左 取り込み ／ 中央（大）スケジュール ／ 右 個人登録 */}
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
          onSaved={() => { setShowNewStudent(false); navigate('/students') }}
          onCancel={() => setShowNewStudent(false)}
        />
      )}
    </div>
  )
}
