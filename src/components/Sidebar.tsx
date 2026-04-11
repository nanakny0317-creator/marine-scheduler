import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useSession, sessionKey } from '../contexts/SessionContext'

function formatDate(d: string | null): string {
  if (!d) return '日時未定'
  try { return format(new Date(d), 'M月d日(E)', { locale: ja }) } catch { return d }
}

export default function Sidebar() {
  const { sessions, loading, selectedKey, setSelectedKey } = useSession()

  return (
    <aside className="w-52 flex-shrink-0 bg-white border-r border-lavender-200 flex flex-col">

      {/* ロゴ（クリックでトップへ） */}
      <Link
        to="/"
        className="block px-5 py-5 border-b border-lavender-100 hover:bg-lavender-50 transition group shrink-0"
      >
        <div className="text-lavender-500 font-bold text-sm leading-tight group-hover:text-lavender-600 transition">
          ⚓ 船舶免許講習
        </div>
        <div className="text-xs text-gray-400 mt-0.5">管理システム</div>
      </Link>

      {/* セッション一覧 */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <p className="text-xs text-gray-300 text-center py-10">読み込み中…</p>
        )}
        {!loading && sessions.length === 0 && (
          <p className="text-xs text-gray-300 text-center py-10">データなし</p>
        )}
        {!loading && sessions.map((session) => {
          const key = sessionKey(session)
          const isSelected = selectedKey === key
          return (
            <button
              key={key}
              onClick={() => setSelectedKey(key)}
              className={[
                'w-full text-left px-3 py-2 border-b border-lavender-50',
                'flex flex-col gap-0.5 transition-colors duration-100',
                'border-l-[3px]',
                isSelected
                  ? 'bg-lavender-50 border-l-lavender-400'
                  : 'bg-white border-l-transparent hover:bg-lavender-50/60 hover:border-l-lavender-200',
              ].join(' ')}
            >
              {/* 1行目：日付 + 時刻 */}
              <div className="flex items-baseline gap-1.5">
                <span className={`font-semibold text-[11px] leading-tight ${isSelected ? 'text-lavender-700' : 'text-gray-700'}`}>
                  {formatDate(session.course_date)}
                </span>
                {session.course_time && (
                  <span className={`text-[10px] font-medium ${isSelected ? 'text-lavender-500' : 'text-lavender-400'}`}>
                    {session.course_time}
                  </span>
                )}
              </div>
              {/* 2行目：会場 + 人数 */}
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] text-gray-400 truncate leading-tight">
                  {session.venue ?? '会場未定'}
                </span>
                <span className={`text-[10px] shrink-0 ${isSelected ? 'text-lavender-400' : 'text-gray-300'}`}>
                  {session.items.length}名
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* バージョン */}
      <div className="px-5 py-3 text-xs text-gray-300 border-t border-lavender-100 shrink-0">
        v0.1.0
      </div>
    </aside>
  )
}
