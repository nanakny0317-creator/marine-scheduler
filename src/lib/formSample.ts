/**
 * 印字位置設定の「見本の文字」：架空の人のデータで申請書の各欄を埋める
 *
 * 実際の印刷と同じ buildFormData で作るので、カナの分け方・住所の行の分かれ方なども本番と同じになる。
 * データの無い欄（チェック欄の×や、この人には関係の無い欄）も、位置を確かめられるよう見本で埋める。
 */
import type { Enrollment, Student } from '../types'
import { buildFormData, type FormData } from './formFieldMap'
import type { FieldDef } from './formPrint'

/** 印字位置設定の画像ページ → 申込の種類（1=試験 2=免許 3=更新 4=失効再交付 5=訂正） */
const PAGE_APP_TYPE: Record<number, string> = { 1: 'new', 2: 'new', 3: 'renewal', 4: 'lapsed', 5: 'correction' }

const now = new Date().toISOString()
const SAMPLE_STUDENT: Student = {
  id: 0, student_code: null,
  license_number: '0300160004901', license_issue_date: '2021-11-20', license_expiry: '2026-12-19',
  license_class: '二級', license_options: '特殊', license_equipment_limited: false,
  domicile: '大阪府', nationality: null,
  last_name: '見本', first_name: '太郎', last_kana: 'ミホン', first_kana: 'ジョウタロウ',
  birth_date: '1985-11-20', gender: 'male',
  postal_code: '5300001', prefecture: '大阪府', city: '大阪市北区', address1: '梅田一丁目２番３号',
  address2: 'サンプルマンション', address_room: '１０１',
  phone: '06-1234-5678', mobile: '090-1234-5678', email: null, note: null,
  created_at: now, updated_at: now,
}

function sampleEnrollment(appType: string): Enrollment {
  const extra: Record<string, unknown> = appType === 'new'
    ? {
        application_type: 'new', exam_date: '2026-12-06', exam_location: '大阪府大阪市', exam_qual_type: '二級',
        exam_gakka: true, exam_jitsugi: true, shintai: 'need', application_date: '2026-11-19',
      }
    : {
        application_type: appType, course_location: '大阪府大阪市', course_time: '13:30', license_return: 'yes',
        correction: 'yes', correction_items: ['name', 'address', 'domicile', 'nationality'],
        course_org_code: 1, bureau_code: '06', branch_code: '00', application_date: '2026-11-19',
      }
  return {
    id: 0, student_id: 0, menu: '', course_date: '2026-11-13', venue: '大阪府大阪市',
    status: 'pending', extra_json: JSON.stringify(extra), note: null, created_at: now, updated_at: now,
  }
}

/** 画像ページの見本データ */
export function sampleDataForPage(page: number): FormData {
  const appType = PAGE_APP_TYPE[page] ?? 'new'
  // 試験申請書は②（同時申請）も本番と同じ形で見られるよう、相手の申込を付ける
  const joint = page === 1 ? sampleJointEnrollment() : null
  try { return buildFormData(SAMPLE_STUDENT, sampleEnrollment(appType), null, [], joint) } catch { return {} }
}

/** 同時申請の相手（後に受験する試験） */
function sampleJointEnrollment(): Enrollment {
  const extra = {
    application_type: 'new', exam_date: '2026-12-20', exam_location: '大阪府大阪市', exam_qual_type: '特殊',
    exam_gakka: true, exam_jitsugi: true, shintai: 'have',
  }
  return {
    id: -2, student_id: 0, menu: '', course_date: null, venue: '大阪府大阪市',
    status: 'pending', extra_json: JSON.stringify(extra), note: null, created_at: now, updated_at: now,
  }
}

const FILL_DIGITS = '1234567890'

/** 欄に印字する見本の文字（データが空の欄も見本で埋める） */
export function sampleValueFor(f: Pick<FieldDef, 'type' | 'key' | 'maxChars' | 'startChar' | 'label'>, data: FormData): string {
  if (f.type === 'mark') return '×'
  const v = data[f.key] ?? ''
  if (f.type === 'text') return v || f.label.replace(/^[①-⑳⑴-⒇\d]+_?/, '') || '見本'
  const n = f.maxChars ?? 1
  const start = f.startChar ?? 0
  // その欄の分（何文字目から）に字が残っていればデータのまま
  if (Array.from(v).slice(start, start + n).some(ch => ch.trim())) return v
  if (n === 1) return ' '.repeat(start) + '×'          // 1マスの欄はチェック欄が多いので×
  return ' '.repeat(start) + FILL_DIGITS.repeat(Math.ceil(n / 10)).slice(0, n)
}
