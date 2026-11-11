/**
 * 入力フォーム用セクションカード
 * 見出しバー + 左アクセントで項目のまとまりを明確にする
 */
export default function FormSection({
  step, title, hint, action, className = '', fill = false, children,
}: {
  step?: string
  title: string
  hint?: string
  /** 見出しバー右端に置く操作（ボタンなど）。hint より優先して右端に出る */
  action?: React.ReactNode
  className?: string
  /** 親の高さいっぱいまで伸ばす（中身も縦に伸ばせるよう flex にする） */
  fill?: boolean
  children: React.ReactNode
}) {
  return (
    <section className={`rounded-xl border-2 border-lavender-200 bg-white shadow-md shadow-lavender-200/40 overflow-hidden ${fill ? 'flex flex-col' : ''} ${className}`}>
      <header className="flex items-center gap-2 px-4 py-2 bg-lavender-100/80 border-b border-lavender-100 border-l-4 border-l-lavender-400">
        {step && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-lavender-400 text-[12px] font-bold text-white">
            {step}
          </span>
        )}
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        {hint && <span className={`${action ? '' : 'ml-auto'} text-xs font-medium text-amber-700`}>{hint}</span>}
        {action && <div className="ml-auto">{action}</div>}
      </header>
      <div className={`p-4 space-y-3 ${fill ? 'flex-1 flex flex-col' : ''}`}>{children}</div>
    </section>
  )
}
