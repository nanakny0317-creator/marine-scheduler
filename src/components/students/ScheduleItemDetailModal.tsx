import { useState } from 'react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { Enrollment, Student } from '../../types'
import { enrollmentsApi } from '../../lib/api'
import MemberBasicInfoReadOnly from './MemberBasicInfoReadOnly'
import StudentForm from './StudentForm'
import EnrollmentFormModal from './EnrollmentFormModal'

const TYPE_LABEL: Record<string, string> = {
  new: '受講申請', renewal: '更新講習', lapsed: '失効再交付',
}
const TYPE_CLASS: Record<string, string> = {
  new:     'bg-mint-50 text-mint-600 border-mint-200',
  renewal: 'bg-blue-50 text-blue-500 border-blue-200',
  lapsed:  'bg-orange-50 text-orange-500 border-orange-200',
}
const STATUS_LABEL: Record<string, string> = {
  pending: '未確定', confirmed: '確定', completed: '完了', cancelled: 'キャンセル',
}
const STATUS_CLASS: Record<string, string> = {
  pending:   'bg-yellow-50 text-yellow-600',
  confirmed: 'bg-mint-50 text-mint-600',
  completed: 'bg-blue-50 text-blue-500',
  cancelled: 'bg-gray-100 text-gray-400',
}

function fmtDate(d: string | null | undefined) {
  if (!d?.trim()) return null
  try { return format(new Date(d), 'yyyy年M月d日(E)', { locale: ja }) } catch { return d }
}

function dash(v: string | null | undefined) {
  return v?.trim() ? v.trim() : '—'
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-x-3 text-sm py-2 border-b border-gray-50 last:border-0">
      <span className="text-gray-400 shrink-0">{label}</span>
      <span className="text-gray-800 break-words">{value}</span>
    </div>
  )
}

function getExtra(enrollment: Enrollment): Record<string, unknown> {
  try { return JSON.parse(enrollment.extra_json) as Record<string, unknown> } catch { return {} }
}

/** 申込種別に応じた受講・申込情報の読み取り表示 */
function EnrollmentDetail({ enrollment }: { enrollment: Enrollment }) {
  const extra    = getExtra(enrollment)
  const appType  = (extra.application_type as string) ?? 'new'
  const isNew    = appType === 'new'

  const courseLocation = (typeof extra.course_location === 'string' ? extra.course_location : enrollment.venue) ?? ''
  const courseTime     = typeof extra.course_time     === 'string' ? extra.course_time     : ''
  const examDate       = typeof extra.exam_date       === 'string' ? extra.exam_date       : ''
  const examLocation   = typeof extra.exam_location   === 'string' ? extra.exam_location   : ''
  const examStartTime  = typeof extra.exam_start_time === 'string' ? extra.exam_start_time : ''

  // 受講申請の複数講習日
  const courseDates: string[] = (() => {
    if (!isNew) return []
    const raw = extra.course_dates
    if (Array.isArray(raw) && raw.length > 0) return raw as string[]
    return enrollment.course_date ? [enrollment.course_date] : []
  })()

  // 更新・失効の単一講習日
  const renewalDate = !isNew ? (enrollment.course_date ?? '') : ''

  return (
    <div className="rounded-xl border border-lavender-100 px-4 py-1">
      {/* 申込種別バッジ行 */}
      <div className="grid grid-cols-[7rem_1fr] gap-x-3 text-sm py-2 border-b border-gray-50">
        <span className="text-gray-400 shrink-0">申込種別</span>
        <span>
          <span className={`inline-block px-2 py-0.5 rounded border text-[11px] font-bold ${TYPE_CLASS[appType] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
            {TYPE_LABEL[appType] ?? appType}
          </span>
        </span>
      </div>

      {/* メニューは受講申請のみ */}
      {isNew && <Row label="メニュー" value={dash(enrollment.menu)} />}

      {/* 受講申請：複数講習日 */}
      {isNew && (
        <div className="grid grid-cols-[7rem_1fr] gap-x-3 text-sm py-2 border-b border-gray-50">
          <span className="text-gray-400 shrink-0">講習日</span>
          <span className="text-gray-800">
            {courseDates.length > 0 ? (
              <span className="flex flex-col gap-0.5">
                {courseDates.map((d, i) => (
                  <span key={i}>{fmtDate(d) ?? '—'}</span>
                ))}
              </span>
            ) : '—'}
          </span>
        </div>
      )}

      {/* 更新・失効：単一講習日 */}
      {!isNew && (
        <Row label="講習日" value={fmtDate(renewalDate) ?? '—'} />
      )}

      <Row label="講習地"   value={dash(courseLocation)} />
      <Row label="講習時間" value={dash(courseTime)} />

      {/* 受講申請のみ：試験情報 */}
      {isNew && (
        <>
          <Row label="試験日"       value={fmtDate(examDate) ?? '—'} />
          <Row label="試験地"       value={dash(examLocation)} />
          <Row label="試験開始時間" value={dash(examStartTime)} />
        </>
      )}

      {/* ステータスバッジ行 */}
      <div className="grid grid-cols-[7rem_1fr] gap-x-3 text-sm py-2 border-b border-gray-50 last:border-0">
        <span className="text-gray-400 shrink-0">ステータス</span>
        <span>
          <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${STATUS_CLASS[enrollment.status] ?? 'bg-gray-100 text-gray-500'}`}>
            {STATUS_LABEL[enrollment.status] ?? enrollment.status}
          </span>
        </span>
      </div>

      {enrollment.note?.trim() && (
        <Row label="備考" value={enrollment.note} />
      )}
    </div>
  )
}

