import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { Enrollment, ExamRecord, ExamResult, ExamSession, Student } from '../types'
import { studentsApi, enrollmentsApi, examRecordsApi, examSessionsApi } from '../lib/api'
import StudentForm from '../components/students/StudentForm'
import EnrollmentFormModal from '../components/students/EnrollmentFormModal'
import ExamRecordFormModal from '../components/students/ExamRecordFormModal'
import MemberBasicInfoReadOnly from '../components/students/MemberBasicInfoReadOnly'

function formatDate(d: string | null) {
  if (!d) return '—'
  try {
    return format(new Date(d), 'yyyy/M/d(E)', { locale: ja })
  } catch {
    return d
  }
}

function courseTimeFromExtra(e: Enrollment): string {
  try {
    const j = JSON.parse(e.extra_json)
    return typeof j.course_time === 'string' ? j.course_time : ''
  } catch {
    return ''
  }
}


const TYPE_LABEL: Record<string, string> = {
  new: '試験申請',
  renewal: '更新講習',
  lapsed: '失効再交付',
}

function appTypeLabel(e: Enrollment): string {
  try {
    const t = JSON.parse(e.extra_json).application_type
    return TYPE_LABEL[t as string] ?? '試験申請'
  } catch {
    return '試験申請'
  }
}

function ResultBadge({ result }: { result: ExamResult }) {
  if (!result) return <span className="text-gray-400 text-xs">未</span>
  const cls = result === '合' || result === '免'
    ? 'bg-mint-50 text-mint-600 border-mint-200'
    : 'bg-red-50 text-red-500 border-red-200'
  return <span className={`inline-block px-1.5 py-0 rounded border text-[11px] font-bold ${cls}`}>{result}</span>
}

function ExamRecordCard({ record, sessions, onEdit }: {
  record: ExamRecord
  sessions: ExamSession[]
  onEdit: () => void
}) {
  const gakka = sessions.find(s => s.id === record.gakka_session_id)
  const jitsugi = sessions.find(s => s.id === record.jitsugi_session_id)

  const today = new Date().toISOString().slice(0, 10)
  const shintaiExpired = record.shintai_valid_until && record.shintai_valid_until < today
  const shintaiSoon = record.shintai_valid_until && !shintaiExpired &&
    record.shintai_valid_until < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  return (
    <li className="rounded-xl border border-lavender-100 bg-lavender-50/40 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-lavender-600 bg-white px-2 py-0.5 rounded border border-lavender-100">
          {record.qualification_type}
        </span>
        <button type="button" onClick={onEdit} className="btn-secondary btn-sm">編集</button>
      </div>

      <div className="text-sm space-y-1">
        {/* 身体検査 */}
        {record.shintai_cert && (
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-xs w-16 shrink-0">身体検査</span>
            {record.shintai_valid_until ? (
              <span className={`text-xs font-medium ${
                shintaiExpired ? 'text-red-500' : shintaiSoon ? 'text-orange-500' : 'text-mint-600'
              }`}>
                {record.shintai_valid_until} まで有効
                {shintaiExpired ? '（期限切れ）' : shintaiSoon ? '（もうすぐ期限）' : ''}
              </span>
            ) : <span className="text-gray-600 text-xs">証明書あり</span>}
          </div>
        )}

        {/* 学科 */}
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-xs w-16 shrink-0">学科</span>
          {gakka ? (
            <span className="text-gray-700 text-xs">{gakka.exam_date} {gakka.exam_location}</span>
          ) : <span className="text-gray-400 text-xs">未設定</span>}
          {record.gakka_exam_number && (
            <span className="text-gray-400 text-xs">受{record.gakka_exam_number}</span>
          )}
          <ResultBadge result={record.gakka_result} />
        </div>

        {/* 実技 */}
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-xs w-16 shrink-0">実技</span>
          {jitsugi ? (
            <span className="text-gray-700 text-xs">{jitsugi.exam_date} {jitsugi.exam_location}</span>
          ) : <span className="text-gray-400 text-xs">未設定</span>}
          {record.jitsugi_exam_number && (
            <span className="text-gray-400 text-xs">受{record.jitsugi_exam_number}</span>
          )}
          <ResultBadge result={record.jitsugi_result} />
        </div>
      </div>
    </li>
  )
}

