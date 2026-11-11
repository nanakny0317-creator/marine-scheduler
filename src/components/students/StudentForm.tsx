/**
 * 受講者入力フォーム
 * - Tab/Enter だけで全操作完結
 * - 郵便番号→住所自動入力
 * - 重複チェック
 */
import { useEffect, useRef, useState } from 'react'
import type {
  Student, StudentInput, DuplicateCheckResult,
  ExamSession, ExamResult,
} from '../../types'
import {
  studentsApi, pendingReviewsApi, fetchAddressByZip,
  enrollmentsApi, examRecordsApi, examSessionsApi, physicalExamsApi,
} from '../../lib/api'
import DuplicateResolutionModal from './DuplicateResolutionModal'
import Section from '../FormSection'
import DateTextInput from '../DateTextInput'
import { PHYSICAL_VALID_YEARS, expiryAfterYears, fmtYmd } from '../../lib/validity'
import { useEnrollmentForm } from './EnrollmentFormModal'
import { LICENSE_CLASSES, LICENSE_OPTIONS, OLD_LICENSE_CLASSES, NATIONALITIES, PREFECTURES } from '../../data/masterData'

// コンポーネント外で定義することで、親の再レンダリング時に unmount/remount されない
interface FieldProps {
  label: string
  type?: string
  placeholder?: string
  required?: boolean
  error?: string
  value: string
  onChange: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  inputRef?: React.RefObject<HTMLInputElement>
  children?: React.ReactNode
}

function Field({
  label, type = 'text', placeholder = '', required, error,
  value, onChange, onKeyDown, inputRef,
  children,
}: FieldProps) {
  // ローカル state で表示値を管理：IME変換中も未確定文字を表示できる
  const [localValue, setLocalValue] = useState(value)
  const composingRef = useRef(false)

  // 外部から value が変わったとき（郵便番号自動入力など）はローカルにも反映
  useEffect(() => {
    if (!composingRef.current) {
      setLocalValue(value)
    }
  }, [value])

  return (
    <div>
      <label className="field-label">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children ?? (
        <input
          ref={inputRef}
          type={type}
          value={localValue}
          onChange={(e) => {
            setLocalValue(e.target.value)
            if (!composingRef.current) {
              onChange(e.target.value)
            }
          }}
          onCompositionStart={() => { composingRef.current = true }}
          onCompositionEnd={(e) => {
            composingRef.current = false
            const v = (e.target as HTMLInputElement).value
            setLocalValue(v)
            onChange(v)
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={`field-input ${error ? 'ring-2 ring-red-300 border-red-300' : ''}`}
        />
      )}
      {error && <p className="text-xs text-red-400 mt-0.5">{error}</p>}
    </div>
  )
}

// フリガナ欄：ひらがな入力を確定時にカタカナへ変換
const KANA_FIELDS: (keyof StudentInput)[] = ['last_kana', 'first_kana']
const hiraToKata = (s: string) =>
  s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))

const EMPTY: StudentInput = {
  student_code: null,
  license_number: null,
  last_name: '',
  first_name: '',
  last_kana: '',
  first_kana: '',
  birth_date: '',
  gender: null,
  postal_code: '',
  prefecture: '',
  city: '',
  address1: '',
  address2: '',
  address_room: '',
  mail_postal_code: '',
  mail_prefecture: '',
  mail_city: '',
  mail_address1: '',
  mail_address2: '',
  mail_address_room: '',
  phone: '',
  mobile: '',
  email: '',
  note: '',
  domicile: '',
  nationality: '',
}

interface Props {
  student?: Student | null
  onSaved: (s: Student) => void
  /** 画面に埋め込んで表示（全画面オーバーレイ・見出しなし、Escで閉じない） */
  embedded?: boolean
  /** 未保存の変更があるかを親へ通知（embedded 時の離脱確認用） */
  onDirtyChange?: (dirty: boolean) => void
  onCancel: () => void
}

// ── 試験記録初期値 ────────────────────────────────────────────────
const EMPTY_EXAM = {
  qualification_type: '二級',
  shintai_cert: false,
  shintai_valid_until: '',
  shintai_date: '',        // 身体検査の受検日（入力すると身体検査の履歴に登録）
  gakka_session_id: null as number | null,
  gakka_exam_number: '',
  gakka_result: null as ExamResult,
  gakka_result_date: '',
  jitsugi_session_id: null as number | null,
  jitsugi_exam_number: '',
  jitsugi_result: null as ExamResult,
  jitsugi_result_date: '',
}

