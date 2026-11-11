/**
 * 日付の手入力パーサー（西暦・和暦どちらも可）
 *
 * 受け付ける例：
 *   1997/03/21  1997-3-21  1997.3.21  19970321  1997年3月21日
 *   H09/03/21   H9.3.21    h9-3-21    平成9年3月21日   平9/3/21
 *   S, T, M, R（昭和・大正・明治・令和）も同様。「元年」も可
 *   全角数字・全角記号も可
 */

const ERAS = [
  { key: 'R', name: '令和', offset: 2018, start: '2019-05-01' },
  { key: 'H', name: '平成', offset: 1988, start: '1989-01-08' },
  { key: 'S', name: '昭和', offset: 1925, start: '1926-12-25' },
  { key: 'T', name: '大正', offset: 1911, start: '1912-07-30' },
  { key: 'M', name: '明治', offset: 1867, start: '1868-01-25' },
] as const

const ERA_ALIASES: Record<string, (typeof ERAS)[number]> = {}
for (const e of ERAS) {
  ERA_ALIASES[e.key] = e
  ERA_ALIASES[e.key.toLowerCase()] = e
  ERA_ALIASES[e.name] = e
  ERA_ALIASES[e.name[0]] = e // 「平」「昭」など1文字
}

function toHalfWidth(s: string): string {
  return s
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[／－ー―‐．。、，　]/g, (c) => ({ '／': '/', '－': '-', 'ー': '-', '―': '-', '‐': '-', '．': '.', '。': '.', '、': '.', '，': '.', '　': ' ' }[c] ?? c))
    .replace(/元/g, '1')
}

function valid(y: number, m: number, d: number): boolean {
  if (!(y >= 1868 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 入力文字列 → 'YYYY-MM-DD'。読み取れなければ null（空文字は ''） */
export function parseDateText(input: string): string | null {
  const raw = toHalfWidth(input.trim())
  if (!raw) return ''

  // 和暦：元号（記号 or 漢字）＋ 年 月 日
  const era = raw.match(/^(令和|平成|昭和|大正|明治|[RHSTMrhstm令平昭大明])\s*(\d{1,2})\s*[年/.\-\s]\s*(\d{1,2})\s*[月/.\-\s]\s*(\d{1,2})\s*日?$/)
  if (era) {
    const e = ERA_ALIASES[era[1]]
    const y = e.offset + Number(era[2])
    const m = Number(era[3])
    const d = Number(era[4])
    return valid(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null
  }
  // 和暦の数字だけ（H090321 など）
  const eraCompact = raw.match(/^([RHSTMrhstm])(\d{2})(\d{2})(\d{2})$/)
  if (eraCompact) {
    const e = ERA_ALIASES[eraCompact[1]]
    const y = e.offset + Number(eraCompact[2])
    const m = Number(eraCompact[3])
    const d = Number(eraCompact[4])
    return valid(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null
  }
  // 西暦：区切りあり
  const ad = raw.match(/^(\d{4})\s*[年/.\-\s]\s*(\d{1,2})\s*[月/.\-\s]\s*(\d{1,2})\s*日?$/)
  if (ad) {
    const [y, m, d] = [Number(ad[1]), Number(ad[2]), Number(ad[3])]
    return valid(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null
  }
  // 西暦：8桁
  const ad8 = raw.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (ad8) {
    const [y, m, d] = [Number(ad8[1]), Number(ad8[2]), Number(ad8[3])]
    return valid(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null
  }
  return null
}

/** 'YYYY-MM-DD' → 'YYYY/MM/DD'（入力欄に表示する形） */
export function formatDateText(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}/${m[2]}/${m[3]}` : iso
}

/** 'YYYY-MM-DD' → 和暦の短い表記（例：H9）と正式表記（例：平成9年3月21日） */
export function warekiOf(iso: string | null | undefined): { short: string; long: string } | null {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m || !iso) return null
  const ymd = iso.slice(0, 10)
  const e = ERAS.find((x) => ymd >= x.start)
  if (!e) return null
  const ey = Number(m[1]) - e.offset
  const eyText = ey === 1 ? '元' : String(ey)
  return {
    short: `${e.key}${ey}`,
    long: `${e.name}${eyText}年${Number(m[2])}月${Number(m[3])}日`,
  }
}
