import { useEffect, useState } from 'react'
import type { Enrollment, ExamRecord, ExamRecordInput, ExamResult, ExamSession } from '../../types'
import { examRecordsApi } from '../../lib/api'

const QUAL_TYPES = ['一級', '二級', '特殊', '湖川'] as const
const RESULT_OPTIONS: ExamResult[] = ['合', '免', '否', '不']

interface Props {
  studentId: number
  record: ExamRecord | null
  examSessions: ExamSession[]
  enrollments: Enrollment[]
  onClose: () => void
  onSaved: () => void
}

function makeEmpty(studentId: number): ExamRecordInput {
  return {
    student_id: studentId,
    enrollment_id: null,
    qualification_type: '二級',
    shintai_cert: false,
    shintai_valid_until: null,
    gakka_session_id: null,
    gakka_exam_number: null,
    gakka_result: null,
    gakka_result_date: null,
    jitsugi_session_id: null,
    jitsugi_exam_number: null,
    jitsugi_result: null,
    jitsugi_result_date: null,
    note: null,
  }
}

export default function ExamRecordFormModal({
  studentId,
  record,
  examSessions,
  enrollments,
  onClose,
  onSaved,
}: Props) {
  const isCreating = !record

  const [form, setForm] = useState<ExamRecordInput>(() =>
    record
      ? {
          student_id: record.student_id,
          enrollment_id: record.enrollment_id,
          qualification_type: record.qualification_type,
          shintai_cert: record.shintai_cert,
          shintai_valid_until: record.shintai_valid_until,
          gakka_session_id: record.gakka_session_id,
          gakka_exam_number: record.gakka_exam_number,
          gakka_result: record.gakka_result,
          gakka_result_date: record.gakka_result_date,
          jitsugi_session_id: record.jitsugi_session_id,
          jitsugi_exam_number: record.jitsugi_exam_number,
          jitsugi_result: record.jitsugi_result,
          jitsugi_result_date: record.jitsugi_result_date,
          note: record.note,
        }
      : makeEmpty(studentId)
  )

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (record) {
      setForm({
        student_id: record.student_id,
        enrollment_id: record.enrollment_id,
        qualification_type: record.qualification_type,
        shintai_cert: record.shintai_cert,
        shintai_valid_until: record.shintai_valid_until,
        gakka_session_id: record.gakka_session_id,
        gakka_exam_number: record.gakka_exam_number,
        gakka_result: record.gakka_result,
        gakka_result_date: record.gakka_result_date,
        jitsugi_session_id: record.jitsugi_session_id,
        jitsugi_exam_number: record.jitsugi_exam_number,
        jitsugi_result: record.jitsugi_result,
        jitsugi_result_date: record.jitsugi_result_date,
        note: record.note,
      })
    } else {
      setForm(makeEmpty(studentId))
    }
    setError('')
  }, [record, studentId])

  function set<K extends keyof ExamRecordInput>(key: K, value: ExamRecordInput[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  const gakkaSessions = examSessions.filter(s => s.exam_type !== '実技')
  const jitsugiSessions = examSessions.filter(s => s.exam_type !== '学科')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.qualification_type) { setError('資格種別を選択してください'); return }
    setError('')
    setSaving(true)
    try {
      const payload: ExamRecordInput = {
        ...form,
        shintai_valid_until: form.shintai_cert ? (form.shintai_valid_until || null) : null,
        gakka_exam_number: form.gakka_exam_number?.trim() || null,
        gakka_result_date: form.gakka_result_date || null,
        jitsugi_exam_number: form.jitsugi_exam_number?.trim() || null,
        jitsugi_result_date: form.jitsugi_result_date || null,
        note: form.note?.trim() || null,
      }
      if (isCreating) {
        await examRecordsApi.create(payload)
      } else {
        await examRecordsApi.update(record.id, payload)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-white flex flex-col">

        {/* ヘッダー */}
        <div className="shrink-0 px-8 py-5 border-b border-lavender-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-700">
            {isCreating ? '試験記録を追加' : '試験記録を編集'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            tabIndex={-1}
          >
            ✕
          </button>
        </div>

        <form id="exam-record-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 py-4 space-y-4">
          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* 上段: 資格種別 | 関連申込 | 身体検査 */}
          <div className="grid grid-cols-3 gap-6">
            <div>
              <label className="field-label">
                資格種別<span className="text-red-400 ml-0.5">*</span>
              </label>
              <div className="flex gap-2">
                {QUAL_TYPES.map(q => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => set('qualification_type', q)}
                    className={`flex-1 py-1.5 rounded-lg border text-sm font-medium transition ${
                      form.qualification_type === q
                        ? 'bg-lavender-400 text-white border-lavender-400'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-lavender-300'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="field-label">関連申込（任意）</label>
              <select
                value={form.enrollment_id ?? ''}
                onChange={e => set('enrollment_id', e.target.value ? Number(e.target.value) : null)}
                className="field-select"
              >
                <option value="">-- なし --</option>
                {enrollments.map(en => (
                  <option key={en.id} value={en.id}>
                    {en.menu}{en.course_date ? ` (${en.course_date})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">身体検査</label>
              <div className="flex items-center gap-3 mt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.shintai_cert}
                    onChange={e => set('shintai_cert', e.target.checked)}
                    className="rounded border-gray-300 text-lavender-400 focus:ring-lavender-300"
                  />
                  <span className="text-sm text-gray-700">証明書あり</span>
                </label>
                {form.shintai_cert && (
                  <input
                    type="date"
                    value={form.shintai_valid_until ?? ''}
                    onChange={e => set('shintai_valid_until', e.target.value || null)}
                    className="field-input flex-1"
                  />
                )}
              </div>
              {form.shintai_cert && (
                <p className="text-xs text-gray-400 mt-0.5">有効期限</p>
              )}
            </div>
          </div>

          {/* 下段: 学科試験 ｜ 実技試験 （左右2カラム） */}
          <div className="grid grid-cols-2 gap-6">

            {/* 学科試験 */}
            <fieldset className="border border-lavender-100 rounded-xl p-4 space-y-3">
              <legend className="text-xs font-semibold text-lavender-400 uppercase tracking-wide px-1">学科試験</legend>
              <div>
                <label className="field-label">試験日程</label>
                <select
                  value={form.gakka_session_id ?? ''}
                  onChange={e => set('gakka_session_id', e.target.value ? Number(e.target.value) : null)}
                  className="field-select"
                >
                  <option value="">-- 未選択 --</option>
                  {gakkaSessions.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.exam_date} {s.exam_location} ({s.exam_id})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">受験番号</label>
                  <input
                    type="text"
                    value={form.gakka_exam_number ?? ''}
                    onChange={e => set('gakka_exam_number', e.target.value || null)}
                    className="field-input"
                    placeholder="例：00123"
                  />
                </div>
                <div>
                  <label className="field-label">判定日</label>
                  <input
                    type="date"
                    value={form.gakka_result_date ?? ''}
                    onChange={e => set('gakka_result_date', e.target.value || null)}
                    className="field-input"
                  />
                </div>
              </div>
              <div>
                <label className="field-label">結果</label>
                <div className="flex gap-2">
                  {RESULT_OPTIONS.map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => set('gakka_result', form.gakka_result === r ? null : r)}
                      className={`flex-1 py-1.5 rounded-lg border text-sm font-bold transition ${
                        form.gakka_result === r
                          ? r === '合' || r === '免'
                            ? 'bg-mint-400 text-white border-mint-400'
                            : 'bg-red-400 text-white border-red-400'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-lavender-300'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </fieldset>

            {/* 実技試験 */}
            <fieldset className="border border-lavender-100 rounded-xl p-4 space-y-3">
              <legend className="text-xs font-semibold text-lavender-400 uppercase tracking-wide px-1">実技試験</legend>
              <div>
                <label className="field-label">試験日程</label>
                <select
                  value={form.jitsugi_session_id ?? ''}
                  onChange={e => set('jitsugi_session_id', e.target.value ? Number(e.target.value) : null)}
                  className="field-select"
                >
                  <option value="">-- 未選択 --</option>
                  {jitsugiSessions.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.exam_date} {s.exam_location} ({s.exam_id})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">受験番号</label>
                  <input
                    type="text"
                    value={form.jitsugi_exam_number ?? ''}
                    onChange={e => set('jitsugi_exam_number', e.target.value || null)}
                    className="field-input"
                    placeholder="例：00123"
                  />
                </div>
                <div>
                  <label className="field-label">判定日</label>
                  <input
                    type="date"
                    value={form.jitsugi_result_date ?? ''}
                    onChange={e => set('jitsugi_result_date', e.target.value || null)}
                    className="field-input"
                  />
                </div>
              </div>
              <div>
                <label className="field-label">結果</label>
                <div className="flex gap-2">
                  {RESULT_OPTIONS.map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => set('jitsugi_result', form.jitsugi_result === r ? null : r)}
                      className={`flex-1 py-1.5 rounded-lg border text-sm font-bold transition ${
                        form.jitsugi_result === r
                          ? r === '合' || r === '免'
                            ? 'bg-mint-400 text-white border-mint-400'
                            : 'bg-red-400 text-white border-red-400'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-lavender-300'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </fieldset>
          </div>

          {/* 備考 */}
          <div>
            <label className="field-label">備考</label>
            <textarea
              value={form.note ?? ''}
              onChange={e => set('note', e.target.value || null)}
              className="field-input resize-y"
              rows={2}
            />
          </div>

        </div>
        </form>
        {/* sticky footer */}
        <div className="shrink-0 border-t border-lavender-100 bg-white">
          <div className="max-w-6xl mx-auto px-8 py-5 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">キャンセル</button>
            <button type="submit" form="exam-record-form" disabled={saving} className="btn-primary min-w-[88px] disabled:opacity-40">
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
    </div>
  )
}