export default function MembersPage() {
  const navigate = useNavigate()
  const [students, setStudents] = useState<Student[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [loadingEnrollments, setLoadingEnrollments] = useState(false)

  const [examRecords, setExamRecords] = useState<ExamRecord[]>([])
  const [examSessions, setExamSessions] = useState<ExamSession[]>([])
  const [examRecordModal, setExamRecordModal] = useState<{ record: ExamRecord | null } | null>(null)

  const [memberToEdit, setMemberToEdit] = useState<Student | null>(null)
  const [enrollmentModal, setEnrollmentModal] = useState<{
    enrollment: Enrollment | null
  } | null>(null)

  const [detailTab, setDetailTab] = useState<'basic' | 'enrollment' | 'exam'>('basic')

  useEffect(() => {
    setDetailTab('basic')
  }, [selectedId])

  // 試験日程は初回のみ取得
  useEffect(() => {
    examSessionsApi.list().then(setExamSessions).catch(() => {})
  }, [])

  // 検索（デバウンス300ms）
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setStudents([])
      setHasSearched(false)
      setSelectedId(null)
      return
    }
    setSelectedId(null)
    const timer = setTimeout(async () => {
      setLoading(true)
      setHasSearched(true)
      const list = await studentsApi.list({ query: q, sortBy: 'last_kana', sortDir: 'asc' })
      setStudents(list)
      setLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const loadEnrollments = useCallback(async (studentId: number) => {
    setLoadingEnrollments(true)
    const list = await enrollmentsApi.list(studentId)
    setEnrollments(list)
    setLoadingEnrollments(false)
  }, [])

  useEffect(() => {
    if (selectedId == null) {
      setEnrollments([])
      setExamRecords([])
      return
    }
    loadEnrollments(selectedId)
    examRecordsApi.list(selectedId).then(setExamRecords).catch(() => {})
  }, [selectedId, loadEnrollments])

  const selected = selectedId != null ? students.find((s) => s.id === selectedId) ?? null : null

  const handleDeleteEnrollment = async (e: Enrollment) => {
    if (!window.confirm('この申込を削除しますか？\n会員の基本情報は残ります。')) return
    await enrollmentsApi.delete(e.id)
    if (selectedId != null) await loadEnrollments(selectedId)
  }

  const handleMigrateKana = async () => {
    if (!window.confirm('既存の会員情報のフリガナを全てカタカナに統一しますか？\nこの操作は元に戻せません。')) return
    await studentsApi.migrateKana()
    alert('フリガナの統一が完了しました。')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-lavender-50 via-white to-mint-50 flex flex-col">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-lavender-100 px-6 py-4 flex flex-wrap items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="text-lavender-500 hover:text-lavender-700 text-sm font-medium flex items-center gap-1.5 transition"
        >
          ← トップメニューへ戻る
        </button>
        <span className="text-lavender-200 hidden sm:inline">|</span>
        <h1 className="text-base font-bold text-gray-700">👤 会員一覧</h1>
        <span className="text-xs text-gray-400">基本情報・講習日程・申込の管理</span>
        <div className="ml-auto flex gap-2">
          <button onClick={handleMigrateKana} className="btn-secondary text-xs">
            フリガナ統一
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col min-h-0 px-6 py-6 max-w-6xl w-full mx-auto gap-4">
        <div className="flex flex-1 min-h-0 gap-4 flex-col lg:flex-row">

          {/* 左：検索＋一覧 */}
          <div className="flex flex-col min-h-0 lg:w-[340px] shrink-0 border border-lavender-100 rounded-xl bg-white overflow-hidden">
            <div className="p-3 border-b border-lavender-100 shrink-0">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="氏名・フリガナ・受講者番号で検索"
                className="field-input text-sm"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto min-h-[200px]">
              {!hasSearched ? (
                <p className="text-center text-gray-400 text-sm py-10 px-4">
                  氏名・フリガナ・受講者番号で検索してください
                </p>
              ) : loading ? (
                <p className="text-center text-gray-400 text-sm py-10">検索中…</p>
              ) : students.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-10">該当する会員がいません</p>
              ) : (
                <>
                  <p className="text-[11px] text-gray-400 px-4 py-2">{students.length}件</p>
                  {students.map((s) => {
                    const active = s.id === selectedId
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedId(s.id)}
                        className={[
                          'w-full text-left px-4 py-2.5 border-b border-gray-50 transition',
                          active ? 'bg-lavender-50 border-l-[3px] border-l-lavender-400 pl-[13px]' : 'hover:bg-gray-50',
                        ].join(' ')}
                      >
                        <div className="text-sm font-medium text-gray-700">
                          {s.last_name} {s.first_name}
                        </div>
                        {(s.last_kana || s.first_kana) && (
                          <div className="text-[11px] text-gray-400 mt-0.5">
                            {s.last_kana} {s.first_kana}
                          </div>
                        )}
                        {s.student_code && (
                          <span className="text-[10px] text-lavender-400 font-mono">#{s.student_code}</span>
                        )}
                      </button>
                    )
                  })}
                </>
              )}
            </div>
          </div>

          {/* 右：詳細 */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0 border border-lavender-100 rounded-xl bg-white overflow-hidden">
            {!selected ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm p-8">
                左の一覧から会員を選択してください
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

                {/* タブバー */}
                <div className="shrink-0 border-b border-lavender-100 px-4 flex gap-1 bg-white">
                  {(
                    [
                      { key: 'basic',      label: '基本情報',  count: null },
                      { key: 'enrollment', label: '受講履歴',  count: enrollments.length },
                      { key: 'exam',       label: '試験記録',  count: examRecords.length },
                    ] as const
                  ).map(tab => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setDetailTab(tab.key)}
                      className={[
                        'px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap flex items-center gap-1.5',
                        detailTab === tab.key
                          ? 'border-lavender-400 text-lavender-600'
                          : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-200',
                      ].join(' ')}
                    >
                      {tab.label}
                      {tab.count != null && tab.count > 0 && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          detailTab === tab.key ? 'bg-lavender-100 text-lavender-600' : 'bg-gray-100 text-gray-400'
                        }`}>
                          {tab.count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* コンテンツ */}
                <div className="flex-1 overflow-y-auto min-h-0 p-4">

                  {detailTab === 'basic' && (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-sm font-semibold text-gray-600">基本情報</h2>
                        <button type="button" onClick={() => setMemberToEdit(selected)} className="btn-primary btn-sm shrink-0">編集</button>
                      </div>
                      <MemberBasicInfoReadOnly student={selected} />
                    </div>
                  )}

                  {detailTab === 'enrollment' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-600">受講履歴</h3>
                        <button type="button" onClick={() => setEnrollmentModal({ enrollment: null })} className="btn-primary btn-sm">＋ 申込を追加</button>
                      </div>
                      {loadingEnrollments ? (
                        <p className="text-sm text-gray-400 py-6">読み込み中…</p>
                      ) : enrollments.length === 0 ? (
                        <p className="text-sm text-gray-400 py-6">申込がありません。「申込を追加」で講習日程を登録できます。</p>
                      ) : (
                        <ul className="space-y-3">
                          {enrollments.map((e) => {
                            const ct = courseTimeFromExtra(e)
                            return (
                              <li
                                key={e.id}
                                className="rounded-xl border border-lavender-100 bg-lavender-50/40 p-4"
                              >
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                  <span className="text-xs font-bold text-lavender-600 bg-white px-2 py-0.5 rounded border border-lavender-100">
                                    {appTypeLabel(e)}
                                  </span>
                                  {JSON.parse(e.extra_json ?? '{}').application_type === 'new' && e.menu && (
                                    <span className="text-xs text-gray-400">{e.menu}</span>
                                  )}
                                </div>
                                <div className="text-sm text-gray-700 space-y-1">
                                  <div>
                                    <span className="text-gray-400 text-xs mr-2">講習日</span>
                                    {formatDate(e.course_date)}
                                    {ct && <span className="ml-2 text-lavender-600 font-medium">{ct}</span>}
                                  </div>
                                  <div>
                                    <span className="text-gray-400 text-xs mr-2">会　場</span>
                                    {e.venue || '—'}
                                  </div>
                                  <div>
                                    <span className="text-gray-400 text-xs mr-2">ステータス</span>
                                    {e.status}
                                  </div>
                                </div>
                                <div className="flex gap-2 mt-3">
                                  <button
                                    type="button"
                                    onClick={() => setEnrollmentModal({ enrollment: e })}
                                    className="btn-secondary btn-sm"
                                  >
                                    日程・申込を編集
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteEnrollment(e)}
                                    className="btn-danger btn-sm"
                                  >
                                    申込削除
                                  </button>
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  )}

                  {detailTab === 'exam' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-600">試験記録</h3>
                        <button type="button" onClick={() => setExamRecordModal({ record: null })} className="btn-primary btn-sm">＋ 試験記録を追加</button>
                      </div>
                      {examRecords.length === 0 ? (
                        <p className="text-sm text-gray-400 py-4">試験記録がありません。</p>
                      ) : (
                        <ul className="space-y-3">
                          {examRecords.map(r => (
                            <ExamRecordCard key={r.id} record={r} sessions={examSessions} onEdit={() => setExamRecordModal({ record: r })} />
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                </div>
              </div>
            )}
          </div>

        </div>
      </main>

      {memberToEdit && (
        <StudentForm
          student={memberToEdit}
          onSaved={(s) => {
            setMemberToEdit(null)
            setStudents((prev) => prev.map((x) => (x.id === s.id ? s : x)))
          }}
          onCancel={() => setMemberToEdit(null)}
        />
      )}

      {enrollmentModal && selected && (
        <EnrollmentFormModal
          studentId={selected.id}
          enrollment={enrollmentModal.enrollment}
          onClose={() => setEnrollmentModal(null)}
          onSaved={() => {
            setEnrollmentModal(null)
            loadEnrollments(selected.id)
          }}
        />
      )}

      {examRecordModal && selected && (
        <ExamRecordFormModal
          studentId={selected.id}
          record={examRecordModal.record}
          examSessions={examSessions}
          enrollments={enrollments}
          onClose={() => setExamRecordModal(null)}
          onSaved={async () => {
            setExamRecordModal(null)
            const updated = await examRecordsApi.list(selected.id)
            setExamRecords(updated)
          }}
        />
      )}
    </div>
  )
}
