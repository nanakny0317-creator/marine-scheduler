import { useState } from 'react'
import type { Enrollment, Student } from '../../types'
import DateTextInput from '../DateTextInput'
import { TEISEI_ITEMS, type TeiseiItem } from '../../lib/correctionItems'
import { printApplicationForms } from '../../lib/applicationPrint'

function todayIso(): string {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

/**
 * 訂正申請書（訂正だけの人）を作る
 *
 * 訂正だけの人は少なく、海レ協への申請もないので申込は作らない。
 * 訂正項目と申請日を選んで、その場で印刷する（保存はしない）。
 */
export default function CorrectionPrintModal({ student, dirty, onClose }: {
  student: Student
  dirty: boolean       // 基本情報に保存していない変更があるか（印刷は保存済みの内容で行う）
  onClose: () => void
}) {
  const [items, setItems] = useState<TeiseiItem[]>([])
  const [date, setDate] = useState(todayIso())
  const [licenseReturn, setLicenseReturn] = useState<'yes' | 'no'>('yes')   // 免許証を持っていれば有（紛失などは無）
  const [busy, setBusy] = useState(false)

  const toggle = (v: TeiseiItem) => setItems(items.includes(v) ? items.filter(x => x !== v) : [...items, v])

  const print = async () => {
    if (items.length === 0) { alert('訂正する項目を選んでください。'); return }
    if (!date) { alert('申請日を入れてください。'); return }
    setBusy(true)
    try {
      const now = new Date().toISOString()
      const enrollment: Enrollment = {
        id: -1, student_id: student.id, menu: '', course_date: null, venue: null, status: 'pending',
        extra_json: JSON.stringify({
          application_type: 'correction',
          application_date: date,
          license_return: licenseReturn,
          teisei_items: TEISEI_ITEMS.map(i => i.value).filter(v => items.includes(v)),
        }),
        note: null, created_at: now, updated_at: now,
      }
      await printApplicationForms([{ student, enrollment }], '訂正申請書')
      onClose()
    } catch (e) {
      alert(`印刷できませんでした。\n${e instanceof Error ? e.message : String(e)}`)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-700">訂正申請書を作成</h2>
          <p className="text-xs text-gray-400 mt-1">
            {student.last_name} {student.first_name} さんの登録内容で印刷します（訂正後の内容を基本情報に入れて保存してから）。
          </p>
          {dirty && (
            <p className="text-xs text-orange-500 mt-1">基本情報に保存していない変更があります。保存してから印刷してください。</p>
          )}
        </div>

        <div>
          <label className="field-label">① 訂正項目（複数選べます）</label>
          <div className="flex flex-wrap gap-2">
            {TEISEI_ITEMS.map(({ value, label }) => {
              const on = items.includes(value)
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggle(value)}
                  className={[
                    'px-3 py-1.5 rounded-lg border text-sm font-medium transition',
                    on ? 'bg-lavender-400 text-white border-lavender-400' : 'bg-white text-gray-500 border-gray-200 hover:border-lavender-300',
                  ].join(' ')}
                >
                  {on ? '☑' : '☐'} {label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="field-label">⑫ 免許証返納</label>
          <div className="flex items-center gap-2">
            {([['yes', '有'], ['no', '無']] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setLicenseReturn(v)}
                className={[
                  'px-5 py-1.5 rounded-lg border text-sm font-medium transition',
                  licenseReturn === v ? 'bg-lavender-400 text-white border-lavender-400' : 'bg-white text-gray-500 border-gray-200 hover:border-lavender-300',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
            <span className="note-text">免許証が手元にあれば有、紛失などで無いときは無</span>
          </div>
        </div>

        <div>
          <label className="field-label">⑩ 申請日</label>
          <DateTextInput value={date} onChange={setDate} placeholder="2026/11/16・R8/11/16" />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={busy}>キャンセル</button>
          <button type="button" onClick={print} className="btn-primary" disabled={busy || items.length === 0}>
            {busy ? '印刷の準備中…' : '🖨 印刷'}
          </button>
        </div>
      </div>
    </div>
  )
}
