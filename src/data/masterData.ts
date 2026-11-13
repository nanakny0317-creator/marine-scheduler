/**
 * うーみーくん.xlsx から抽出したマスタデータ
 * 管理番号はオリジナルの値をそのまま使用（OCR帳票の3桁コードと対応）
 */

export interface MasterItem {
  code: number
  label: string
  /** 任意コード（都道府県番号など） */
  extra?: string
}

// ── 現有免許の種類 ─────────────────────────────────────────────────
export const LICENSE_CLASSES = ['一級', '二級', '湖川']
export const LICENSE_OPTIONS = ['限定1海里', '特殊', '特定']
/** 旧免許（保存値は「旧」付き、画面表示は「旧」を外す） */
export const OLD_LICENSE_CLASSES = ['旧一級', '旧二級', '旧三級', '旧四級', '旧五級', '旧湖川']

/** 現有免許の表示用まとめ（例：「二級＋特殊（設備限定）」） */
export function licenseSummary(s: {
  license_class?: string | null; license_options?: string | null; license_equipment_limited?: boolean
}): string {
  const opts = (s.license_options ?? '').split(',').map(x => x.trim()).filter(Boolean)
  const parts = [s.license_class ? s.license_class.replace(/^旧(.+)$/, '旧免許 $1') : '', ...opts].filter(Boolean)
  if (parts.length === 0) return ''
  return parts.join('＋') + (s.license_equipment_limited ? '（設備限定）' : '')
}

/**
 * 申込メール等の「現有免許」の自由記述を、種類・追加区分・設備限定に振り分ける。
 * 例）「2級小型船舶操縦士（特殊付）」→ { class: '二級', options: '特殊' }
 *     「旧4級」「四級」→ { class: '旧四級' }（三級〜五級は旧免許にしかない）
 */
export function parseLicenseText(text: string | null | undefined): {
  license_class: string | null; license_options: string | null; license_equipment_limited: boolean
} {
  const t = (text ?? '')
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\s/g, '')
  const empty = { license_class: null, license_options: null, license_equipment_limited: false }
  if (!t || /^(なし|無し|無|ない|特になし|-|ー)$/.test(t)) return empty

  const KANJI: Record<string, string> = { '1': '一', '2': '二', '3': '三', '4': '四', '5': '五' }
  const gradeM = t.match(/([1-5一二三四五])級/)
  const grade = gradeM ? (KANJI[gradeM[1]] ?? gradeM[1]) : null
  const isOld = /旧/.test(t) || (grade !== null && ['三', '四', '五'].includes(grade))

  let license_class: string | null = null
  if (grade) license_class = (isOld ? '旧' : '') + grade + '級'
  else if (/湖川/.test(t)) license_class = isOld ? '旧湖川' : '湖川'

  const opts: string[] = []
  if (/(1|一)海里/.test(t)) opts.push('限定1海里')
  if (/特殊/.test(t)) opts.push('特殊')
  if (/特定/.test(t)) opts.push('特定')

  return {
    license_class,
    license_options: opts.length ? opts.join(',') : null,
    license_equipment_limited: /設備.?限定/.test(t),
  }
}

// ── 都道府県（JIS順） ──────────────────────────────────────────────
export const PREFECTURES: string[] = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県',
  '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
  '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県',
  '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
]

