/**
 * OCR申請書の「全体の位置補正」（プリンターの癖）
 *
 * 書式の位置データとは別に、印刷全体を mm 単位で動かす。プラスは右・下、マイナスは左・上。
 * パソコンごとに保存する（ほかのパソコンには影響しない）。保存していないパソコンは基本設定を使う。
 */
import { useEffect, useState } from 'react'
import { DEFAULT_PRINT_OFFSET, loadPrintOffset, savePrintOffset, type PrintOffset } from '../lib/formPrint'

/** onChange：読み込み時と保存時に、保存済みの補正を知らせる（位置調整画面の表示を印刷に合わせる用） */
export default function PrintOffsetControl({ onChange }: { onChange?: (o: PrintOffset) => void } = {}) {
  const [saved, setSaved] = useState<PrintOffset | null>(null)
  const [x, setX] = useState('0')
  const [y, setY] = useState('0')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    loadPrintOffset().then(o => { setSaved(o); setX(String(o.xMm)); setY(String(o.yMm)); onChange?.(o) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const num = (s: string) => { const v = Number(s); return Number.isFinite(v) ? Math.round(v * 10) / 10 : NaN }
  const dirty = saved != null && (num(x) !== saved.xMm || num(y) !== saved.yMm)

  const save = async () => {
    const o = { xMm: num(x), yMm: num(y) }
    if (Number.isNaN(o.xMm) || Number.isNaN(o.yMm)) { setMsg('数字を入れてください'); return }
    if (Math.abs(o.xMm) > 15 || Math.abs(o.yMm) > 15) { setMsg('15mm 以内にしてください'); return }
    await savePrintOffset(o)
    setSaved(o); onChange?.(o); setMsg('このパソコンに保存しました')
    setTimeout(() => setMsg(''), 2000)
  }

  const field = (label: string, hint: string, v: string, set: (s: string) => void) => (
    <label className="flex items-center gap-1 text-xs text-gray-600" title={hint}>
      {label}
      <input type="number" step="0.1" value={v} onChange={e => set(e.target.value)}
        className="w-16 px-1.5 py-0.5 border border-gray-300 rounded text-right font-mono text-xs" />
      mm
    </label>
  )

  return (
    <div className="flex items-center gap-2 px-3 py-1 rounded-lg border border-amber-200 bg-amber-50"
      title="すべての申請書の印刷を、まとめて動かします（プリンターごとの癖を直す用）。このパソコンだけに保存され、ほかのパソコンには影響しません。書式の位置は変わりません。">
      <span className="text-xs font-bold text-amber-700">🖨 全体の位置補正<span className="font-normal">（このパソコン）</span></span>
      {field('横', 'プラスで右へ、マイナスで左へ', x, setX)}
      {field('縦', 'プラスで下へ、マイナスで上へ', y, setY)}
      <button type="button" onClick={() => { setX(String(DEFAULT_PRINT_OFFSET.xMm)); setY(String(DEFAULT_PRINT_OFFSET.yMm)) }}
        className="text-[11px] text-amber-700 underline hover:text-amber-900"
        title={`基本設定の値（横 ${DEFAULT_PRINT_OFFSET.xMm}mm・縦 ${DEFAULT_PRINT_OFFSET.yMm}mm）を入れます。保存を押すと反映します`}>
        基本設定に戻す
      </button>
      <button type="button" onClick={save} disabled={!dirty}
        className="px-2 py-0.5 rounded bg-amber-500 text-white text-xs font-semibold disabled:opacity-40">
        保存
      </button>
      {msg && <span className="text-[11px] text-amber-700">{msg}</span>}
    </div>
  )
}
