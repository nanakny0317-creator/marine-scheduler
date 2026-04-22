import { useState } from 'react'
import type { Enrollment, Student } from '../../types'

interface ReceiptItem {
  student: Student
  enrollment: Enrollment
}

interface Props {
  items: ReceiptItem[]
  onClose: () => void
}

function getLicenseNumber(student: Student): string {
  return student.license_number?.replace(/^第/, '') ?? ''
}

function toReiwa(year: number): number {
  return year - 2018
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

export default function ReceiptPrintModal({ items, onClose }: Props) {
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [day,   setDay]   = useState(now.getDate())

  const reiwaYear = toReiwa(year)
  const pages = chunkArray(items, 10)
  const total = items.length

  const handlePrint = async () => {
    const pageHtml = pages.map((page) => {
      const rows = Array.from({ length: 10 }, (_, i) => {
        const item = page[i]
        if (!item) return `<tr><td>&nbsp;</td><td>&nbsp;</td></tr>`
        const licenseNo = getLicenseNumber(item.student)
        const name = `${item.student.last_name}　${item.student.first_name}`
        return `<tr><td>${licenseNo}</td><td>${name}</td></tr>`
      }).join('\n')

      return `
<div class="page">
  <p class="num"><u>番号&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;</u></p>
  <p class="num-empty">&nbsp;</p>
  <p class="title">操縦免許証受領書</p>
  <p class="title-empty">&nbsp;</p>
  <p class="date"><u>令和&emsp;${reiwaYear}&emsp;年&emsp;${month}&emsp;月&emsp;${day}&emsp;日</u></p>
  <div class="addressee-block">
    <span class="addressee">近畿運輸局長殿</span>
    <div class="sender">
      <div>住　　所　大阪府茨木市若草町9-1</div>
      <div>電話番号　072-624-9344</div>
      <div>氏　　名　海事代理士　栗田　勉</div>
    </div>
  </div>
  <p class="body-text">下記の操縦免許証を受領しました。</p>
  <p class="ki">記</p>
  <p class="ki-empty">&nbsp;</p>
  <table>
    <colgroup><col class="col-left"><col class="col-right"></colgroup>
    <thead><tr><th>操縦免許証の番号</th><th>申請者の氏名</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="2" style="text-align:right;padding-right:8pt;">計　${total}　部</td></tr></tfoot>
  </table>
</div>`
    }).join('\n')

    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>操縦免許証受領書</title>
<style>
  @page { size: A4 portrait; margin: 14mm 10mm 19mm 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'MS Gothic','ＭＳ ゴシック','Hiragino Kaku Gothic Pro',sans-serif; font-size: 11pt; color: #000; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  p.num       { text-align: right; line-height: 1.5; font-size: 11pt; }
  p.num-empty { line-height: 1.5; font-size: 11pt; }
  p.title       { text-align: center; font-size: 20pt; font-weight: bold; line-height: 1.4; }
  p.title-empty { font-size: 20pt; line-height: 1.4; }
  p.date { text-align: right; line-height: 1.5; font-size: 11pt; }
  .addressee-block { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 2pt; margin-bottom: 2pt; overflow: hidden; }
  .addressee { font-size: 14pt; font-weight: bold; line-height: 1.6; white-space: nowrap; }
  .sender    { font-size: 11pt; line-height: 1.8; text-align: right; white-space: nowrap; }
  p.body-text { line-height: 1.5; font-size: 11pt; }
  p.ki        { text-align: center; line-height: 1.5; font-size: 11pt; }
  p.ki-empty  { line-height: 1.5; font-size: 11pt; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  col.col-left  { width: 52%; }
  col.col-right { width: 48%; }
  thead th { border: 1px solid #000; text-align: center; font-weight: normal; font-size: 11pt; height: 7.7mm; padding: 0; }
  tbody td { border: 1px solid #000; padding: 0 6pt; height: 14.3mm; font-size: 13pt; vertical-align: middle; text-align: center; }
  tbody td:first-child { letter-spacing: 0.1em; }
  tfoot td { border: 1px solid #000; height: 10.6mm; font-size: 11pt; }
</style>
</head>
<body>${pageHtml}</body>
</html>`

    try {
      await window.api.print.html(html)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('cancel')) alert(`印刷に失敗しました: ${msg}`)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* ヘッダー */}
        <div className="sticky top-0 bg-white border-b border-lavender-100 px-6 py-4 flex items-center justify-between rounded-t-2xl shrink-0">
          <h2 className="text-base font-semibold text-gray-700">操縦免許証受領書 印刷</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {/* ボディ */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* 日付設定 */}
          <div>
            <p className="text-xs font-semibold text-lavender-400 uppercase tracking-wide mb-2">受領日（令和）</p>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">令和</label>
              <input
                type="number"
                value={reiwaYear}
                min={1}
                max={99}
                onChange={(e) => setYear(Number(e.target.value) + 2018)}
                className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center"
              />
              <label className="text-sm text-gray-600">年</label>
              <input
                type="number"
                value={month}
                min={1}
                max={12}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="w-14 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center"
              />
              <label className="text-sm text-gray-600">月</label>
              <input
                type="number"
                value={day}
                min={1}
                max={31}
                onChange={(e) => setDay(Number(e.target.value))}
                className="w-14 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center"
              />
              <label className="text-sm text-gray-600">日</label>
            </div>
          </div>

          {/* 対象者一覧 */}
          <div>
            <p className="text-xs font-semibold text-lavender-400 uppercase tracking-wide mb-2">
              対象者（{total}名 / {pages.length}枚）
            </p>
            <div className="rounded-xl border border-lavender-100 divide-y divide-gray-50 overflow-hidden">
              {items.map(({ student, enrollment }, i) => {
                const licenseNo = getLicenseNumber(student)
                return (
                  <div key={enrollment.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="text-gray-300 text-xs w-5 text-right">{i + 1}</span>
                    <span className="font-medium text-gray-700 min-w-[100px]">
                      {student.last_name} {student.first_name}
                    </span>
                    {licenseNo ? (
                      <span className="text-gray-500 font-mono text-xs">{licenseNo}</span>
                    ) : (
                      <span className="text-orange-400 text-xs">免許番号未登録</span>
                    )}
                  </div>
                )
              })}
            </div>
            {items.some(({ student }) => !getLicenseNumber(student)) && (
              <p className="text-xs text-orange-500 mt-2">
                ※ 免許番号未登録の方は空欄で印刷されます。会員情報から登録できます。
              </p>
            )}
          </div>

        </div>

        {/* フッター */}
        <div className="shrink-0 px-6 py-4 border-t border-lavender-100 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">キャンセル</button>
          <button
            type="button"
            onClick={handlePrint}
            className="btn-primary"
          >
            印刷する（{total}名 / {pages.length}枚）
          </button>
        </div>
      </div>
    </div>
  )
}