// ── 国名称 ───────────────────────────────────────────────────────
// コードはうーみーくん独自体系（ISO 3166 ではない）
export const NATIONALITIES: MasterItem[] = [
  { code: 1,   label: '日本' },
  { code: 2,   label: '韓国' },
  { code: 3,   label: '朝鮮' },
  { code: 4,   label: '米国' },
  { code: 105, label: 'イスラエル' },
  { code: 107, label: 'イラン' },
  { code: 108, label: 'インド' },
  { code: 117, label: 'シリア' },
  { code: 120, label: 'タイ' },
  { code: 121, label: '中国' },
  { code: 124, label: 'ネパール' },
  { code: 125, label: 'パキスタン' },
  { code: 129, label: 'フィリピン' },
  { code: 131, label: 'ベトナム' },
  { code: 132, label: 'マレーシア' },
  { code: 201, label: 'オーストラリア' },
  { code: 205, label: 'ニュージーランド' },
  { code: 404, label: 'イギリス' },
  { code: 405, label: 'イタリア' },
  { code: 407, label: 'オランダ' },
  { code: 410, label: 'スイス' },
  { code: 412, label: 'スペイン' },
  { code: 413, label: 'チェコ' },
  { code: 416, label: 'ドイツ' },
  { code: 417, label: 'ノルウェー' },
  { code: 419, label: 'ハンガリー' },
  { code: 421, label: 'フランス' },
  { code: 431, label: 'ルーマニア' },
  { code: 500, label: 'ロシア' },
  { code: 504, label: 'ベラルーシ' },
  { code: 511, label: 'ウクライナ' },
  { code: 603, label: 'カナダ' },
  { code: 617, label: 'メキシコ' },
  { code: 703, label: 'フィンランド' },
  { code: 709, label: 'ブラジル' },
  { code: 711, label: 'ペルー' },
  { code: 712, label: 'ボリビア' },
]

// ── 資格種別 ─────────────────────────────────────────────────────
export const QUALIFICATION_TYPES: MasterItem[] = [
  { code: 1,  label: '１級' },
  { code: 2,  label: '２級' },
  { code: 4,  label: '特殊' },
  { code: 5,  label: '１級特殊' },
  { code: 6,  label: '２級特殊' },
  { code: 8,  label: '湖川' },
  { code: 21, label: '旧1級' },
  { code: 22, label: '旧2級' },
  { code: 23, label: '旧３級' },
  { code: 24, label: '旧４級' },
  { code: 25, label: '旧５級' },
  { code: 26, label: '旧湖川' },
]

// ── 試験地 ───────────────────────────────────────────────────────
export const EXAM_LOCATIONS: MasterItem[] = [
  { code: 1,  label: '大阪府大阪市' },
  { code: 2,  label: '大阪府岸和田市' },
  { code: 3,  label: '大阪府高石市' },
  { code: 4,  label: '大阪府泉大津市' },
  { code: 5,  label: '京都府京都市' },
  { code: 6,  label: '京都府舞鶴市' },
  { code: 7,  label: '滋賀県大津市' },
  { code: 8,  label: '滋賀県守山市' },
  { code: 9,  label: '滋賀県彦根市' },
  { code: 10, label: '滋賀県近江八幡市' },
  { code: 11, label: '兵庫県尼崎市' },
  { code: 12, label: '兵庫県西宮市' },
  { code: 13, label: '兵庫県芦屋市' },
  { code: 14, label: '兵庫県神戸市' },
  { code: 15, label: '兵庫県洲本市' },
  { code: 16, label: '兵庫県姫路市' },
  { code: 17, label: '兵庫県明石市' },
  { code: 18, label: '愛知県名古屋市' },
  { code: 19, label: '愛知県一宮市' },
  { code: 20, label: '愛知県岡崎市' },
  { code: 21, label: '愛知県半田市' },
  { code: 22, label: '福井県敦賀市' },
  { code: 23, label: '福井県福井市' },
  { code: 24, label: '奈良県奈良市' },
  { code: 25, label: '奈良県吉野郡下北山村' },
  { code: 26, label: '奈良県吉野郡吉野町' },
  { code: 27, label: '三重県四日市市' },
  { code: 28, label: '三重県津市' },
  { code: 29, label: '三重県尾鷲市' },
  { code: 30, label: '和歌山県和歌山市' },
  { code: 31, label: '沖縄県平良市' },
  { code: 32, label: '岐阜県岐阜市' },
  { code: 33, label: '岐阜県美濃加茂市' },
  { code: 34, label: '愛知県蒲郡市' },
  { code: 39, label: '福島県郡山市' },
  { code: 40, label: '愛知県豊橋市' },
  { code: 41, label: '石川県河北郡津幡町' },
  { code: 42, label: '愛知県高浜市' },
  { code: 44, label: '愛知県知多郡武豊町' },
  { code: 45, label: '大阪府守口市' },
  { code: 46, label: '兵庫県たつの市' },
  { code: 47, label: '山梨県南都留郡' },
  { code: 48, label: '東京都大田区' },
  { code: 49, label: '大阪府貝塚市' },
  { code: 50, label: '石川県金沢市' },
  { code: 51, label: '大阪府摂津市' },
  { code: 52, label: '愛知県豊川市' },
  { code: 53, label: '富山県高岡市' },
  { code: 54, label: '沖縄県国頭郡本部町' },
  { code: 55, label: '神奈川県横浜市' },
  { code: 56, label: '愛知県西尾市' },
  { code: 57, label: '大阪府門真市' },
  { code: 58, label: '沖縄県沖縄市' },
  { code: 59, label: '静岡県湖西市' },
]

