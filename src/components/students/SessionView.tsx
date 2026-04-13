import { useState, useMemo, useEffect } from 'react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { Enrollment, Student } from '../../types'
import { enrollmentsApi } from '../../lib/api'
import StudentForm from './StudentForm'
import MemberBasicInfoModal from './MemberBasicInfoModal'
import CsvImportModal from './CsvImportModal'
import ScheduleItemDetailModal from './ScheduleItemDetailModal'
import ReceiptPrintModal from './ReceiptPrintModal'
import { useSession, TABS } from '../../contexts/SessionContext'

const TYPE_LABEL: Record<string, string> = {
  new: '受講申請', renewal: '更新講習', lapsed: '失効再交付',
}
const TYPE_CLASS: Record<string, string> = {
  new:     'bg-mint-50 text-mint-600',
  renewal: 'bg-blue-50 text-blue-500',
  lapsed:  'bg-orange-50 text-orange-500',
}

function formatDate(d: string | null) {
  if (!d) return '日時未定'
  try { return format(new Date(d), 'yyyy年M月d日(E)', { locale: ja }) } catch { return d }
}

function getAppType(enrollment: Enrollment): string {
  try { return JSON.parse(enrollment.extra_json).application_type ?? 'new' } catch { return 'new' }
}

export default function SessionView() {
  // activeTab はコンテキスト管理（サイドバーのフィルタと共有）
  const { selectedSession, loading, reload, activeTab, setActiveTab } = useSession()

  const [viewStudent, setViewStudent] = useState<Student | null>(null)
  const [editStudent, setEditStudent] = useState<Student | null>(null)
  const [showCsvImport, setShowCsvImport] = useState(false)
  const [detailItem, setDetailItem] = useState<{ student: Student; enrollment: Enrollment } | null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set())
  const [showReceipt, setShowReceipt] = useState(false)

  // sessions はコンテキスト側で activeTab フィルタ済みのため、items をそのまま使う
  const filteredItems = selectedSession?.items ?? []

  const allChecked = filteredItems.length > 0 && filteredItems.every(({ enrollment }) => checkedIds.has(enrollment.id))
  const someChecked = filteredItems.some(({ enrollment }) => checkedIds.has(enrollment.id))

  const checkedItems = useMemo(
    () => filteredItems.filter(({ enrollment }) => checkedIds.has(enrollment.id)),
    [filteredItems, checkedIds]
  )

  const toggleAll = () => {
    if (allChecked) {
      setCheckedIds(new Set())
    } else {
      setCheckedIds(new Set(filteredItems.map(({ enrollment }) => enrollment.id)))
    }
  }

  const toggleOne = (enrollmentId: number) => {
    setCheckedIds(prev => {
      const next = new Set(prev)
      if (next.has(enrollmentId)) { next.delete(enrollmentId) } else { next.add(enrollmentId) }
      return next
    })
  }

  // 日程切替時にチェックをリセット
  useEffect(() => {
    setCheckedIds(new Set())
  }, [selectedSession?.course_date, selectedSession?.course_time, selectedSession?.venue])

  const handleDelete = async (student: Student, enrollment: Enrollment) => {
    if (
      !window.confirm(
        `「${student.last_name} ${student.first_name}」のこの申込を削除しますか？\n\n会員（受講者）の基本情報は残ります。講習スケジュールの一覧からだけ外れます。`
      )
    ) {
      return
    }
    await enrollmentsApi.delete(enrollment.id)
    reload()
  }

  return (
    <div className="flex flex-col h-full gap-3">

      {/* タブ + CSVインポート */}
      <div className="flex items-center gap-4 shrink-0">
        <div className="flex gap-1 border-b border-lavender-100 flex-1">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-2 text-sm rounded-t-lg border-b-2 transition ${
                activeTab === key
                  ? 'border-lavender-400 text-lavender-600 font-semibold bg-lavender-50'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowCsvImport(true)}
          className="btn-secondary text-sm shrink-0"
        >
          CSVインポート
        </button>
      </div>

      {/* 選択中セッションのヘッダ */}
      {selectedSession && (
        <div className="shrink-0 px-4 py-2.5 bg-lavender-50 rounded-xl border border-lavender-100 flex items-center gap-3 flex-wrap">
          <span className="font-semibold text-gray-700 text-sm">
            {formatDate(selectedSession.course_date)}
          </span>
          {selectedSession.course_time && (
            <span className="text-lavender-500 font-semibold text-sm bg-lavender-100 px-2 py-0.5 rounded">
              🕐 {selectedSession.course_time}
            </span>
          )}
          {selectedSession.venue && (
            <>
              <span className="text-lavender-300">|</span>
              <span className="text-gray-600 text-sm">📍 {selectedSession.venue}</span>
            </>
          )}
          <span className="ml-auto text-xs text-gray-400 bg-white rounded-full px-2 py-0.5 border border-lavender-100">
            {filteredItems.length} 名
          </span>
          {someChecked && (
            <button
              type="button"
              onClick={() => setShowReceipt(true)}
              className="btn-primary btn-sm shrink-0"
            >
              受領書印刷（{checkedItems.length}名）
            </button>
          )}
        </div>
      )}

      {/* 受講者一覧 */}
      <div className="flex-1 overflow-y-auto rounded-xl border border-lavender-100 bg-white">
        {loading ? (
          <p className="text-center text-gray-400 text-sm py-16">読み込み中…</p>
        ) : !selectedSession ? (
          <p className="text-center text-gray-400 text-sm py-16">左のサイドバーから日程を選択してください</p>
        ) : filteredItems.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-16">該当する受講者がいません</p>
        ) : (
          <>
            {/* 全選択行 */}
            <div className="px-5 py-2 flex items-center gap-3 border-b border-lavender-100 bg-lavender-50/40">
              <input
                type="checkbox"
                checked={allChecked}
                ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked }}
                onChange={toggleAll}
                className="w-4 h-4 accent-lavender-500 cursor-pointer"
              />
              <span className="text-xs text-gray-500">
                {someChecked ? `${checkedItems.length}名を選択中` : '全選択'}
              </span>
            </div>

            {filteredItems.map(({ enrollment, student }) => {
              const appType = getAppType(enrollment)
              const isChecked = checkedIds.has(enrollment.id)
              return (
                <div
                  key={enrollment.id}
                  className={`px-5 py-3 flex items-center gap-3 border-b border-gray-50 last:border-0 hover:bg-lavender-50/60 transition cursor-pointer select-none ${isChecked ? 'bg-lavender-50/70' : ''}`}
                  onDoubleClick={() => setDetailItem({ student, enrollment })}
                  title="ダブルクリックで詳細表示"
                >
                  {/* チェックボックス */}
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleOne(enrollment.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 accent-lavender-500 cursor-pointer shrink-0"
                  />

                  {/* 種別バッジ */}
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold ${TYPE_CLASS[appType] ?? 'bg-gray-100 text-gray-500'}`}>
                    {TYPE_LABEL[appType] ?? appType}
                  </span>

                  {/* 氏名 */}
                  <div className="min-w-[130px]">
                    <span className="text-sm font-medium text-gray-700">
                      {student.last_name} {student.first_name}
                    </span>
                    {(student.last_kana || student.first_kana) && (
                      <span className="text-xs text-gray-400 ml-1.5">
                        {student.last_kana} {student.first_kana}
                      </span>
                    )}
                    {student.student_code && (
                      <span className="text-[10px] text-lavender-400 ml-1.5 font-mono">
                        #{student.student_code}
                      </span>
                    )}
                  </div>

                  {/* メニュー（受講申請のみ） */}
                  <span className="text-xs text-gray-400 truncate flex-1 hidden sm:block">
                    {appType === 'new' ? enrollment.menu : ''}
                  </span>

                  {/* 電話 */}
                  <span className="text-xs text-gray-400 shrink-0">
                    {student.phone || student.mobile || ''}
                  </span>

                  {/* 操作ボタン */}
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setViewStudent(student) }}
                      className="btn-secondary btn-sm"
                    >
                      基本情報
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(student, enrollment) }}
                      className="btn-danger btn-sm"
                    >
                      申込削除
                    </button>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* 合計件数 + ヒント */}
      {!loading && selectedSession && (
        <p className="text-xs text-gray-400 text-right shrink-0">
          合計 {filteredItems.length} 件
          <span className="ml-3 text-gray-300">ダブルクリックで詳細・編集</span>
        </p>
      )}

      {detailItem && (
        <ScheduleItemDetailModal
          student={detailItem.student}
          enrollment={detailItem.enrollment}
          onClose={() => setDetailItem(null)}
          onUpdated={() => { reload() }}
        />
      )}

      {viewStudent && (
        <MemberBasicInfoModal
          student={viewStudent}
          onClose={() => setViewStudent(null)}
          onEdit={() => {
            setEditStudent(viewStudent)
            setViewStudent(null)
          }}
        />
      )}

      {editStudent && (
        <StudentForm
          student={editStudent}
          onSaved={() => {
            setEditStudent(null)
            reload()
          }}
          onCancel={() => setEditStudent(null)}
        />
      )}

      {/* CSVインポートモーダル */}
      {showCsvImport && (
        <CsvImportModal
          onClose={() => setShowCsvImport(false)}
          onImported={() => { setShowCsvImport(false); reload() }}
        />
      )}

      {/* 受領書印刷モーダル */}
      {showReceipt && (
        <ReceiptPrintModal
          items={checkedItems}
          onClose={() => setShowReceipt(false)}
        />
      )}
    </div>
  )
}
