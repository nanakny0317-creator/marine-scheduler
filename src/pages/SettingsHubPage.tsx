import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DEFAULT_BIRTH_DATE_STYLE, loadBirthDateStyle, saveBirthDateStyle,
  type BirthDateMode, type BirthDateStyle,
} from '../lib/birthDateStyle'

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
      { icon: '💴', title: '受験料・登録免許税', desc: '試験申請者名簿の料金・団体名',              path: '/fees' },
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

const MODE_OPTIONS: { value: BirthDateMode; label: string }[] = [
  { value: 'wareki',  label: '和暦（元号の枠に×・年は元号の年）' },
  { value: 'seireki', label: '西暦（1900／2000の枠に×・年は西暦の下2桁）' },
]

/** 申請書の生年月日を和暦・西暦のどちらで書くか */
function BirthDateStyleSetting() {
  const [style, setStyle] = useState<BirthDateStyle>(DEFAULT_BIRTH_DATE_STYLE)
  const [saved, setSaved] = useState(false)
  useEffect(() => { loadBirthDateStyle().then(setStyle) }, [])

  const change = async (k: keyof BirthDateStyle, v: BirthDateMode) => {
    const next = { ...style, [k]: v }
    setStyle(next)
    await saveBirthDateStyle(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const row = (k: keyof BirthDateStyle, label: string) => (
    <label className="flex items-center gap-3 text-sm">
      <span className="w-20 text-gray-600">{label}</span>
      <select
        value={style[k]}
        onChange={e => change(k, e.target.value as BirthDateMode)}
        className="flex-1 border border-lavender-200 rounded-lg px-3 py-1.5 bg-white"
      >
        {MODE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )

  return (
    <div className="bg-white rounded-2xl border border-lavender-100 shadow-sm px-5 py-4 space-y-3">
      <div className="flex items-center">
        <span className="text-sm font-bold text-gray-700 flex-1">生年月日の書き方</span>
        {saved && <span className="text-xs text-mint-600">保存しました</span>}
      </div>
      {row('japanese', '日本国籍')}
      {row('foreign', '外国籍')}
      <p className="text-xs text-gray-400">国籍が空欄の人は日本国籍として扱います</p>
    </div>
  )
}

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

        <section className="space-y-3">
          <h2 className="text-sm font-bold text-lavender-600">申請書の印字</h2>
          <BirthDateStyleSetting />
        </section>
      </div>
    </div>
  )
}
