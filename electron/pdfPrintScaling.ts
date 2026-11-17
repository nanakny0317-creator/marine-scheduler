/**
 * PDF に「印刷時に拡大縮小しない（実際のサイズで印刷）」の指定を付ける
 *
 * OCR 申請書は用紙の決まった位置に印字するので、PDF ビューアが「用紙に合わせる」で
 * 縮小すると位置がずれる（2026-11-17 の試し刷りで 95.4% に縮んでいた）。
 * カタログに /ViewerPreferences << /PrintScaling /None >> を足すと、
 * Edge・Chrome の PDF ビューアや Acrobat は印刷ダイアログの既定を「実際のサイズ」にする。
 *
 * Chromium の printToPDF が出す PDF（相互参照表あり）に、増分更新で追記する。
 * 想定外の形の PDF なら何もせずに元のまま返す。
 */
export function setPrintScalingNone(pdf: Buffer): Buffer {
  try {
    const text = pdf.toString('latin1')

    // 末尾の startxref と trailer
    const sx = text.lastIndexOf('startxref')
    if (sx < 0) return pdf
    const prevXref = parseInt(text.slice(sx + 9).trim().split(/\s/)[0], 10)
    const tr = text.lastIndexOf('trailer', sx)
    if (tr < 0 || !Number.isFinite(prevXref)) return pdf   // 相互参照ストリーム形式などは対象外
    const trailer = text.slice(tr, sx)
    const root = trailer.match(/\/Root\s+(\d+)\s+(\d+)\s+R/)
    const size = trailer.match(/\/Size\s+(\d+)/)
    if (!root || !size) return pdf
    const objNum = Number(root[1]), gen = Number(root[2])

    // カタログの中身（最後に書かれたもの）
    const objRe = new RegExp(`(?:^|[\\r\\n\\s])${objNum}\\s+${gen}\\s+obj([\\s\\S]*?)endobj`, 'g')
    let body: string | null = null
    for (let m = objRe.exec(text); m; m = objRe.exec(text)) body = m[1]
    if (!body) return pdf
    const dict = body.trim()
    if (!dict.startsWith('<<') || !dict.endsWith('>>') || !/\/Type\s*\/Catalog/.test(dict)) return pdf
    if (/\/PrintScaling/.test(dict)) return pdf
    let newDict: string
    if (/\/ViewerPreferences\s*<</.test(dict)) {
      // Chromium は /ViewerPreferences <</DisplayDocTitle true>> を直接書くので、その中に足す
      newDict = dict.replace(/\/ViewerPreferences\s*<</, '/ViewerPreferences << /PrintScaling /None ')
    } else if (/\/ViewerPreferences\s+\d+\s+\d+\s+R/.test(dict)) {
      // 別オブジェクト参照なら、PrintScaling だけの辞書に置き換える（表示の細かい指定は失われても印字には影響しない）
      newDict = dict.replace(/\/ViewerPreferences\s+\d+\s+\d+\s+R/, '/ViewerPreferences << /PrintScaling /None >>')
    } else {
      newDict = `${dict.slice(0, -2)} /ViewerPreferences << /PrintScaling /None >> >>`
    }
    const base = pdf.length
    const nl = text.endsWith('\n') ? '' : '\n'
    const objText = `${nl}${objNum} ${gen} obj\n${newDict}\nendobj\n`
    const objOffset = base + nl.length
    const xrefOffset = base + Buffer.byteLength(objText, 'latin1')
    const trailerExtra = trailer.match(/\/Info\s+\d+\s+\d+\s+R/)?.[0] ?? ''
    const xref =
      `xref\n${objNum} 1\n${String(objOffset).padStart(10, '0')} ${String(gen).padStart(5, '0')} n \n` +
      `trailer\n<< /Size ${size[1]} /Root ${objNum} ${gen} R ${trailerExtra} /Prev ${prevXref} >>\n` +
      `startxref\n${xrefOffset}\n%%EOF\n`
    return Buffer.concat([pdf, Buffer.from(objText + xref, 'latin1')])
  } catch {
    return pdf
  }
}
