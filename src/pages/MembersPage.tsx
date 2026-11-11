import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { Enrollment, ExamRecord, ExamResult, ExamSession, Student } from '../types'
import { studentsApi, enrollmentsApi, examRecordsApi, examSessionsApi } from '../lib/api'
import StudentForm from '../components/students/StudentForm'
import DateTextInput from '../components/DateTextInput'
import PhysicalExamSection from '../components/students/PhysicalExamSection'
import PrevExamMissingBadge from '../components/students/PrevExamMissingBadge'
import { PASS_VALID_YEARS, expiryAfterYears, fmtYmd, validityStatus } from '../lib/validity'
import EnrollmentFormModal from '../components/students/EnrollmentFormModal'
import ExamRecordFormModal from '../components/students/ExamRecordFormModal'

function formatDate(d: string | null) {
  if (!d) return '—'
  try {
    return format(new Date(d), 'yyyy/M/d(E)', { locale: ja })
  } catch {
    return d
  }
}

function birthWithAge(d: string | null): React.ReactNode {
  if (!d) return <span className="text-gray-300">—</span>
  const [y, m, day] = d.split('-').map(Number)
  if (!y || !m || !day) return d
  const t = new Date()
  let age = t.getFullYear() - y
  if (t.getMonth() + 1 < m || (t.getMonth() + 1 === m && t.getDate() < day)) age--
  return <>{`${y}/${m}/${day}`}<span className="text-gray-400 ml-1">（{age}歳）</span></>
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
  return <span className={`inline-block px-1.5 py-0 rounded border text-[12px] font-bold ${cls}`}>{result}</span>
}

function ExamRecordCard({ record, sessions, onEdit }: {
  record: ExamRecord
  sessions: ExamSession[]
  onEdit: () => void
}) {
  const gakka = sessions.find(s => s.id === record.gakka_session_id)
  const jitsugi = sessions.find(s => s.id === record.jitsugi_session_id)

  // 合格の有効期限（合格から2年）：判定日があれば判定日から、無ければ試験日から
  const passExpiry = (result: ExamResult, resultDate: string | null, examDate: string | undefined) =>
    result === '合' ? expiryAfterYears(resultDate || examDate || null, PASS_VALID_YEARS) : ''
  const gakkaExp = passExpiry(record.gakka_result, record.gakka_result_date, gakka?.exam_date)
  const jitsugiExp = passExpiry(record.jitsugi_result, record.jitsugi_result_date, jitsugi?.exam_date)
  const ExpiryNote = ({ until }: { until: string }) => {
    if (!until) return null
    const st = validityStatus(until)
    const cls = st === 'expired' ? 'text-gray-400 line-through' : st === 'soon' ? 'text-amber-700 font-semibold' : 'text-mint-600'
    return <span className={`text-xs ${cls}`}>合格有効 {fmtYmd(until)} まで{st === 'expired' ? '（期限切れ）' : st === 'soon' ? '（まもなく期限）' : ''}</span>
  }

  return (
    <li className="rounded-xl border border-lavender-100 bg-lavender-50/40 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-lavender-600 bg-white px-2 py-0.5 rounded border border-lavender-100">
          {record.qualification_type}
        </span>
        <button type="button" onClick={onEdit} className="btn-secondary btn-sm">編集</button>
      </div>

      <div className="text-sm space-y-1">
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
          <ExpiryNote until={gakkaExp} />
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
          <ExpiryNote until={jitsugiExp} />
        </div>
      </div>
    </li>
  )
}

