/**
 * 日付の手入力欄（西暦・和暦どちらでも入力可）
 * - 1997/03/21、H09/03/21、平成9年3月21日、19970321 などを受け付ける
 * - 値は 'YYYY-MM-DD' でやり取りする（空は ''）
 * - 確定（フォーカスが外れる／Enter）すると「1997/03/21」の形に整え、右端に和暦（H9 など）を表示
 */
import { useEffect, useState } from 'react'
import { formatDateText, parseDateText, warekiOf } from '../lib/dateText'

/** 'YYYY-MM-DD' → 今日時点の満年齢 */
function ageOf(iso: string): number | null {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  const t = new Date()
  let age = t.getFullYear() - y
  if (t.getMonth() + 1 < m || (t.getMonth() + 1 === m && t.getDate() < d)) age--
  return age >= 0 ? age : null
}

interface Props {
  value: string | null | undefined
  onChange: (iso: string) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  placeholder?: string
  className?: string
  /** 右端に年齢も表示する（生年月日用） */
  showAge?: boolean
}

export default function DateTextInput({ value, onChange, onKeyDown, placeholder = '2000/01/01・H12/01/01', className = '', showAge = false }: Props) {
  const [text, setText] = useState(formatDateText(value))
  const [error, setError] = useState(false)

  // 外から値が変わったとき（保存後・クリアなど）は表示も合わせる
  useEffect(() => {
    const parsed = parseDateText(text)
    if (parsed !== (value ?? '')) {
      setText(formatDateText(value))
      setError(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const commit = () => {
    const parsed = parseDateText(text)
    if (parsed === null) {
      setError(true)
      return
    }
    setError(false)
    setText(formatDateText(parsed))
    if (parsed !== (value ?? '')) onChange(parsed)
  }

  const wareki = !error ? warekiOf(value) : null
  const age = showAge && wareki ? ageOf(value!) : null
  const badge = wareki ? (age != null ? `${wareki.short}・${age}歳` : wareki.short) : ''
  const tip = wareki ? (age != null ? `${wareki.long}（${age}歳）` : wareki.long) : undefined

  return (
    <div className="relative" title={tip}>
      <input
        type="text"
        inputMode="text"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          // 読み取れる形になった時点で反映（検索などで即時に効くように）
          const parsed = parseDateText(e.target.value)
          if (parsed !== null) {
            setError(false)
            if (parsed !== (value ?? '')) onChange(parsed)
          }
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          onKeyDown?.(e)
        }}
        placeholder={placeholder}
        className={`field-input ${wareki ? (age != null ? 'pr-[5.5rem]' : 'pr-10') : ''} ${error ? 'ring-2 ring-red-300 border-red-300' : ''} ${className}`}
      />
      {wareki && (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-lavender-500 whitespace-nowrap">
          {badge}
        </span>
      )}
      {error && (
        <p className="absolute left-0 top-full mt-0.5 text-[11px] text-red-500 whitespace-nowrap z-10">
          日付を読み取れません（例：2000/01/01、H12/01/01）
        </p>
      )}
    </div>
  )
}