const QUAL_TYPES = ['一級', '二級', '特殊', '湖川']

// 住所欄のキー（申請住所 / 送付先住所）
const ADDR_KEYS = {
  main: { zip: 'postal_code', pref: 'prefecture', city: 'city', a1: 'address1', a2: 'address2', room: 'address_room' },
  mail: { zip: 'mail_postal_code', pref: 'mail_prefecture', city: 'mail_city', a1: 'mail_address1', a2: 'mail_address2', room: 'mail_address_room' },
} as const satisfies Record<string, Record<string, keyof StudentInput>>
const MAIL_KEYS = Object.values(ADDR_KEYS.mail)
const RESULTS: ExamResult[] = ['合', '免', '否', '不']

export default function StudentForm({ student, onSaved, onCancel, embedded = false, onDirtyChange }: Props) {
  const isNew = !student

  const [form, setForm] = useState<StudentInput>(
    student ? { ...student } : { ...EMPTY }
  )

  // 埋め込み表示：保存後などに親から新しい student が来たらフォームを合わせる
  useEffect(() => {
    if (embedded && student) setForm({ ...student })
  }, [embedded, student])

  // 未保存の変更があるか（空文字と null は同じとみなす）
  const norm = (v: unknown) => (v === '' || v === undefined ? null : v)
  const dirty = !!student && (Object.keys(form) as (keyof StudentInput)[])
    .some((k) => norm(form[k]) !== norm((student as StudentInput)[k]))
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  const [errors, setErrors] = useState<Partial<Record<keyof StudentInput, string>>>({})
  const [dupResult, setDupResult] = useState<DuplicateCheckResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [zipLoading, setZipLoading] = useState<'main' | 'mail' | null>(null)
  // 送付先住所：既存データに入っていれば最初から有効
  const [hasMail, setHasMail] = useState(
    !!student && MAIL_KEYS.some((k) => (student[k] ?? '').trim() !== '')
  )
  const [addrTab, setAddrTab] = useState<'main' | 'mail'>('main')
  // 旧免許の選択欄：旧免許が入っているときだけ最初から開く
  const [showOldLicense, setShowOldLicense] = useState(!!student?.license_class?.startsWith('旧'))
  const firstRef = useRef<HTMLInputElement>(null)

  // ── 新規時のオプションセクション ──
  const [showEnrollment, setShowEnrollment] = useState(false)
  // 申込入力欄はスケジュールからの申込編集画面と共通
  const enrollmentForm = useEnrollmentForm(null)
  const [enrollmentError, setEnrollmentError] = useState('')
  const [showExam, setShowExam] = useState(false)
  const [examForm, setExamForm] = useState({ ...EMPTY_EXAM })
  const [examSessions, setExamSessions] = useState<ExamSession[]>([])
  const [sessionsLoaded, setSessionsLoaded] = useState(false)

  const openExamSection = async () => {
    setShowExam(v => !v)
    if (!sessionsLoaded) {
      const list = await examSessionsApi.list()
      setExamSessions(list)
      setSessionsLoaded(true)
    }
  }

  const setX = <K extends keyof typeof EMPTY_EXAM>(k: K, v: (typeof EMPTY_EXAM)[K]) =>
    setExamForm(f => ({ ...f, [k]: v }))

  // 学科・実技それぞれに出せるセッション
  const gakkaSessions  = examSessions.filter(s => s.exam_type !== '実技')
  const jitsugiSessions = examSessions.filter(s => s.exam_type !== '学科')

  // 学生保存後に申込・試験記録を追加作成
  const saveOptional = async (studentId: number) => {
    if (showEnrollment) {
      await enrollmentsApi.create(enrollmentForm.buildInput(studentId))
    }
    if (showExam) {
      await examRecordsApi.create({
        student_id:          studentId,
        enrollment_id:       null,
        qualification_type:  examForm.qualification_type,
        shintai_cert:        false,   // 身体検査は physical_exams で管理
        shintai_valid_until: null,
        gakka_session_id:    examForm.gakka_session_id,
        gakka_exam_number:   examForm.gakka_exam_number || null,
        gakka_result:        examForm.gakka_result,
        gakka_result_date:   examForm.gakka_result_date || null,
        jitsugi_session_id:  examForm.jitsugi_session_id,
        jitsugi_exam_number: examForm.jitsugi_exam_number || null,
        jitsugi_result:      examForm.jitsugi_result,
        jitsugi_result_date: examForm.jitsugi_result_date || null,
        note:                null,
      })
    }
    if (showExam && examForm.shintai_date) {
      await physicalExamsApi.create({
        student_id:  studentId,
        exam_date:   examForm.shintai_date,
        valid_until: expiryAfterYears(examForm.shintai_date, PHYSICAL_VALID_YEARS) || null,
        note:        null,
      })
    }
  }

  useEffect(() => {
    firstRef.current?.focus()
    // 新規登録時: 次の受講者番号を事前取得
    if (!student) {
      studentsApi.nextCode().then((code) => {
        setForm((f) => f.student_code ? f : { ...f, student_code: code })
      })
    }
  }, [])

  // フィールド更新
  const set = (k: keyof StudentInput, v: string | null) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => ({ ...e, [k]: undefined }))
  }

  // 現有免許：種類（一級/二級/湖川/旧免許）は1つだけ、追加区分は複数選択
  const licenseOpts = (form.license_options ?? '').split(',').map(x => x.trim()).filter(Boolean)
  const toggleLicenseClass = (c: string) => set('license_class', form.license_class === c ? null : c)
  const toggleLicenseOption = (o: string) => {
    const next = licenseOpts.includes(o) ? licenseOpts.filter(x => x !== o) : [...licenseOpts, o]
    // 表示順を一定に保つ
    set('license_options', LICENSE_OPTIONS.filter(x => next.includes(x)).join(',') || null)
  }
  const chipCls = (on: boolean) =>
    `px-3 py-1.5 rounded-lg border text-sm font-medium transition ${
      on ? 'bg-lavender-400 text-white border-lavender-400' : 'bg-white text-gray-500 border-gray-200 hover:border-lavender-300'
    }`

  // 郵便番号 → 住所（申請住所 / 送付先住所 共通）
  const handleZipBlur = async (kind: 'main' | 'mail' = 'main') => {
    const keys = ADDR_KEYS[kind]
    const zip = (form[keys.zip] as string | null | undefined)?.replace(/[^0-9]/g, '') ?? ''
    if (zip.length !== 7) return
    setZipLoading(kind)
    const addr = await fetchAddressByZip(zip)
    setZipLoading(null)
    if (addr) {
      // 町名は市区町村の欄にまとめる（番地の欄は番地だけを入力する）。
      // 番地欄に入力済みの内容は消さない
      setForm((f) => ({
        ...f,
        [keys.pref]: addr.prefecture,
        [keys.city]: addr.city + addr.address1,
      }))
    }
  }

  // 送付先の有効/無効切替
  const toggleMail = (on: boolean) => {
    // 送付先が入力済みのときは、外す前に確認（うっかり消し防止）
    if (!on && MAIL_KEYS.some((k) => ((form[k] as string | null | undefined) ?? '').trim() !== '')) {
      const ok = window.confirm(
        '送付先住所が入力されています。\nチェックを外すと、保存時に送付先住所は削除されます。\n\nよろしいですか？'
      )
      if (!ok) return
    }
    setHasMail(on)
    setAddrTab(on ? 'mail' : 'main')
  }

  // 申請住所を送付先へコピー（一部だけ違う場合の手間を省く）
  const copyMainToMail = () => {
    setForm((f) => ({
      ...f,
      mail_postal_code: f.postal_code,
      mail_prefecture: f.prefecture,
      mail_city: f.city,
      mail_address1: f.address1,
      mail_address2: f.address2,
      mail_address_room: f.address_room,
    }))
  }

  // 保存用データ：送付先が無効なら送付先欄は空で保存
  const payload = (): StudentInput =>
    hasMail ? form : { ...form, ...Object.fromEntries(MAIL_KEYS.map((k) => [k, null])) }

  // バリデーション
  const validate = (): boolean => {
    const e: typeof errors = {}
    if (!form.last_name.trim()) e.last_name = '姓は必須です'
    if (!form.first_name.trim()) e.first_name = '名は必須です'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // 保存（重複なし or 確認済み）
  const handleSubmit = async () => {
    if (!validate()) return
    if (showEnrollment) {
      const msg = enrollmentForm.validate()
      setEnrollmentError(msg ?? '')
      if (msg) return
    }
    setSaving(true)

    const dup = await studentsApi.checkDuplicate(form, student?.id)
    setSaving(false)

    if (dup.hasDuplicate) {
      setDupResult(dup)
      return
    }

    await doSave()
  }

  const doSave = async () => {
    setSaving(true)
    try {
      const saved = student
        ? await studentsApi.update(student.id, payload())
        : await studentsApi.create(payload())
      await saveOptional(saved.id)
      onSaved(saved)
    } finally {
      setSaving(false)
    }
  }

  const handleDupResolve = async (action: 'merge' | 'defer' | 'new', targetId?: number) => {
    const candidates = dupResult?.candidates ?? []
    setDupResult(null)
    setSaving(true)
    try {
      let saved
      if (action === 'merge' && targetId) {
        saved = await studentsApi.merge(targetId, payload())  // 空欄の項目は既存の値を引き継ぐ
      } else if (action === 'defer') {
        const notePrefix = '【要確認】重複の可能性あり'
        saved = await studentsApi.create({
          ...payload(),
          note: form.note ? `${notePrefix}\n${form.note}` : notePrefix,
        })
        for (const c of candidates) {
          await pendingReviewsApi.create({
            student_id: saved.id,
            candidate_id: c.student.id,
            match_reasons: JSON.stringify(c.reasons),
            match_score: c.score,
          })
        }
      } else {
        saved = await studentsApi.create(payload())
      }
      await saveOptional(saved.id)
      onSaved(saved)
    } catch (e) {
      console.error('保存エラー:', e)
      alert(`保存エラー: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  // Enter → 次フィールドへ移動 or 保存
  const handleKeyDown = (e: React.KeyboardEvent, isLast = false) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (isLast) {
        handleSubmit()
      } else {
        const form = e.currentTarget.closest('form')
        if (!form) return
        const inputs = Array.from(
          form.querySelectorAll<HTMLElement>('input,select,textarea,button[type="submit"]')
        ).filter((el) => !(el as HTMLInputElement).disabled)
        const idx = inputs.indexOf(e.currentTarget as HTMLElement)
        inputs[idx + 1]?.focus()
      }
    }
    if (e.key === 'Escape' && !embedded) onCancel()
  }

  const f = (name: keyof StudentInput) => ({
    value: (form[name] as string) ?? '',
    onChange: (v: string) => set(name, KANA_FIELDS.includes(name) ? hiraToKata(v) : v),
    onKeyDown: handleKeyDown,
    error: errors[name],
  })

  return (
    <>
    {dupResult?.hasDuplicate && (
      <DuplicateResolutionModal
        candidates={dupResult.candidates}
        newStudent={form}
        onResolve={handleDupResolve}
        onCancel={() => setDupResult(null)}
      />
    )}
    <div className={embedded ? 'flex-1 min-h-0 flex flex-col bg-white' : 'fixed inset-0 z-[55] bg-white flex flex-col'}>
        {/* sticky header */}
        {!embedded && (
        <div className="shrink-0 px-8 py-5 border-b border-lavender-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-700">
            {student ? '受講者を編集' : '受講者を追加'}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            tabIndex={-1}
          >
            ✕
          </button>
        </div>
        )}

        {/* scrollable body */}
        <form
          id="student-form"
          className="flex-1 overflow-y-auto"
          onSubmit={(e) => { e.preventDefault(); handleSubmit() }}
        >
        <div className="max-w-6xl mx-auto px-8 py-4 space-y-4">
          {/* ── メイン情報：本人情報（2/3）＋ 免許・備考（1/3） ── */}
          <div className="grid grid-cols-3 gap-4 bg-lavender-50/30 -mx-2 p-2 rounded-2xl">

            {/* ── 左 2/3：① 本人情報（氏名・住所・連絡先） ── */}
            <Section step="1" title="本人情報" hint="* は必須" className="col-span-2">
              <div className="space-y-3">
                {/* 表示：1行目＝受講者番号・生年月日・性別・本籍・国籍／2行目＝姓・名／3行目＝セイ・メイ。入力順（Tab・Enter）は 氏名→フリガナ→生年月日→性別→本籍→国籍 */}
                <div className="grid grid-cols-12 gap-x-3 gap-y-3 content-start">
                  <div className="col-span-2 row-start-1 col-start-1">
                    <label className="field-label">
                      受講者番号
                    </label>
                    <input
                      type="text"
                      value={form.student_code ?? ''}
                      onChange={(e) => set('student_code', e.target.value || null)}
                      onKeyDown={handleKeyDown}
                      placeholder="自動採番"
                      title="空欄なら保存時に自動で採番されます"
                      maxLength={20}
                      className="field-input bg-gray-50"
                    />
                  </div>
                  <div className="col-span-4 row-start-2 col-start-1">
                    <Field label="姓" required placeholder="山田" inputRef={firstRef} {...f('last_name')} />
                  </div>
                  <div className="col-span-4 row-start-2 col-start-5">
                    <Field label="名" required placeholder="太郎" {...f('first_name')} />
                  </div>
                  <div className="col-span-4 row-start-3 col-start-1">
                    <Field label="セイ（フリガナ）" placeholder="ヤマダ" {...f('last_kana')} />
                  </div>
                  <div className="col-span-4 row-start-3 col-start-5">
                    <Field label="メイ（フリガナ）" placeholder="タロウ" {...f('first_kana')} />
                  </div>
                  <div className="col-span-4 row-start-1 col-start-3">
                    <Field label="生年月日" {...f('birth_date')}>
                      <DateTextInput showAge value={form.birth_date} onChange={(v) => set('birth_date', v || null)} onKeyDown={handleKeyDown} />
                    </Field>
                  </div>
                  <div className="col-span-2 row-start-1 col-start-7">
                      <Field label="性別" {...f('gender')}>
                        <select
                          value={form.gender ?? ''}
                          onChange={(e) => set('gender', e.target.value as StudentInput['gender'] || null)}
                          onKeyDown={handleKeyDown}
                          className="field-select"
                        >
                          <option value="">--</option>
                          <option value="male">男性</option>
                          <option value="female">女性</option>
                          <option value="other">その他</option>
                        </select>
                      </Field>
                  </div>
                  <div className="col-span-2 row-start-1 col-start-9">
                      <Field label="本籍地" {...f('domicile')}>
                        <select
                          value={form.domicile ?? ''}
                          onChange={(e) => set('domicile', e.target.value || null)}
                          onKeyDown={handleKeyDown}
                          className="field-select"
                        >
                          <option value="">--</option>
                          {form.domicile && !PREFECTURES.includes(form.domicile) && (
                            <option value={form.domicile}>{form.domicile}（未登録）</option>
                          )}
                          {PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </Field>
                  </div>
                  <div className="col-span-2 row-start-1 col-start-11">
                      <Field label="国籍" {...f('nationality')}>
                        <select
                          value={form.nationality ?? ''}
                          onChange={(e) => set('nationality', e.target.value || null)}
                          onKeyDown={handleKeyDown}
                          className="field-select"
                        >
                          <option value="">日本</option>
                          {form.nationality && !NATIONALITIES.some(n => n.label === form.nationality) && (
                            <option value={form.nationality}>{form.nationality}（未登録）</option>
                          )}
                          {NATIONALITIES.filter(n => n.code !== 1).map(n => (
                            <option key={n.code} value={n.label}>{n.label}</option>
                          ))}
                        </select>
                      </Field>
                  </div>
                </div>

                {/* 住所・連絡先 */}
                <div className="space-y-3 pt-1">
                  <div className="flex items-center gap-2 pb-1 border-b border-lavender-100">
                    <h4 className="text-xs font-bold text-lavender-600">住所</h4>
                    <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={hasMail}
                        onChange={(e) => toggleMail(e.target.checked)}
                        className="rounded"
                        tabIndex={-1}
                      />
                      送付先が別
                    </label>
                  </div>
                  {hasMail && (
                    <div className="flex gap-1 -mt-1 border-b border-lavender-100">
                      {([['main', '免許申請用住所'], ['mail', '送付先住所']] as const).map(([k, label]) => (
                        <button
                          key={k}
                          type="button"
                          tabIndex={-1}
                          onClick={() => setAddrTab(k)}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg border-b-2 -mb-px transition ${
                            addrTab === k
                              ? k === 'mail'
                                ? 'border-amber-400 text-amber-600 bg-amber-50'
                                : 'border-lavender-400 text-lavender-600 bg-lavender-50'
                              : 'border-transparent text-gray-400 hover:text-gray-600'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                      {addrTab === 'mail' && (
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={copyMainToMail}
                          className="ml-auto text-[12px] text-lavender-500 hover:text-lavender-700"
                        >
                          申請用住所をコピー
                        </button>
                      )}
                    </div>
                  )}
                  {(() => {
                    const kind = hasMail ? addrTab : 'main'
                    const k = ADDR_KEYS[kind]
                    return (
                      <div key={kind} className={kind === 'mail' ? 'space-y-3 rounded-lg bg-amber-50/40 -mx-1 px-1 pb-1' : 'space-y-3'}>
                        <div className="grid grid-cols-12 gap-3">
                          <div className="col-span-2">
                            <label className="field-label">郵便番号</label>
                            <div className="relative">
                              <input
                                type="text"
                                value={(form[k.zip] as string | null | undefined) ?? ''}
                                onChange={(e) => set(k.zip, e.target.value)}
                                onBlur={() => handleZipBlur(kind)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleZipBlur(kind)
                                  handleKeyDown(e)
                                }}
                                placeholder="1234567"
                                maxLength={8}
                                className="field-input pr-12"
                              />
                              {zipLoading === kind && (
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-lavender-400 animate-pulse">
                                  検索中
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="col-span-2"><Field label="都道府県" placeholder="東京都" {...f(k.pref)} /></div>
                          <div className="col-span-5"><Field label="市区町村・町名" placeholder="渋谷区道玄坂" {...f(k.city)} /></div>
                          <div className="col-span-3"><Field label="番地" placeholder="1-2-3" {...f(k.a1)} /></div>
                        </div>
                        <div className="grid grid-cols-12 gap-3 items-end">
                          <div className="col-span-5"><Field label="建物名" placeholder="○○マンション" {...f(k.a2)} /></div>
                          <div className="col-span-2"><Field label="部屋番号" placeholder="101" {...f(k.room)} /></div>
                          {kind === 'main' && (
                            <p className="col-span-5 note-text leading-snug pb-0.5">申込書は「番地-部屋番号」で印字（建物名は宛名ラベルのみ）。{!hasMail && '送付先が違う人は「送付先が別」にチェック。'}</p>
                          )}
                        </div>
                      </div>
                    )
                  })()}
                  <div className="pt-1" />
                  <div className="flex items-center gap-2 pb-1 border-b border-lavender-100">
                    <h4 className="text-xs font-bold text-lavender-600">連絡先</h4>
                  </div>
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-3"><Field label="電話番号" type="tel" placeholder="03-0000-0000" {...f('phone')} /></div>
                    <div className="col-span-3"><Field label="携帯電話" type="tel" placeholder="090-0000-0000" {...f('mobile')} /></div>
                    <div className="col-span-6"><Field label="メールアドレス" type="email" placeholder="taro@example.com" {...f('email')} /></div>
                  </div>
                </div>
              </div>
            </Section>

            {/* ── 右 1/3：② 現有免許情報＋備考 ── */}
            <div className="flex flex-col gap-4">
              {/* ② 現有免許情報 */}
              <Section step="2" title="現有免許情報" hint="お持ちの場合">
                <Field label="免許番号" placeholder="例：0300160004901" {...f('license_number')} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="有効期限" type="date" {...f('license_expiry')} />
                  <Field label="交付日" type="date" {...f('license_issue_date')} />
                </div>
                <div className="pt-3 border-t border-dashed border-lavender-100 space-y-2">
                  <label className="field-label">免許の種類</label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {LICENSE_CLASSES.map(c => (
                      <button key={c} type="button" tabIndex={-1} onClick={() => toggleLicenseClass(c)} className={chipCls(form.license_class === c)}>
                        {c}
                      </button>
                    ))}
                    <span className="mx-1 text-gray-300">＋</span>
                    {LICENSE_OPTIONS.map(o => (
                      <button key={o} type="button" tabIndex={-1} onClick={() => toggleLicenseOption(o)} className={chipCls(licenseOpts.includes(o))}>
                        {o}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none w-fit">
                    <input
                      type="checkbox"
                      checked={!!form.license_equipment_limited}
                      onChange={(e) => setForm((fm) => ({ ...fm, license_equipment_limited: e.target.checked }))}
                      className="rounded"
                      tabIndex={-1}
                    />
                    設備限定
                  </label>
                  {/* 旧免許（普段は閉じておく） */}
                  <div className="rounded-lg border border-gray-100">
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowOldLicense(v => !v)}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
                    >
                      <span>
                        旧免許の場合
                        {form.license_class?.startsWith('旧') && (
                          <span className="ml-2 text-lavender-600 font-semibold">{form.license_class.replace(/^旧/, '')} を選択中</span>
                        )}
                      </span>
                      <span className="text-gray-400">{showOldLicense ? '▲' : '▼'}</span>
                    </button>
                    {showOldLicense && (
                      <div className="flex flex-wrap gap-1.5 px-3 pb-2.5 pt-1">
                        {OLD_LICENSE_CLASSES.map(c => (
                          <button key={c} type="button" tabIndex={-1} onClick={() => toggleLicenseClass(c)} className={chipCls(form.license_class === c)}>
                            {c.replace(/^旧/, '')}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Section>

              {/* 備考 */}
              <Section title="備考" fill className="flex-1">
                <textarea
                  value={form.note ?? ''}
                  onChange={(e) => set('note', e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape' && !embedded) onCancel() }}
                  rows={3}
                  placeholder="連絡事項・注意点など"
                  className="field-input resize-none flex-1"
                />
              </Section>
            </div>
          </div>

          {/* ── 新規時のオプションセクション ── */}
          {isNew && (
            <>
              {/* 申込を一緒に登録 */}
              <div className="border border-lavender-100 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowEnrollment(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-lavender-600 hover:bg-lavender-50/60 transition"
                >
                  <span>＋ 申込も一緒に登録する</span>
                  <span className="text-gray-400 text-xs">{showEnrollment ? '▲ 閉じる' : '▼ 開く'}</span>
                </button>
                {showEnrollment && (
                  <div className="px-4 pb-4 space-y-3 border-t border-lavender-100 pt-4">
                    {enrollmentError && (
                      <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{enrollmentError}</p>
                    )}
                    {enrollmentForm.fields}
                  </div>
                )}
              </div>

              {/* 試験記録を一緒に登録 */}
              <div className="border border-lavender-100 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={openExamSection}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-lavender-600 hover:bg-lavender-50/60 transition"
                >
                  <span>＋ 試験記録も一緒に登録する</span>
                  <span className="text-gray-400 text-xs">{showExam ? '▲ 閉じる' : '▼ 開く'}</span>
                </button>
                {showExam && (
                  <div className="px-4 pb-4 space-y-3 border-t border-lavender-100 pt-3 bg-lavender-50/20">
                    {/* 資格種別 */}
                    <div>
                      <label className="field-label">資格種別</label>
                      <div className="flex gap-2">
                        {QUAL_TYPES.map(q => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => setX('qualification_type', q)}
                            className={`flex-1 py-1.5 rounded-lg border text-sm font-medium transition ${
                              examForm.qualification_type === q
                                ? 'bg-lavender-400 text-white border-lavender-400'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-lavender-300'
                            }`}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 身体検査（受検日から1年有効） */}
                    <div className="grid grid-cols-[11rem_1fr] gap-3 items-end">
                      <div>
                        <label className="field-label">身体検査の受検日</label>
                        <DateTextInput value={examForm.shintai_date} onChange={v => setX('shintai_date', v)} />
                      </div>
                      <p className="note-text pb-2">
                        {examForm.shintai_date
                          ? `${fmtYmd(expiryAfterYears(examForm.shintai_date, PHYSICAL_VALID_YEARS))} まで有効（受検日から1年）`
                          : '受けている場合のみ入力（受検日から1年有効）'}
                      </p>
                    </div>

                    {/* 学科試験 */}
                    <fieldset className="border border-lavender-100 rounded-lg p-3 space-y-2">
                      <legend className="text-xs font-semibold text-lavender-400 px-1">学科試験</legend>
                      <div>
                        <label className="field-label">試験日程</label>
                        <select
                          value={examForm.gakka_session_id ?? ''}
                          onChange={e => setX('gakka_session_id', e.target.value ? Number(e.target.value) : null)}
                          className="field-select"
                        >
                          <option value="">-- 未選択 --</option>
                          {gakkaSessions.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.exam_date} {s.exam_location}（{s.qualification_type}・{s.exam_id}）
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="field-label">受験番号</label>
                          <input
                            type="text"
                            value={examForm.gakka_exam_number}
                            onChange={e => setX('gakka_exam_number', e.target.value)}
                            className="field-input"
                          />
                        </div>
                        <div>
                          <label className="field-label">判定日</label>
                          <input
                            type="date"
                            value={examForm.gakka_result_date}
                            onChange={e => setX('gakka_result_date', e.target.value)}
                            className="field-input"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="field-label">合否</label>
                        <div className="flex gap-2">
                          {RESULTS.map(r => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setX('gakka_result', examForm.gakka_result === r ? null : r)}
                              className={`flex-1 py-1 rounded-lg border text-sm font-bold transition ${
                                examForm.gakka_result === r
                                  ? (r === '合' || r === '免') ? 'bg-mint-400 text-white border-mint-400' : 'bg-red-400 text-white border-red-400'
                                  : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      </div>
                    </fieldset>

                    {/* 実技試験 */}
                    <fieldset className="border border-lavender-100 rounded-lg p-3 space-y-2">
                      <legend className="text-xs font-semibold text-lavender-400 px-1">実技試験</legend>
                      <div>
                        <label className="field-label">試験日程</label>
                        <select
                          value={examForm.jitsugi_session_id ?? ''}
                          onChange={e => setX('jitsugi_session_id', e.target.value ? Number(e.target.value) : null)}
                          className="field-select"
                        >
                          <option value="">-- 未選択 --</option>
                          {jitsugiSessions.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.exam_date} {s.exam_location}（{s.qualification_type}・{s.exam_id}）
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="field-label">受験番号</label>
                          <input
                            type="text"
                            value={examForm.jitsugi_exam_number}
                            onChange={e => setX('jitsugi_exam_number', e.target.value)}
                            className="field-input"
                          />
                        </div>
                        <div>
                          <label className="field-label">判定日</label>
                          <input
                            type="date"
                            value={examForm.jitsugi_result_date}
                            onChange={e => setX('jitsugi_result_date', e.target.value)}
                            className="field-input"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="field-label">合否</label>
                        <div className="flex gap-2">
                          {RESULTS.map(r => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setX('jitsugi_result', examForm.jitsugi_result === r ? null : r)}
                              className={`flex-1 py-1 rounded-lg border text-sm font-bold transition ${
                                examForm.jitsugi_result === r
                                  ? (r === '合' || r === '免') ? 'bg-mint-400 text-white border-mint-400' : 'bg-red-400 text-white border-red-400'
                                  : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      </div>
                    </fieldset>
                  </div>
                )}
              </div>
            </>
          )}

        </div>
        </form>
        {/* sticky footer */}
        <div className="shrink-0 border-t border-lavender-100 bg-white">
          <div className={`max-w-6xl mx-auto px-8 flex items-center justify-end gap-3 ${embedded ? 'py-3' : 'py-5'}`}>
            {embedded ? (
              <>
                {dirty && <span className="note-text mr-auto">未保存の変更があります</span>}
                <button
                  type="button"
                  onClick={() => { if (student) setForm({ ...student }) }}
                  disabled={!dirty}
                  className="btn-secondary disabled:opacity-40"
                >
                  変更を元に戻す
                </button>
              </>
            ) : (
            <button
              type="button"
              onClick={onCancel}
              className="btn-secondary"
            >
              キャンセル (Esc)
            </button>
            )}
            <button
              type="submit"
              form="student-form"
              disabled={saving}
              className="btn-primary min-w-[100px]"
              onKeyDown={(e) => handleKeyDown(e, true)}
            >
              {saving ? '保存中…' : student ? (embedded ? '保存する' : '更新する') : '追加する'}
            </button>
          </div>
        </div>
    </div>
    </>
  )
}