export default function MembersPage() {
  const navigate = useNavigate()
  const [students, setStudents] = useState<Student[]>([])
  const [query, setQuery] = useState('')
  // 追加の絞り込み・並び順
  const [fBirth, setFBirth] = useState('')
  const [fPhone, setFPhone] = useState('')
  const [fAddress, setFAddress] = useState('')
  const [sortBy, setSortBy] = useState<'last_kana' | 'birth_date' | 'updated_at'>('last_kana')
  const filterCount = [fBirth, fPhone.trim(), fAddress.trim()].filter(Boolean).length
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [loadingEnrollments, setLoadingEnrollments] = useState(false)

  const [examRecords, setExamRecords] = useState<ExamRecord[]>([])
  const [examSessions, setExamSessions] = useState<ExamSession[]>([])
  const [examRecordModal, setExamRecordModal] = useState<{ record: ExamRecord | null } | null>(null)

  const [dirty, setDirty] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
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

  // 検索（デバウンス300ms）。氏名などのキーワード＋追加条件（生年月日・電話・住所）
  useEffect(() => {
    const q = query.trim()
    const phoneDigits = fPhone.replace(/[^0-9]/g, '')
    if (!q && !fBirth && !phoneDigits && !fAddress.trim()) {
      setStudents([])
      setHasSearched(false)
      setSelectedId(null)
      return
    }
    setSelectedId(null)
    const timer = setTimeout(async () => {
      setLoading(true)
      setHasSearched(true)
      const list = await studentsApi.list({
        query: q,
        birthDate: fBirth || undefined,
        phone: phoneDigits || undefined,
        address: fAddress.trim() || undefined,
        sortBy,
        sortDir: sortBy === 'updated_at' ? 'desc' : 'asc',
      })
      setStudents(list)
      setLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, fBirth, fPhone, fAddress, sortBy])

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

  // 検索結果内の同姓同名
  const nameCount = new Map<string, number>()
  for (const st of students) {
    const k = `${st.last_name}${st.first_name}`
    nameCount.set(k, (nameCount.get(k) ?? 0) + 1)
  }

  const selected = selectedId != null ? students.find((s) => s.id === selectedId) ?? null : null

  const handleDeleteEnrollment = async (e: Enrollment) => {
    if (!window.confirm('この申込を削除しますか？\n会員の基本情報は残ります。')) return
    await enrollmentsApi.delete(e.id)
    if (selectedId != null) await loadEnrollments(selectedId)
  }

  // 検索結果から会員を開く／検索結果へ戻る（未保存の変更があれば確認）
  const openMember = (id: number) => {
    setDirty(false)
    setSelectedId(id)
  }
  const backToSearch = () => {
    if (dirty && !window.confirm('保存していない変更があります。破棄して検索結果に戻りますか？')) return
    setDirty(false)
    setSelectedId(null)
  }

  const handleMigrateKana = async () => {
    if (!window.confirm('既存の会員情報のフリガナを全てカタカナに統一しますか？\nこの操作は元に戻せません。')) return
    await studentsApi.migrateKana()
    alert('フリガナの統一が完了しました。')
  }

  return (
    <div className="h-screen overflow-hidden bg-gradient-to-br from-lavender-50 via-white to-mint-50 flex flex-col">
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

      {selected ? (
        /* ── 会員画面（検索結果から切り替えて全面表示） ── */
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="shrink-0 bg-white border-b border-lavender-100">
            <div className="max-w-6xl mx-auto px-8 pt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={backToSearch}
                className="text-lavender-500 hover:text-lavender-700 text-sm font-medium flex items-center gap-1 transition"
              >
                ← 検索結果に戻る
              </button>
              <span className="text-lavender-200">|</span>
              <h2 className="text-lg font-bold text-gray-800">
                {selected.last_name} {selected.first_name}
              </h2>
              {(selected.last_kana || selected.first_kana) && (
                <span className="text-sm text-gray-400">{selected.last_kana} {selected.first_kana}</span>
              )}
              {selected.student_code && (
                <span className="text-xs text-lavender-400 font-mono">#{selected.student_code}</span>
              )}
              {savedFlash && (
                <span className="ml-auto text-sm font-medium text-mint-500">✓ 保存しました</span>
              )}
            </div>
            <div className="max-w-6xl mx-auto px-6">
                {/* タブバー */}
                <div className="flex gap-1">
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
                        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                          detailTab === tab.key ? 'bg-lavender-100 text-lavender-600' : 'bg-gray-100 text-gray-400'
                        }`}>
                          {tab.count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

            </div>
          </div>

          {/* 基本情報：新規入力と同じ編集画面（タブを切り替えても入力中の内容は保持） */}
          <div className={detailTab === 'basic' ? 'flex-1 min-h-0 flex flex-col' : 'hidden'}>
            <StudentForm
              key={selected.id}
              embedded
              student={selected}
              onDirtyChange={setDirty}
              onSaved={(s) => {
                setStudents((prev) => prev.map((x) => (x.id === s.id ? s : x)))
                setSavedFlash(true)
                setTimeout(() => setSavedFlash(false), 2500)
              }}
              onCancel={backToSearch}
            />
          </div>

          {detailTab !== 'basic' && (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="max-w-6xl mx-auto px-8 py-5">

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
                                  <PrevExamMissingBadge enrollment={e} long />
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
                                  {e.note?.trim() && (
                                    <div className="whitespace-pre-wrap">
                                      <span className="text-gray-400 text-xs mr-2">備　考</span>
                                      {e.note}
                                    </div>
                                  )}
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
                      <PhysicalExamSection studentId={selected.id} />
                      <div className="flex items-center justify-between pt-3 border-t border-dashed border-lavender-100">
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
      ) : (
      <main className="flex-1 flex flex-col min-h-0 px-6 py-6 max-w-6xl w-full mx-auto gap-4">
          {/* 検索＋一覧 */}
          <div className="flex flex-col min-h-0 flex-1 border border-lavender-100 rounded-xl bg-white overflow-hidden">
            <div className="p-4 border-b border-lavender-100 shrink-0 space-y-3">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="氏名・フリガナ・受講者番号・電話・メールで検索（例：山田 太郎）"
                className="field-input"
                autoFocus
              />
              {/* 追加条件：同姓同名の見分け用 */}
              <div className="grid grid-cols-[11rem_12rem_1fr_auto_auto] gap-3 items-end">
                <div>
                  <label className="field-label">生年月日</label>
                  <DateTextInput value={fBirth} onChange={setFBirth} />
                </div>
                <div>
                  <label className="field-label">電話・携帯</label>
                  <input type="tel" value={fPhone} onChange={(e) => setFPhone(e.target.value)} placeholder="下4桁でも可" className="field-input" />
                </div>
                <div>
                  <label className="field-label">住所</label>
                  <input type="search" value={fAddress} onChange={(e) => setFAddress(e.target.value)} placeholder="市区町村・町名など" className="field-input" />
                </div>
                <div>
                  <label className="field-label">並び順</label>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="field-select">
                    <option value="last_kana">フリガナ順</option>
                    <option value="birth_date">生年月日順</option>
                    <option value="updated_at">更新が新しい順</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => { setFBirth(''); setFPhone(''); setFAddress('') }}
                  disabled={filterCount === 0}
                  className="btn-secondary btn-sm mb-1 disabled:opacity-40"
                >
                  条件クリア
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto min-h-[200px]">
              {!hasSearched ? (
                <p className="text-center text-gray-400 text-sm py-10 px-4">
                  氏名などを入力して検索してください。同姓同名の方は、生年月日・電話・住所で絞り込めます
                </p>
              ) : loading ? (
                <p className="text-center text-gray-400 text-sm py-10">検索中…</p>
              ) : students.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-10">該当する会員がいません</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th className="table-head-cell">氏名 <span className="ml-1 normal-case font-normal">{students.length}件</span></th>
                      <th className="table-head-cell">生年月日</th>
                      <th className="table-head-cell">住所</th>
                      <th className="table-head-cell">電話・携帯</th>
                      <th className="table-head-cell">受講者番号</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => {
                      const sameName = (nameCount.get(`${s.last_name}${s.first_name}`) ?? 0) > 1
                      return (
                        <tr key={s.id} onClick={() => openMember(s.id)} className="table-row">
                          <td className="table-cell">
                            <div className="font-semibold text-gray-800 flex items-center gap-2">
                              {s.last_name} {s.first_name}
                              {sameName && (
                                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">同姓同名</span>
                              )}
                            </div>
                            {(s.last_kana || s.first_kana) && (
                              <div className="text-xs text-gray-400">{s.last_kana} {s.first_kana}</div>
                            )}
                          </td>
                          <td className="table-cell whitespace-nowrap">{birthWithAge(s.birth_date)}</td>
                          <td className="table-cell">
                            {[s.prefecture, s.city].filter(Boolean).join('') || <span className="text-gray-300">—</span>}
                            {s.address1 && <span className="text-gray-400 ml-1">{s.address1}</span>}
                          </td>
                          <td className="table-cell whitespace-nowrap">
                            {s.phone || s.mobile
                              ? <>{s.phone && <div>{s.phone}</div>}{s.mobile && <div className={s.phone ? 'text-xs text-gray-400' : ''}>{s.mobile}</div>}</>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="table-cell font-mono text-xs text-lavender-500">{s.student_code ?? '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
      </main>
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
