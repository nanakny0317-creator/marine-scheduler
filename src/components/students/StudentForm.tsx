/**
 * 受講者入力フォーム
 * - Tab/Enter だけで全操作完結
 * - 郵便番号→住所自動入力
 * - 重複チェック
 */
import { useEffect, useRef, useState } from 'react'
import type { Student, StudentInput, DuplicateCheckResult } from '../../types'
import { studentsApi, fetchAddressByZip } from '../../lib/api'

const EMPTY: StudentInput = {
  student_code: null,
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
  phone: '',
  mobile: '',
  email: '',
  note: '',
}

interface Props {
  student?: Student | null
  onSaved: (s: Student) => void
  onCancel: () => void
}

export default function StudentForm({ student, onSaved, onCancel }: Props) {
  const [form, setForm] = useState<StudentInput>(
    student ? { ...student } : { ...EMPTY }
  )
  const [errors, setErrors] = useState<Partial<Record<keyof StudentInput, string>>>({})
  const [dupResult, setDupResult] = useState<DuplicateCheckResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [zipLoading, setZipLoading] = useState(false)
  const firstRef = useRef<HTMLInputElement>(null)

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

  // 郵便番号 → 住所
  const handleZipBlur = async () => {
    const zip = form.postal_code?.replace(/[^0-9]/g, '') ?? ''
    if (zip.length !== 7) return
    setZipLoading(true)
    const addr = await fetchAddressByZip(zip)
    setZipLoading(false)
    if (addr) {
      setForm((f) => ({
        ...f,
        prefecture: addr.prefecture,
        city: addr.city,
        address1: addr.address1,
      }))
    }
  }

  // バリデーション
  const validate = (): boolean => {
    const e: typeof errors = {}
    if (!form.last_name.trim()) e.last_name = '姓は必須です'
    if (!form.first_name.trim()) e.first_name = '名は必須です'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // 保存
  const handleSubmit = async () => {
    if (!validate()) return
    setSaving(true)

    // 重複チェック
    const dup = await studentsApi.checkDuplicate(form, student?.id)
    if (dup.hasDuplicate && !dupResult) {
      setDupResult(dup)
      setSaving(false)
      return
    }

    try {
      const saved = student
        ? await studentsApi.update(student.id, form)
        : await studentsApi.create(form)
      onSaved(saved)
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
    if (e.key === 'Escape') onCancel()
  }

  const F = ({
    label, name, type = 'text', placeholder = '', required = false,
    children,
  }: {
    label: string
    name: keyof StudentInput
    type?: string
    placeholder?: string
    required?: boolean
    children?: React.ReactNode
  }) => (
    <div>
      <label className="field-label">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children ?? (
        <input
          type={type}
          value={(form[name] as string) ?? ''}
          onChange={(e) => set(name, e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`field-input ${errors[name] ? 'ring-2 ring-red-300 border-red-300' : ''}`}
        />
      )}
      {errors[name] && <p className="text-xs text-red-400 mt-0.5">{errors[name]}</p>}
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[55] p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* ヘッダー */}
        <div className="sticky top-0 bg-white border-b border-lavender-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-base font-semibold text-gray-700">
            {student ? '受講者を編集' : '受講者を追加'}
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            tabIndex={-1}
          >
            ✕
          </button>
        </div>

        {/* 重複警告 */}
        {dupResult?.hasDuplicate && (
          <div className="mx-6 mt-4 p-3 bg-peach-50 border border-peach-200 rounded-lg text-sm">
            <p className="font-semibold text-peach-500 mb-1">⚠ 重複の可能性があります</p>
            {dupResult.byName.length > 0 && (
              <p className="text-gray-600">
                同姓同名：{dupResult.byName.map((s) => `${s.last_name} ${s.first_name}`).join('、')}
              </p>
            )}
            {dupResult.byAddress.length > 0 && (
              <p className="text-gray-600">
                同住所：{dupResult.byAddress.map((s) => `${s.last_name} ${s.first_name}`).join('、')}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              このまま保存するには再度「保存」を押してください。
            </p>
          </div>
        )}

        {/* フォーム本体 */}
        <form
          className="p-6 space-y-5"
          onSubmit={(e) => { e.preventDefault(); handleSubmit() }}
        >
          {/* 受講者番号 */}
          <div>
            <label className="field-label">
              受講者番号
              <span className="ml-1.5 text-gray-400 font-normal text-[11px]">（6桁・自動採番。旧システムの番号も入力可）</span>
            </label>
            <input
              type="text"
              value={form.student_code ?? ''}
              onChange={(e) => set('student_code', e.target.value || null)}
              onKeyDown={handleKeyDown}
              placeholder="000001"
              maxLength={20}
              className="field-input w-40"
            />
          </div>

          {/* 氏名 */}
          <fieldset>
            <legend className="text-xs font-semibold text-lavender-400 mb-2 uppercase tracking-wide">
              氏名
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <F label="姓" name="last_name" required placeholder="山田">
                <input
                  ref={firstRef}
                  type="text"
                  value={form.last_name}
                  onChange={(e) => set('last_name', e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="山田"
                  className={`field-input ${errors.last_name ? 'ring-2 ring-red-300' : ''}`}
                />
              </F>
              <F label="名" name="first_name" required placeholder="太郎" />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <F label="せい（ふりがな）" name="last_kana" placeholder="やまだ" />
              <F label="めい（ふりがな）" name="first_kana" placeholder="たろう" />
            </div>
          </fieldset>

          {/* 基本情報 */}
          <fieldset>
            <legend className="text-xs font-semibold text-lavender-400 mb-2 uppercase tracking-wide">
              基本情報
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <F label="生年月日" name="birth_date" type="date" />
              <F label="性別" name="gender">
                <select
                  value={form.gender ?? ''}
                  onChange={(e) =>
                    set('gender', e.target.value as StudentInput['gender'] || null)
                  }
                  onKeyDown={handleKeyDown}
                  className="field-select"
                >
                  <option value="">選択してください</option>
                  <option value="male">男性</option>
                  <option value="female">女性</option>
                  <option value="other">その他</option>
                </select>
              </F>
            </div>
          </fieldset>

          {/* 住所 */}
          <fieldset>
            <legend className="text-xs font-semibold text-lavender-400 mb-2 uppercase tracking-wide">
              住所
            </legend>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <label className="field-label">郵便番号</label>
                <div className="relative">
                  <input
                    type="text"
                    value={form.postal_code ?? ''}
                    onChange={(e) => set('postal_code', e.target.value)}
                    onBlur={handleZipBlur}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); handleZipBlur() }
                      else handleKeyDown(e)
                    }}
                    placeholder="1234567"
                    maxLength={8}
                    className="field-input pr-8"
                  />
                  {zipLoading && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-lavender-400 animate-pulse">
                      検索中
                    </span>
                  )}
                </div>
              </div>
              <F label="都道府県" name="prefecture" placeholder="東京都" />
              <F label="市区町村" name="city" placeholder="渋谷区" />
            </div>
            <div className="mt-2">
              <F label="番地・建物名" name="address1" placeholder="道玄坂1-2-3" />
            </div>
            <div className="mt-2">
              <F label="住所2（マンション名等）" name="address2" placeholder="" />
            </div>
          </fieldset>

          {/* 連絡先 */}
          <fieldset>
            <legend className="text-xs font-semibold text-lavender-400 mb-2 uppercase tracking-wide">
              連絡先
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <F label="電話番号" name="phone" type="tel" placeholder="03-0000-0000" />
              <F label="携帯電話" name="mobile" type="tel" placeholder="090-0000-0000" />
            </div>
            <div className="mt-2">
              <F label="メールアドレス" name="email" type="email" placeholder="taro@example.com" />
            </div>
          </fieldset>

          {/* 備考 */}
          <div>
            <label className="field-label">備考</label>
            <textarea
              value={form.note ?? ''}
              onChange={(e) => set('note', e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
              rows={2}
              className="field-input resize-none"
            />
          </div>

          {/* アクション */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-lavender-100">
            <button
              type="button"
              onClick={onCancel}
              className="btn-secondary"
            >
              キャンセル (Esc)
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary min-w-[100px]"
              onKeyDown={(e) => handleKeyDown(e, true)}
            >
              {saving ? '保存中…' : student ? '更新する' : '追加する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