// ── 講習地 ───────────────────────────────────────────────────────
export const COURSE_LOCATIONS: MasterItem[] = [
  { code: 1,  label: '大阪府大阪市',           extra: '27' },
  { code: 2,  label: '大阪府泉佐野市',         extra: '27' },
  { code: 3,  label: '大阪府泉大津市',         extra: '27' },
  { code: 4,  label: '大阪府高石市',           extra: '27' },
  { code: 5,  label: '京都府京都市',           extra: '26' },
  { code: 6,  label: '京都府舞鶴市',           extra: '26' },
  { code: 7,  label: '滋賀県大津市',           extra: '25' },
  { code: 8,  label: '滋賀県守山市',           extra: '25' },
  { code: 9,  label: '滋賀県近江八幡市',       extra: '25' },
  { code: 10, label: '滋賀県彦根市',           extra: '25' },
  { code: 11, label: '奈良県奈良市',           extra: '29' },
  { code: 12, label: '兵庫県神戸市',           extra: '28' },
  { code: 13, label: '兵庫県尼崎市',           extra: '28' },
  { code: 14, label: '兵庫県芦屋市',           extra: '28' },
  { code: 15, label: '兵庫県西宮市',           extra: '28' },
  { code: 16, label: '兵庫県姫路市',           extra: '28' },
  { code: 17, label: '兵庫県明石市',           extra: '28' },
  { code: 18, label: '福井県小浜市',           extra: '18' },
  { code: 19, label: '福井県敦賀市',           extra: '18' },
  { code: 20, label: '福井県福井市',           extra: '18' },
  { code: 21, label: '愛知県名古屋市',         extra: '23' },
  { code: 22, label: '愛知県一宮市',           extra: '23' },
  { code: 23, label: '愛知県岡崎市',           extra: '23' },
  { code: 24, label: '愛知県春日井市',         extra: '23' },
  { code: 25, label: '愛知県知多郡武豊町',     extra: '23' },
  { code: 26, label: '愛知県豊田市',           extra: '23' },
  { code: 27, label: '三重県四日市市',         extra: '24' },
  { code: 28, label: '三重県松阪市',           extra: '24' },
  { code: 29, label: '三重県津市',             extra: '24' },
  { code: 30, label: '三重県鈴鹿市',           extra: '24' },
  { code: 31, label: '岐阜県岐阜市',           extra: '21' },
  { code: 32, label: '和歌山県田辺市',         extra: '30' },
  { code: 33, label: '和歌山県和歌山市',       extra: '30' },
  { code: 34, label: '兵庫県加古川市',         extra: '28' },
  { code: 35, label: '兵庫県洲本市',           extra: '28' },
  { code: 36, label: '静岡県沼津市',           extra: '22' },
  { code: 37, label: '静岡県浜松市',           extra: '22' },
  { code: 38, label: '神奈川県横浜市',         extra: '14' },
  { code: 39, label: '東京都港区',             extra: '13' },
  { code: 40, label: '三重県尾鷲市',           extra: '24' },
  { code: 41, label: '富山県富山市',           extra: '16' },
  { code: 42, label: '三重県桑名市',           extra: '24' },
  { code: 43, label: '岡山県岡山市',           extra: '33' },
  { code: 44, label: '東京都中野区',           extra: '13' },
  { code: 45, label: '岐阜県可児市',           extra: '21' },
  { code: 46, label: '和歌山県御坊市',         extra: '30' },
  { code: 47, label: '福岡県福岡市',           extra: '40' },
  { code: 48, label: '石川県金沢市',           extra: '17' },
  { code: 49, label: '三重県伊勢市',           extra: '24' },
  { code: 50, label: '埼玉県川口市',           extra: '11' },
  { code: 51, label: '愛知県碧南市',           extra: '23' },
  { code: 52, label: '大阪府摂津市',           extra: '27' },
  { code: 53, label: '愛知県高浜市',           extra: '23' },
  { code: 54, label: '埼玉県さいたま市',       extra: '11' },
  { code: 55, label: '石川県加賀市',           extra: '17' },
  { code: 56, label: '石川県河北郡内灘町',     extra: '17' },
  { code: 57, label: '千葉県千葉市中央区',     extra: '12' },
  { code: 58, label: '静岡県焼津市',           extra: '22' },
  { code: 59, label: '宮城県仙台市',           extra: '04' },
  { code: 60, label: '富山県高岡市',           extra: '16' },
  { code: 61, label: '千葉県柏市',             extra: '12' },
  { code: 62, label: '岡山県備前市',           extra: '33' },
  { code: 63, label: '東京都江東区',           extra: '13' },
  { code: 64, label: '愛知県あま市',           extra: '23' },
  { code: 65, label: '静岡県富士市',           extra: '22' },
  { code: 67, label: '長野県長野市',           extra: '20' },
  { code: 68, label: '長野県諏訪市',           extra: '20' },
  { code: 69, label: '大阪府堺市',             extra: '27' },
  { code: 70, label: '千葉県市川市',           extra: '12' },
  { code: 71, label: '愛知県津島市',           extra: '23' },
  { code: 72, label: '大阪府門真市',           extra: '27' },
]

