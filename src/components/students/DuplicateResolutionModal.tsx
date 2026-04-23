/**
 * 重複候補モーダル
 * 検出した重複候補を表示し、3つの選択肢を提供する
 *   merge  → 既存会員に統合（既存を最新情報で上書き）
 *   defer  → 後で対応（備考＋要対応リストへ）
 *   new    → 別会員として登録
 */
import type { DuplicateCandidate, StudentInput } from '../../types'

type DupAction = 'merge' | 'defer' | 'new'

interface Props {
  candidates: DuplicateCandidate[]
  newStudent: StudentInput
  onResolve: (action: DupAction, targetId?: number) => void
  onCancel: () => void
}

const CONFIDENCE_STYLE: Record<string, string> = {
  high:   'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low:    'bg-yellow-50 text-yellow-600 border-yellow-200',
}

const CONFIDENCE_LABEL: Record<string, string> = {
  high:   '重複の可能性が高い',
  medium: '要確認',
  low:    '念のため確認',
}

function fmt(v: string | null | undefined) {
  return v || '—'
}

export default function DuplicateResolutionModal({ candidates, newStudent, onResolve, onCancel }: Props) {
  const top = candidates[0]

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        {/* ヘッダ */}
        <div className="border-b border-amber-100 px-6 py-4 flex items-start gap-3 bg-amber-50 rounded-t-2xl">
          <span className="text-2xl mt-0.5">⚠️</span>
          <div>
            <h2 className="text-base font-bold text-amber-700">重複の可能性があります</h2>
            <p className="text-xs text-amber-600 mt-0.5">
              既に登録されている会員と一致する項目が見つかりました。処理を選んでください。
            </p>
          </div>
          <button onClick={onCancel} className="ml-auto text-gray-400 hover:text-gray-600 text-xl" tabIndex={-1}>✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* 入力中の新規情報 */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-blue-500 mb-1">今回の入力内容</p>
            <p className="text-sm font-bold text-gray-700">
              {newStudent.last_name} {newStudent.first_name}
              {(newStudent.last_kana || newStudent.first_kana) && (
                <span className="ml-2 text-xs font-normal text-gray-400">
                  （{newStudent.last_kana} {newStudent.first_kana}）
                </span>
              )}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {newStudent.birth_date && `生年月日: ${newStudent.birth_date}`}
              {newStudent.birth_date && newStudent.email && '　'}
              {newStudent.email && `メール: ${newStudent.email}`}
            </p>
          </div>

          {/* 候補一覧 */}
          <div className="space-y-3">
            {candidates.map((c) => (
              <div key={c.student.id}>
                <div className={`border rounded-xl p-3 ${CONFIDENCE_STYLE[c.confidence]}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${CONFIDENCE_STYLE[c.confidence]}`}>
                      {CONFIDENCE_LABEL[c.confidence]}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      一致項目: {c.reasons.join('・')}
                    </span>
                  </div>

                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-gray-800">
                        {c.student.last_name} {c.student.first_name}
                        {(c.student.last_kana || c.student.first_kana) && (
                          <span className="ml-2 text-xs font-normal text-gray-500">
                            （{c.student.last_kana} {c.student.first_kana}）
                          </span>
                        )}
                      </p>
                      <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                        <p>生年月日: {fmt(c.student.birth_date)}</p>
                        <p>住所: {[c.student.prefecture, c.student.city, c.student.address1].filter(Boolean).join('') || '—'}</p>
                        <p>電話: {fmt(c.student.phone || c.student.mobile)}</p>
                        <p>メール: {fmt(c.student.email)}</p>
                        {c.student.license_number && <p>免許番号: {c.student.license_number}</p>}
                        <p className="text-gray-400">会員番号: {c.student.student_code ?? `ID ${c.student.id}`}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => onResolve('merge', c.student.id)}
                      className="shrink-0 px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:border-lavender-400 transition whitespace-nowrap"
                    >
                      この会員に統合
                    </button>
                  </div>
                </div>

                {/* 旧字体・異体字ヒント */}
                {c.hint && (
                  <div className="mt-1.5 flex gap-2 items-start bg-sky-50 border border-sky-200 rounded-xl px-3 py-2.5">
                    <span className="text-sky-400 text-base shrink-0 mt-0.5">💡</span>
                    <div className="text-xs text-sky-700 leading-relaxed">
                      <p className="font-semibold mb-0.5">旧字体・異体字からの変更の可能性があります</p>
                      <p className="text-sky-600">{c.hint}</p>
                      <p className="mt-1 text-sky-500">
                        同一人物であれば「この会員に統合」を選び、漢字表記を最新のものに更新してください。
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 注意書き */}
          <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
            「この会員に統合」を選ぶと、既存会員の情報が今回入力した内容で上書きされます。
          </p>
        </div>

        {/* フッタ：後で対応 / 別会員 */}
        <div className="border-t border-gray-100 px-5 py-4 flex gap-3 bg-gray-50 rounded-b-2xl">
          <button
            onClick={() => onResolve('defer', top?.student.id)}
            className="flex-1 py-2.5 rounded-xl border-2 border-amber-300 bg-amber-50 text-amber-700 text-sm font-semibold hover:bg-amber-100 transition"
          >
            📋 後で対応（要対応リストへ）
          </button>
          <button
            onClick={() => onResolve('new')}
            className="flex-1 py-2.5 rounded-xl border-2 border-gray-300 bg-white text-gray-600 text-sm font-semibold hover:bg-gray-50 transition"
          >
            ➕ 別会員として登録
          </button>
        </div>
      </div>
    </div>
  )
}
