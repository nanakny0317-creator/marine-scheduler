/**
 * カレンダーから日付を選ぶ入力欄（クリックするとカレンダーが開く）。値は 'YYYY-MM-DD'、未選択は ''。
 * 申請日など「手で打つより選ぶ方が早い」日付用。生年月日のように昔の日付は DateTextInput を使う。
 */
interface Props {
  value: string
  onChange: (iso: string) => void
  className?: string
  autoFocus?: boolean
}

export default function CalendarDateInput({ value, onChange, className = '', autoFocus }: Props) {
  return (
    <input
      type="date"
      value={value}
      autoFocus={autoFocus}
      onChange={e => onChange(e.target.value)}
      // 欄のどこをクリックしてもカレンダーを開く（▼の所だけでなく）
      onClick={e => { try { (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.() } catch { /* 開けないブラウザは普通の入力 */ } }}
      className={`field-input cursor-pointer ${className}`}
    />
  )
}
