import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { Enrollment, Student } from '../types'
import { studentsApi, enrollmentsApi } from '../lib/api'
import StudentForm from '../components/students/StudentForm'
import EnrollmentFormModal from '../components/students/EnrollmentFormModal'
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
  new: '受講申請',
  renewal: '更新講習',
  lapsed: '失効再交付',
}

function appTypeLabel(e: Enrollment): string {
  try {
    const t = JSON.parse(e.extra_json).application_type
    return TYPE_LABEL[t as string] ?? '受講申請'
  } catch {
    return '受講申請'
  }
}

export default function MembersPage() {
  const navigate = useNavigate()
  const [students, setStudents] = useState<Student[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [loadingEnrollments, setLoadingEnrollments] = useState(false)

  const [memberToEdit, setMemberToEdit] = useState<Student | null>(null)
  const [enrollmentModal, setEnrollmentModal] = useState<{
    enrollment: Enrollment | null
  } | null>(null)

  const loadStudents = useCallback(async () => {
    setLoading(true)
    const list = await studentsApi.list({
      sortBy: 'last_kana',
      sortDir: 'asc',
    })
    setStudents(list)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadStudents()
  }, [loadStudents])

  const loadEnrollments = useCallback(async (studentId: number) => {
    setLoadingEnrollments(true)
    const list = await enrollmentsApi.list(studentId)
    setEnrollments(list)
    setLoadingEnrollments(false)
  }, [])

  useEffect(() => {
    if (selectedId == null) {
      setEnrollments([])
      return
    }
    loadEnrollments(selectedId)
  }, [selectedId, loadEnrollments])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return students
    return students.filter((s) => {
      const hay = [
        s.last_name,
        s.first_name,
        s.last_kana,
        s.first_kana,
        s.email,
        s.phone,
        s.mobile,
        s.student_code,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [students, query])

  const selected = selectedId != null ? students.find((s) => s.id === selectedId) ?? null : null

  const handleDeleteEnrollment = async (e: Enrollment) => {
    if (!window.confirm('この申込を削除しますか？\n会員の基本情報は残ります。')) return
    await enrollmentsApi.delete(e.id)
    if (selectedId != null) await loadEnrollments(selectedId)
  }

  const handleMigrateKana = async () => {
    if (!window.confirm('既存の会員情報のフリガナを全てカタカナに統一しますか？\nこの操作は元に戻せません。')) return
    await studentsApi.migrateKana()
    await loadStudents()
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
          <button
            onClick={handleMigrateKana}
            className="btn-secondary text-xs"
          >
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
              placeholder="氏名・かな・電話・メール・番号で検索"
              className="field-input text-sm"
            />
          </div>
          <div className="flex-1 overflow-y-auto min-h-[200px]">
            {loading ? (
              <p className="text-center text-gray-400 text-sm py-10">読み込み中…</p>
            ) : filtered.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-10">該当する会員がいません</p>
            ) : (
              filtered.map((s) => {
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
              })
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
              <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-8">
                <section>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h2 className="text-sm font-semibold text-gray-600">基本情報</h2>
                    <button
                      type="button"
                      onClick={() => setMemberToEdit(selected)}
                      className="btn-primary btn-sm shrink-0"
                    >
                      編集
                    </button>
                  </div>
                  <MemberBasicInfoReadOnly student={selected} />
                </section>

                <section className="border-t border-lavender-100 pt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-600">受講・申込</h3>
                  <button
                    type="button"
                    onClick={() => setEnrollmentModal({ enrollment: null })}
                    className="btn-primary btn-sm"
                  >
                    ＋ 申込を追加
                  </button>
                </div>

                {loadingEnrollments ? (
                  <p className="text-sm text-gray-400 py-6">読み込み中…</p>
                ) : enrollments.length === 0 ? (
                  <p className="text-sm text-gray-400 py-6">
                    申込がありません。「申込を追加」で講習日程を登録できます。
                  </p>
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
                            <span className="text-xs text-gray-400">{e.menu}</span>
                          </div>
                          <div className="text-sm text-gray-700 space-y-1">
                            <div>
                              <span className="text-gray-400 text-xs mr-2">講習日</span>
                              {formatDate(e.course_date)}
                              {ct ? (
                                <span className="ml-2 text-lavender-600 font-medium">{ct}</span>
                              ) : null}
                            </div>
                            <div>
                              <span className="text-gray-400 text-xs mr-2">会場</span>
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
                </section>
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
    </div>
  )
}
