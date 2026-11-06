import { useNavigate } from 'react-router-dom'

interface Item {
  icon: string
  title: string
  desc: string
  path: string
}

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: '試験申請',
    items: [
      { icon: '📋', title: '試験日程',   desc: '試験日・試験地・試験IDの登録／JMRAのExcelインポート', path: '/exam-sessions' },
      { icon: '🏫', title: '授業会場',   desc: '試験前の講習で使う教室の登録',                     path: '/classrooms' },
    ],
  },
  {
    label: '更新・失効講習',
    items: [
      { icon: '🗓️', title: '更新講習日程', desc: '更新・失効講習の日程を事前登録',        path: '/renewal-sessions' },
      { icon: '🏛️', title: '更新講習会場', desc: '会場マスター（地域・都道府県別）の追加・編集', path: '/venues' },
    ],
  },
]

export default function SettingsHubPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gradient-to-br from-lavender-50 via-white to-mint-50 py-10 px-6">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600 text-sm">← トップへ</button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-700">会場・日程の設定</h1>
            <p className="text-xs text-gray-400 mt-0.5">ここで登録したものが申込画面のプルダウンに出ます</p>
          </div>
        </div>

        {GROUPS.map(g => (
          <section key={g.label} className="space-y-3">
            <h2 className="text-sm font-bold text-lavender-600">{g.label}</h2>
            <div className="grid grid-cols-2 gap-4">
              {g.items.map(it => (
                <button
                  key={it.path}
                  onClick={() => navigate(it.path)}
                  className="text-left bg-white rounded-2xl border border-lavender-100 shadow-sm px-5 py-4 flex items-center gap-4 hover:border-lavender-300 hover:shadow transition"
                >
                  <span className="text-3xl leading-none">{it.icon}</span>
                  <span className="flex-1">
                    <span className="block text-sm font-bold text-gray-700">{it.title}</span>
                    <span className="block text-xs text-gray-400 mt-0.5">{it.desc}</span>
                  </span>
                  <span className="text-gray-300">›</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