interface Props {
  student: Student
  enrollment: Enrollment
  onClose: () => void
  onUpdated: () => void
}

export default function ScheduleItemDetailModal({ student, enrollment, onClose, onUpdated }: Props) {
  const [currentStudent,    setCurrentStudent]    = useState(student)
  const [currentEnrollment, setCurrentEnrollment] = useState(enrollment)
  const [editingStudent,    setEditingStudent]    = useState(false)
  const [editingEnrollment, setEditingEnrollment] = useState(false)

  const handleEnrollmentSaved = async () => {
    setEditingEnrollment(false)
    onUpdated()
    // モーダル内の表示を最新に更新
    const list = await enrollmentsApi.list(currentStudent.id)
    const updated = list.find((e) => e.id === currentEnrollment.id)
    if (updated) setCurrentEnrollment(updated)
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col">

          {/* ヘッダー */}
          <div className="sticky top-0 bg-white border-b border-lavender-100 px-6 py-4 flex items-center justify-between rounded-t-2xl shrink-0">
            <div>
              <h2 className="text-base font-semibold text-gray-700">
                {currentStudent.last_name} {currentStudent.first_name}
              </h2>
              {(currentStudent.last_kana || currentStudent.first_kana) && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {currentStudent.last_kana} {currentStudent.first_kana}
                </p>
              )}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
          </div>

          {/* ボディ */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

            {/* ① 基本情報（先に表示） */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-lavender-400 uppercase tracking-wide">基本情報</h3>
                <button
                  type="button"
                  onClick={() => setEditingStudent(true)}
                  className="btn-secondary btn-sm"
                >
                  基本情報を編集
                </button>
              </div>
              <MemberBasicInfoReadOnly student={currentStudent} />
            </section>

            {/* ② 受講・申込情報（下に表示） */}
            <section className="border-t border-lavender-100 pt-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-lavender-400 uppercase tracking-wide">受講・申込情報</h3>
                <button
                  type="button"
                  onClick={() => setEditingEnrollment(true)}
                  className="btn-primary btn-sm"
                >
                  申込を編集
                </button>
              </div>
              <EnrollmentDetail enrollment={currentEnrollment} />
            </section>
          </div>

          {/* フッター */}
          <div className="shrink-0 px-6 py-4 border-t border-lavender-100 flex justify-end">
            <button type="button" onClick={onClose} className="btn-secondary">閉じる</button>
          </div>
        </div>
      </div>

      {/* 基本情報編集（z-[55]） */}
      {editingStudent && (
        <StudentForm
          student={currentStudent}
          onSaved={(s) => { setCurrentStudent(s); setEditingStudent(false); onUpdated() }}
          onCancel={() => setEditingStudent(false)}
        />
      )}

      {/* 申込編集（z-[60]） */}
      {editingEnrollment && (
        <EnrollmentFormModal
          studentId={currentStudent.id}
          enrollment={currentEnrollment}
          onClose={() => setEditingEnrollment(false)}
          onSaved={handleEnrollmentSaved}
        />
      )}
    </>
  )
}
