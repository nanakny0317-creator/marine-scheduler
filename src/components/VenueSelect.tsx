import { useEffect, useState } from 'react'
import type { Venue } from '../types'
import { venuesApi } from '../lib/api'

interface Props {
  value: string
  onChange: (name: string) => void
  className?: string
  placeholder?: string
}

/**
 * 会場マスター（有効な会場のみ）から選ぶプルダウン。地域・都道府県ごとにグループ表示。
 * マスターにない既存値（旧データの手入力など）は「（未登録）」として残す。
 */
export default function VenueSelect({ value, onChange, className = 'field-select', placeholder = '-- 選択 --' }: Props) {
  const [venues, setVenues] = useState<Venue[]>([])

  useEffect(() => {
    venuesApi.list(true).then(setVenues).catch(() => setVenues([]))
  }, [])

  const groups = venues.reduce<Map<string, Venue[]>>((m, v) => {
    const key = `${v.region}｜${v.prefecture}`
    if (!m.has(key)) m.set(key, [])
    m.get(key)!.push(v)
    return m
  }, new Map())

  const isLegacy = !!value && venues.length > 0 && !venues.some(v => v.name === value)

  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={className}>
      <option value="">{placeholder}</option>
      {isLegacy && <option value={value}>{value}（未登録）</option>}
      {[...groups.entries()].map(([key, vs]) => (
        <optgroup key={key} label={key.replace('｜', ' ')}>
          {vs.map(v => (
            <option key={v.id} value={v.name}>{v.name}{v.city ? `（${v.city}）` : ''}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