// ── 講習要件 ─────────────────────────────────────────────────────
export const TRAINING_REQUIREMENTS: MasterItem[] = [
  { code: 1, label: '一号乗船履歴' },
  { code: 2, label: '二号特別' },
  { code: 3, label: '三号講習' },
]

// ── 運輸局・支局コード（申請書の本局コード・支局コード欄） ──────────────
// うーみーくん.xlsx Sheet9 より。元データのまま（新潟運輸局の下に関東の支局が並ぶ箇所も含む）
export interface TransportBureau {
  bureauCode: string   // 本局コード（2桁）
  branchCode: string   // 支局コード（2桁）
  bureau: string       // 運輸局名
  branch: string       // 支局名
}

export const TRANSPORT_BUREAUS: TransportBureau[] = [
  { bureauCode: '01', branchCode: '01', bureau: '北海道運輸局', branch: '本部' },
  { bureauCode: '01', branchCode: '02', bureau: '北海道運輸局', branch: '函館海運支局' },
  { bureauCode: '01', branchCode: '03', bureau: '北海道運輸局', branch: '室蘭海運支局' },
  { bureauCode: '01', branchCode: '04', bureau: '北海道運輸局', branch: '釧路海運支局' },
  { bureauCode: '01', branchCode: '05', bureau: '北海道運輸局', branch: '稚内海運支局' },
  { bureauCode: '02', branchCode: '01', bureau: '東北運輸局', branch: '本部' },
  { bureauCode: '02', branchCode: '02', bureau: '東北運輸局', branch: '釜石海運支局' },
  { bureauCode: '02', branchCode: '03', bureau: '東北運輸局', branch: '気仙沼海運支局' },
  { bureauCode: '02', branchCode: '04', bureau: '東北運輸局', branch: '八戸海運支局' },
  { bureauCode: '02', branchCode: '05', bureau: '東北運輸局', branch: '青森海運支局' },
  { bureauCode: '02', branchCode: '06', bureau: '東北運輸局', branch: '小名浜海運支局' },
  { bureauCode: '02', branchCode: '07', bureau: '東北運輸局', branch: '宮古海運支局' },
  { bureauCode: '02', branchCode: '08', bureau: '東北運輸局', branch: '石巻海運支局' },
  { bureauCode: '03', branchCode: '01', bureau: '新潟運輸局', branch: '本部' },
  { bureauCode: '03', branchCode: '02', bureau: '新潟運輸局', branch: '秋田海運支局' },
  { bureauCode: '03', branchCode: '03', bureau: '新潟運輸局', branch: '酒田海運支局' },
  { bureauCode: '03', branchCode: '04', bureau: '新潟運輸局', branch: '東京海運支局' },
  { bureauCode: '03', branchCode: '05', bureau: '新潟運輸局', branch: '川崎海運支局' },
  { bureauCode: '03', branchCode: '06', bureau: '新潟運輸局', branch: '千葉海運支局' },
  { bureauCode: '03', branchCode: '07', bureau: '新潟運輸局', branch: '銚子海運支局' },
  { bureauCode: '03', branchCode: '08', bureau: '新潟運輸局', branch: '那珂湊海運支局' },
  { bureauCode: '05', branchCode: '01', bureau: '中部運輸局', branch: '本部' },
  { bureauCode: '05', branchCode: '02', bureau: '中部運輸局', branch: '伏木海運支局' },
  { bureauCode: '05', branchCode: '03', bureau: '中部運輸局', branch: '清水海運支局' },
  { bureauCode: '05', branchCode: '04', bureau: '中部運輸局', branch: '下田海運支局' },
  { bureauCode: '05', branchCode: '05', bureau: '中部運輸局', branch: '四日市海運支局' },
  { bureauCode: '05', branchCode: '06', bureau: '中部運輸局', branch: '鳥羽海運支局' },
  { bureauCode: '05', branchCode: '07', bureau: '中部運輸局', branch: '七尾海運支局' },
  { bureauCode: '06', branchCode: '00', bureau: '近畿運輸局', branch: '本部' },
  { bureauCode: '06', branchCode: '02', bureau: '近畿運輸局', branch: '敦賀海運支局' },
  { bureauCode: '06', branchCode: '03', bureau: '近畿運輸局', branch: '舞鶴海運支局' },
  { bureauCode: '06', branchCode: '04', bureau: '近畿運輸局', branch: '和歌山海運支局' },
  { bureauCode: '06', branchCode: '05', bureau: '近畿運輸局', branch: '勝浦海運支局' },
  { bureauCode: '07', branchCode: '01', bureau: '神戸海運監理部', branch: '本部' },
  { bureauCode: '07', branchCode: '02', bureau: '神戸海運監理部', branch: '相生海運支局' },
  { bureauCode: '08', branchCode: '01', bureau: '中国運輸局', branch: '本部' },
  { bureauCode: '08', branchCode: '02', bureau: '中国運輸局', branch: '尾道海運支局' },
  { bureauCode: '08', branchCode: '03', bureau: '中国運輸局', branch: '因島海運支局' },
  { bureauCode: '08', branchCode: '04', bureau: '中国運輸局', branch: '木江海運支局' },
  { bureauCode: '08', branchCode: '05', bureau: '中国運輸局', branch: '呉海運支局' },
  { bureauCode: '08', branchCode: '06', bureau: '中国運輸局', branch: '境海運支局' },
  { bureauCode: '08', branchCode: '07', bureau: '中国運輸局', branch: '松江海運支局' },
  { bureauCode: '08', branchCode: '08', bureau: '中国運輸局', branch: '玉野海運支局' },
  { bureauCode: '08', branchCode: '09', bureau: '中国運輸局', branch: '徳山海運支局' },
  { bureauCode: '09', branchCode: '01', bureau: '四国運輸局', branch: '本部' },
  { bureauCode: '09', branchCode: '02', bureau: '四国運輸局', branch: '徳島海運支局' },
  { bureauCode: '09', branchCode: '03', bureau: '四国運輸局', branch: '松山海運支局' },
  { bureauCode: '09', branchCode: '04', bureau: '四国運輸局', branch: '今治海運支局' },
  { bureauCode: '09', branchCode: '05', bureau: '四国運輸局', branch: '宇和島海運支局' },
  { bureauCode: '09', branchCode: '06', bureau: '四国運輸局', branch: '新居浜海運支局' },
  { bureauCode: '09', branchCode: '07', bureau: '四国運輸局', branch: '高知海運支局' },
  { bureauCode: '10', branchCode: '01', bureau: '九州運輸局', branch: '本部' },
  { bureauCode: '10', branchCode: '02', bureau: '九州運輸局', branch: '若松海運支局' },
  { bureauCode: '10', branchCode: '03', bureau: '九州運輸局', branch: '福岡海運支局' },
  { bureauCode: '10', branchCode: '04', bureau: '九州運輸局', branch: '長崎海運支局' },
  { bureauCode: '10', branchCode: '05', bureau: '九州運輸局', branch: '佐世保海運支局' },
  { bureauCode: '10', branchCode: '06', bureau: '九州運輸局', branch: '三角海運支局' },
  { bureauCode: '10', branchCode: '07', bureau: '九州運輸局', branch: '大分海運支局' },
  { bureauCode: '10', branchCode: '08', bureau: '九州運輸局', branch: '油津海運支局' },
  { bureauCode: '10', branchCode: '09', bureau: '九州運輸局', branch: '鹿児島海運支局' },
  { bureauCode: '10', branchCode: '10', bureau: '九州運輸局', branch: '名瀬海運支局' },
  { bureauCode: '10', branchCode: '11', bureau: '九州運輸局', branch: '下関海運支局' },
  { bureauCode: '04', branchCode: '01', bureau: '関東運輸局', branch: '本部' },
  { bureauCode: '11', branchCode: '01', bureau: '沖縄運輸局', branch: '本部' },
]

