import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { Student } from '../../types'

/** DB の日付文字列をローカル日付として解釈（UTC ずれ防止） */
function parseLocalYmd(s: string): Date | null {
  const m = s.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) {
    const y = parseInt(m[1], 10)
    const mo = parseInt(m[2], 10) - 1
    const day = parseInt(m[3], 10)
    const d = new Date(y, mo, day)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/** 和暦表記（明治以降）。それ以前は null */
function toWareki(d: Date): string | null {
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  const t = d.getTime()

  const reiwaStart = new Date(2019, 4, 1).getTime()
  const heiseiStart = new Date(1989, 0, 8).getTime()
  const showaStart = new Date(1926, 11, 25).getTime()
  const taishoStart = new Date(1912, 6, 30).getTime()
  const meijiStart = new Date(1868, 8, 8).getTime()

  let era: string
  let eraYear: number

  if (t >= reiwaStart) {
    era = '令和'
    eraYear = y - 2018
  } else if (t >= heiseiStart) {
    era = '平成'
    eraYear = y - 1988
  } else if (t >= showaStart) {
    era = '昭和'
    eraYear = y - 1925
  } else if (t >= taishoStart) {
    era = '大正'
    eraYear = y - 1911
  } else if (t >= meijiStart) {
    era = '明治'
    eraYear = y - 1867
  } else {
    return null
  }

  const yearLabel = eraYear === 1 ? '元' : String(eraYear)
  return `${era}${yearLabel}年${m}月${day}日`
}

function formatBirthWithWareki(d: string | null | undefined): string {
  if (!d?.trim()) return '—'
  const parsed = parseLocalYmd(d)
  if (!parsed) {
    try {
      return format(new Date(d), 'yyyy年M月d日', { locale: ja })
    } catch {
      return d
    }
  }
  const gregorian = format(parsed, 'yyyy年M月d日', { locale: ja })
  const wareki = toWareki(parsed)
  return wareki ? `${gregorian}（${wareki}）` : gregorian
}

function genderLabel(g: Student['gender']): string {
  if (g === 'male') return '男性'
  if (g === 'female') return '女性'
  if (g === 'other') return 'その他'
  return '—'
}

function dash(v: string | null | undefined): string {
  const s = v?.trim()
  return s ? s : '—'
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-sm py-2 border-b border-gray-50 last:border-0">
      <span className="text-gray-400 shrink-0">{label}</span>
      <span className="text-gray-800 break-words">{value}</span>
    </div>
  )
}

interface Props {
  student: Student
  className?: string
}

/** 会員基本情報の閲覧表示（モーダル・会員一覧メインなどで共通利用） */
export default function MemberBasicInfoReadOnly({ student, className = '' }: Props) {
  return (
    <div className={`space-y-5 ${className}`}>
      <section>
        <h3 className="text-xs font-semibold text-lavender-400 uppercase tracking-wide mb-2">
          受講者番号・氏名
        </h3>
        <div className="rounded-xl border border-lavender-100 bg-lavender-50/30 px-4 py-1">
          <Row label="受講者番号" value={dash(student.student_code)} />
          <Row label="免許番号" value={dash(student.license_number)} />
          <Row label="氏名" value={`${student.last_name} ${student.first_name}`} />
          <Row
            label="フリガナ"
            value={
              [student.last_kana, student.first_kana]
                .map((x) => x?.trim())
                .filter(Boolean)
                .join(' ') || '—'
            }
          />
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold text-lavender-400 uppercase tracking-wide mb-2">
          プロフィール
        </h3>
        <div className="rounded-xl border border-lavender-100 px-4 py-1">
          <Row label="生年月日" value={formatBirthWithWareki(student.birth_date)} />
          <Row label="性別" value={genderLabel(student.gender)} />
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold text-lavender-400 uppercase tracking-wide mb-2">
          住所
        </h3>
        <div className="rounded-xl border border-lavender-100 px-4 py-1">
          <Row label="郵便番号" value={dash(student.postal_code)} />
          <Row label="都道府県" value={dash(student.prefecture)} />
          <Row label="市区町村" value={dash(student.city)} />
          <Row label="番地・建物" value={dash(student.address1)} />
          <Row label="住所2" value={dash(student.address2)} />
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold text-lavender-400 uppercase tracking-wide mb-2">
          連絡先
        </h3>
        <div className="rounded-xl border border-lavender-100 px-4 py-1">
          <Row label="電話" value={dash(student.phone)} />
          <Row label="携帯" value={dash(student.mobile)} />
          <Row label="メール" value={dash(student.email)} />
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold text-lavender-400 uppercase tracking-wide mb-2">
          備考
        </h3>
        <p className="text-sm text-gray-800 whitespace-pre-wrap rounded-xl border border-lavender-100 px-4 py-3 bg-gray-50/80 min-h-[3rem]">
          {student.note?.trim() ? student.note : '—'}
        </p>
      </section>

      <p className="text-[11px] text-gray-400">
        登録 {student.created_at} ／ 更新 {student.updated_at}
      </p>
    </div>
  )
}
