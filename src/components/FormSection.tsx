/**
 * 入力フォーム用セクションカード
 * 見出しバー + 左アクセントで項目のまとまりを明確にする
 */
export default function FormSection({
  step, title, hint, action, className = '', children,
}: {
  step?: string
  title: string
  hint?: string
  /** 見出しバー右端に置く操作（ボタンなど）。hint より優先して右端に出る */
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={`rounded-xl border border-lavender-100 bg-white shadow-sm overflow-hidden ${className}`}>
      <header className="flex items-center gap-2 px-4 py-2 bg-lavender-50/70 border-b border-lavender-100 border-l-4 border-l-lavender-400">
        {step && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-lavender-400 text-[11px] font-bold text-white">
            {step}
          </span>
        )}
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        {hint && <span className={`${action ? '' : 'ml-auto'} text-[11px] text-gray-400`}>{hint}</span>}
        {action && <div className="ml-auto">{action}</div>}
      </header>
      <div className="p-4 space-y-3">{children}</div>
    </section>
  )
}