/** 普段の提出先：近畿運輸局 本部 */
export const DEFAULT_TRANSPORT_BUREAU: TransportBureau =
  TRANSPORT_BUREAUS.find(b => b.bureauCode === '06' && b.branchCode === '00')!

export function findTransportBureau(bureauCode: string, branchCode: string): TransportBureau | undefined {
  return TRANSPORT_BUREAUS.find(b => b.bureauCode === bureauCode && b.branchCode === branchCode)
}

// ── 講習機関（更新講習の実施機関。申請書の講習機関欄はコード2桁） ───────────
// うーみーくん.xlsx Sheet2 より
export const COURSE_ORGANIZATIONS: MasterItem[] = [
  { code: 1,  label: '海レ協' },
  { code: 2,  label: '養成協会' },
  { code: 31, label: 'マリンテクノ' },
  { code: 67, label: '西日本海技専門学院' },
]

/** 講習機関コードを申請書用の2桁文字列に（例：1 → "01"） */
export const courseOrgCode2 = (code: number): string => String(code).padStart(2, '0')

// ── ユーティリティ ───────────────────────────────────────────────
export function findNationality(code: number): MasterItem | undefined {
  return NATIONALITIES.find(n => n.code === code)
}

export function nationalityLabel(code: number | null | undefined): string {
  if (!code) return ''
  return findNationality(code)?.label ?? String(code)
}

export function nationalityCode(label: string): number | undefined {
  return NATIONALITIES.find(n => n.label === label)?.code
}
