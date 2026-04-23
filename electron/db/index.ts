/**
 * SQLite ラッパー (sql.js ベース)
 *
 * sql.js はWASMなのでファイル永続化を手動で行う。
 * better-sqlite3 互換のシンプルなインターフェースを提供する。
 * 将来 Supabase に移行する際は getDb() 以下だけ差し替えればよい。
 */
import initSqlJs, { Database, SqlJsStatic } from 'sql.js'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { SCHEMA_SQL } from './schema'

let SQL: SqlJsStatic | null = null
let db: Database | null = null
let dbPath: string = ''
let inTransaction = false

export async function initDb(): Promise<Database> {
  if (db) return db

  dbPath =
    process.env.NODE_ENV === 'development'
      ? path.join(process.cwd(), 'dev.db')
      : path.join(app.getPath('userData'), 'scheduler.db')

  // sql.js の WASM ファイルパスを指定（dev/prod 両対応）
  const wasmPath = app.isPackaged
    ? path.join(process.resourcesPath, 'sql.js', 'dist', 'sql-wasm.wasm')
    : path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')

  SQL = await initSqlJs({
    locateFile: () => wasmPath,
  })

  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath)
    db = new SQL.Database(buf)
  } else {
    db = new SQL.Database()
  }

  // スキーマ適用
  db.run(SCHEMA_SQL)

  // マイグレーション: student_code カラムが存在しない場合は追加
  const tableInfo = db.exec("PRAGMA table_info(students)")
  if (tableInfo.length > 0) {
    const cols = tableInfo[0].values.map((row) => row[1] as string)
    if (!cols.includes('student_code')) {
      db.run('ALTER TABLE students ADD COLUMN student_code TEXT')
    }
  }
  // 部分ユニークインデックス（student_code が NULL でない行のみ重複禁止）
  db.run(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_student_code ON students(student_code) WHERE student_code IS NOT NULL'
  )

  // マイグレーション: license_number カラムが存在しない場合は追加
  if (tableInfo.length > 0) {
    const cols = tableInfo[0].values.map((row) => row[1] as string)
    if (!cols.includes('license_number')) {
      db.run('ALTER TABLE students ADD COLUMN license_number TEXT')
    }
  }

  // マイグレーション: pending_reviews テーブル（新規DB以外では SCHEMA_SQL の IF NOT EXISTS で作成済み）
  db.run(`
    CREATE TABLE IF NOT EXISTS pending_reviews (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id     INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      candidate_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      match_reasons  TEXT NOT NULL DEFAULT '[]',
      match_score    INTEGER NOT NULL DEFAULT 0,
      status         TEXT NOT NULL DEFAULT 'pending'
                     CHECK(status IN ('pending','resolved')),
      resolution     TEXT CHECK(resolution IN ('merged','different')),
      created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `)
  db.run(`
    CREATE TRIGGER IF NOT EXISTS pending_reviews_updated_at
      AFTER UPDATE ON pending_reviews
      FOR EACH ROW
      BEGIN
        UPDATE pending_reviews SET updated_at = datetime('now','localtime') WHERE id = OLD.id;
      END
  `)

  // マイグレーション: venues カラム追加
  const venueInfo = db.exec("PRAGMA table_info(venues)")
  if (venueInfo.length > 0) {
    const venueCols = venueInfo[0].values.map((row) => row[1] as string)
    if (!venueCols.includes('region')) {
      db.run("ALTER TABLE venues ADD COLUMN region TEXT NOT NULL DEFAULT '近畿'")
      db.run("UPDATE venues SET region = '近畿'")
    }
    if (!venueCols.includes('city')) {
      db.run("ALTER TABLE venues ADD COLUMN city TEXT")
    }
  }

  // マイグレーション: 既存会場レコードに city を反映（city が NULL の行のみ更新）
  const CITY_MAP: Record<string, string> = {
    'ヤマハマリーナ琵琶湖': '大津市',
    'ヤンマーサンセットマリーナ': '大津市',
    '長龍マリーナ': '守山市',
    '彦根ステーションホテル': '彦根市',
    '京都市生涯学習総合センター（京都アスニー）': '京都市右京区',
    '京都市生涯学習総合センター山科（アスニー山科）': '京都市山科区',
    '京都府立総合社会福祉会館（ハートピア京都）': '京都市中京区',
    '舞鶴21ビル': '舞鶴市',
    '大手前センチュリービル': '大阪市中央区',
    'いずみさの関空マリーナ': '泉佐野市',
    'テクスピア大阪': '泉大津市',
    '堺市総合福祉会館': '堺市堺区',
    '摂津市立コミュニティプラザ': '摂津市',
    '赤穂化成ハーモニーホール': '赤穂市',
    '兵庫県立のじぎく会館': '神戸市中央区',
    '兵庫県中央労働センター': '神戸市中央区',
    '姫路商工会議所': '姫路市',
    '姫路市市民会館': '姫路市',
    '姫路市勤労市民会館': '姫路市',
    '明石商工会議所': '明石市',
    '明石市生涯学習センター': '明石市',
    '新西宮ヨットハーバー': '西宮市',
    '加古川海洋文化センター': '加古川市',
    'なら100年会館': '奈良市',
    '県民交流プラザ 和歌山ビッグ愛': '和歌山市',
    '和歌山県民文化会館': '和歌山市',
    '御坊商工会議所': '御坊市',
    '和歌山県立情報交流センター Big-U': '田辺市',
    '山中湖畔荘【ホテル清渓】': '南都留郡山中湖村',
    '山中湖情報創造館': '南都留郡山中湖村',
    '勝山ふれあいセンター': '南都留郡富士河口湖町',
    'YCC県民文化ホール': '甲府市',
    'かいてらす': '甲府市',
    '新潟テルサ': '新潟市中央区',
    'ワ－クプラザ柏崎': '柏崎市',
    '佐渡汽船ターミナルビル': '新潟市中央区',
    '直江津港湾会館': '上越市',
    '上越市市民プラザ': '上越市',
    '新産管理センター': '新潟市東区',
    'ハイブ長岡': '長岡市',
    'サンライフ長岡': '長岡市',
    '村上市民ふれあいセンター': '村上市',
    '村上勤労者総合福祉センター': '村上市',
    '新潟交通佐和田ビル': '佐渡市',
    '岩瀬カナル会館': '富山市',
    '伏木コミュニティセンター': '高岡市',
    '金沢市異業種研修会館': '金沢市',
    '金沢市ものづくり会館': '金沢市',
    'のとふれあい文化センター': '鳳珠郡穴水町',
    '長野社会福祉総合センター': '長野市',
    '蔵春閣': '長野市',
    '松本市浅間温泉文化センター': '松本市',
    '信濃町公民館野尻湖支館': '上水内郡信濃町',
    '諏訪湖漁業協同組合': '諏訪市',
    '諏訪市文化センター': '諏訪市',
    'いねす（さかい地域交流センター）': '坂井市',
    'ユー・アイふくい': '福井市',
    '敦賀商工会議所': '敦賀市',
    '小浜商工会議所': '小浜市',
    '保健福祉センターはあとぴあ': '福井市',
    '三国商工会館': '坂井市',
    'OKBふれあい会館': '岐阜市',
    '可児市福祉センター': '可児市',
    'アルラ(浜松卸商センター)': '浜松市中央区',
    'ワークピア磐田': '磐田市',
    '静岡労政会館': '静岡市葵区',
    '清水マリンビル': '静岡市清水区',
    '富士市交流センター': '富士市',
    '沼津市民文化センター': '沼津市',
    '焼津市文化センター': '焼津市',
    '熱海マリーナ': '熱海市',
    '下田市民スポーツセンター': '下田市',
    'ロゼシアター': '富士市',
    '掛川市文化会館シオーネ': '掛川市',
    'プラサヴェルデ': '沼津市',
    'ミタチ第２ビル': '名古屋市中区',
    '刈谷市産業振興センター': '刈谷市',
    '岡崎市民会館': '岡崎市',
    '岡崎商工会議所': '岡崎市',
    'アイプラザ半田': '半田市',
    'ライフポートとよはし': '豊橋市',
    'アイプラザ豊橋': '豊橋市',
    '一宮市民会館': '一宮市',
    '春日井市総合体育館': '春日井市',
    '蒲郡商工会議所': '蒲郡市',
    'グリーンパレス春日井': '春日井市',
    '蒲郡市民会館': '蒲郡市',
    '衣浦港湾会館': '碧南市',
    '豊田市福祉センター': '豊田市',
    'NTPマリーナりんくう': '常滑市',
    '豊川市勤労福祉会館': '豊川市',
    'NTPマリーナ高浜': '高浜市',
    '津島市文化会館': '津島市',
    'あま市七宝焼アートヴィレッジ': 'あま市',
    '赤羽根市民館': '田原市',
    '名古屋港少年少女ヨットトレーニングセンター': '名古屋市港区',
    'アイプラザ一宮': '一宮市',
  }
  for (const [name, city] of Object.entries(CITY_MAP)) {
    db.run('UPDATE venues SET city = ? WHERE name = ? AND city IS NULL', [city, name])
  }

  // 会場マスターの初期シード（近畿・中部それぞれ未登録の場合のみ）
  type VenueSeedRow = { region: string; prefecture: string; city: string | null; name: string; sort_order: number }

  const KINKI_SEED: VenueSeedRow[] = [
    { region: '近畿', prefecture: '滋賀県', name: 'ヤマハマリーナ琵琶湖',                        sort_order: 10 },
    { region: '近畿', prefecture: '滋賀県', name: 'ヤンマーサンセットマリーナ',                   sort_order: 20 },
    { region: '近畿', prefecture: '滋賀県', name: '長龍マリーナ',                                sort_order: 30 },
    { region: '近畿', prefecture: '滋賀県', name: '彦根ステーションホテル',                       sort_order: 40 },
    { region: '近畿', prefecture: '京都府', name: '京都市生涯学習総合センター（京都アスニー）',     sort_order: 10 },
    { region: '近畿', prefecture: '京都府', name: '京都市生涯学習総合センター山科（アスニー山科）', sort_order: 20 },
    { region: '近畿', prefecture: '京都府', name: '京都府立総合社会福祉会館（ハートピア京都）',     sort_order: 30 },
    { region: '近畿', prefecture: '京都府', name: '舞鶴21ビル',                                  sort_order: 40 },
    { region: '近畿', prefecture: '大阪府', name: '大手前センチュリービル',                       sort_order: 10 },
    { region: '近畿', prefecture: '大阪府', name: 'いずみさの関空マリーナ',                       sort_order: 20 },
    { region: '近畿', prefecture: '大阪府', name: 'テクスピア大阪',                               sort_order: 30 },
    { region: '近畿', prefecture: '大阪府', name: '堺市総合福祉会館',                             sort_order: 40 },
    { region: '近畿', prefecture: '大阪府', name: '摂津市立コミュニティプラザ',                   sort_order: 50 },
    { region: '近畿', prefecture: '兵庫県', name: '赤穂化成ハーモニーホール',                     sort_order: 10 },
    { region: '近畿', prefecture: '兵庫県', name: '兵庫県立のじぎく会館',                        sort_order: 20 },
    { region: '近畿', prefecture: '兵庫県', name: '兵庫県中央労働センター',                       sort_order: 30 },
    { region: '近畿', prefecture: '兵庫県', name: '姫路商工会議所',                               sort_order: 40 },
    { region: '近畿', prefecture: '兵庫県', name: '姫路市市民会館',                               sort_order: 50 },
    { region: '近畿', prefecture: '兵庫県', name: '姫路市勤労市民会館',                           sort_order: 60 },
    { region: '近畿', prefecture: '兵庫県', name: '明石商工会議所',                               sort_order: 70 },
    { region: '近畿', prefecture: '兵庫県', name: '明石市生涯学習センター',                       sort_order: 80 },
    { region: '近畿', prefecture: '兵庫県', name: '新西宮ヨットハーバー',                         sort_order: 90 },
    { region: '近畿', prefecture: '兵庫県', name: '加古川海洋文化センター',                       sort_order: 100 },
    { region: '近畿', prefecture: '奈良県', name: 'なら100年会館',                                sort_order: 10 },
    { region: '近畿', prefecture: '和歌山県', name: '県民交流プラザ 和歌山ビッグ愛',              sort_order: 10 },
    { region: '近畿', prefecture: '和歌山県', name: '和歌山県民文化会館',                         sort_order: 20 },
    { region: '近畿', prefecture: '和歌山県', name: '御坊商工会議所',                             sort_order: 30 },
    { region: '近畿', prefecture: '和歌山県', name: '和歌山県立情報交流センター Big-U',            sort_order: 40 },
  ]

  const CHUBU_SEED: VenueSeedRow[] = [
    { region: '中部', prefecture: '山梨県', name: '山中湖畔荘【ホテル清渓】',                sort_order: 10 },
    { region: '中部', prefecture: '山梨県', name: '山中湖情報創造館',                        sort_order: 20 },
    { region: '中部', prefecture: '山梨県', name: '勝山ふれあいセンター',                    sort_order: 30 },
    { region: '中部', prefecture: '山梨県', name: 'YCC県民文化ホール',                       sort_order: 40 },
    { region: '中部', prefecture: '山梨県', name: 'かいてらす',                              sort_order: 50 },
    { region: '中部', prefecture: '新潟県', name: '新潟テルサ',                              sort_order: 10 },
    { region: '中部', prefecture: '新潟県', name: 'ワ－クプラザ柏崎',                        sort_order: 20 },
    { region: '中部', prefecture: '新潟県', name: '佐渡汽船ターミナルビル',                  sort_order: 30 },
    { region: '中部', prefecture: '新潟県', name: '直江津港湾会館',                          sort_order: 40 },
    { region: '中部', prefecture: '新潟県', name: '上越市市民プラザ',                        sort_order: 50 },
    { region: '中部', prefecture: '新潟県', name: '新産管理センター',                        sort_order: 60 },
    { region: '中部', prefecture: '新潟県', name: 'ハイブ長岡',                              sort_order: 70 },
    { region: '中部', prefecture: '新潟県', name: 'サンライフ長岡',                          sort_order: 80 },
    { region: '中部', prefecture: '新潟県', name: '村上市民ふれあいセンター',                sort_order: 90 },
    { region: '中部', prefecture: '新潟県', name: '村上勤労者総合福祉センター',              sort_order: 100 },
    { region: '中部', prefecture: '新潟県', name: '新潟交通佐和田ビル',                      sort_order: 110 },
    { region: '中部', prefecture: '富山県', name: '岩瀬カナル会館',                          sort_order: 10 },
    { region: '中部', prefecture: '富山県', name: '伏木コミュニティセンター',                sort_order: 20 },
    { region: '中部', prefecture: '石川県', name: '金沢市異業種研修会館',                    sort_order: 10 },
    { region: '中部', prefecture: '石川県', name: '金沢市ものづくり会館',                    sort_order: 20 },
    { region: '中部', prefecture: '石川県', name: 'のとふれあい文化センター',                sort_order: 30 },
    { region: '中部', prefecture: '長野県', name: '長野社会福祉総合センター',                sort_order: 10 },
    { region: '中部', prefecture: '長野県', name: '蔵春閣',                                  sort_order: 20 },
    { region: '中部', prefecture: '長野県', name: '松本市浅間温泉文化センター',              sort_order: 30 },
    { region: '中部', prefecture: '長野県', name: '信濃町公民館野尻湖支館',                  sort_order: 40 },
    { region: '中部', prefecture: '長野県', name: '諏訪湖漁業協同組合',                      sort_order: 50 },
    { region: '中部', prefecture: '長野県', name: '諏訪市文化センター',                      sort_order: 60 },
    { region: '中部', prefecture: '福井県', name: 'いねす（さかい地域交流センター）',        sort_order: 10 },
    { region: '中部', prefecture: '福井県', name: 'ユー・アイふくい',                        sort_order: 20 },
    { region: '中部', prefecture: '福井県', name: '敦賀商工会議所',                          sort_order: 30 },
    { region: '中部', prefecture: '福井県', name: '小浜商工会議所',                          sort_order: 40 },
    { region: '中部', prefecture: '福井県', name: '保健福祉センターはあとぴあ',              sort_order: 50 },
    { region: '中部', prefecture: '福井県', name: '三国商工会館',                            sort_order: 60 },
    { region: '中部', prefecture: '岐阜県', name: 'OKBふれあい会館',                         sort_order: 10 },
    { region: '中部', prefecture: '岐阜県', name: '可児市福祉センター',                      sort_order: 20 },
    { region: '中部', prefecture: '岐阜県', name: '飛島マリン 岐阜講習会場',                 sort_order: 30 },
    { region: '中部', prefecture: '静岡県', name: 'アルラ(浜松卸商センター)',                sort_order: 10 },
    { region: '中部', prefecture: '静岡県', name: 'ワークピア磐田',                          sort_order: 20 },
    { region: '中部', prefecture: '静岡県', name: '静岡労政会館',                            sort_order: 30 },
    { region: '中部', prefecture: '静岡県', name: '清水マリンビル',                          sort_order: 40 },
    { region: '中部', prefecture: '静岡県', name: '富士市交流センター',                      sort_order: 50 },
    { region: '中部', prefecture: '静岡県', name: '沼津市民文化センター',                    sort_order: 60 },
    { region: '中部', prefecture: '静岡県', name: '焼津市文化センター',                      sort_order: 70 },
    { region: '中部', prefecture: '静岡県', name: '熱海マリーナ',                            sort_order: 80 },
    { region: '中部', prefecture: '静岡県', name: '下田市民スポーツセンター',                sort_order: 90 },
    { region: '中部', prefecture: '静岡県', name: 'ロゼシアター',                            sort_order: 100 },
    { region: '中部', prefecture: '静岡県', name: '掛川市文化会館シオーネ',                  sort_order: 110 },
    { region: '中部', prefecture: '静岡県', name: 'プラサヴェルデ',                          sort_order: 120 },
    { region: '中部', prefecture: '愛知県', name: 'ミタチ第２ビル',                          sort_order: 10 },
    { region: '中部', prefecture: '愛知県', name: '刈谷市産業振興センター',                  sort_order: 20 },
    { region: '中部', prefecture: '愛知県', name: '岡崎市民会館',                            sort_order: 30 },
    { region: '中部', prefecture: '愛知県', name: '岡崎商工会議所',                          sort_order: 40 },
    { region: '中部', prefecture: '愛知県', name: 'アイプラザ半田',                          sort_order: 50 },
    { region: '中部', prefecture: '愛知県', name: 'ライフポートとよはし',                    sort_order: 60 },
    { region: '中部', prefecture: '愛知県', name: 'アイプラザ豊橋',                          sort_order: 70 },
    { region: '中部', prefecture: '愛知県', name: '一宮市民会館',                            sort_order: 80 },
    { region: '中部', prefecture: '愛知県', name: '春日井市総合体育館',                      sort_order: 90 },
    { region: '中部', prefecture: '愛知県', name: '蒲郡商工会議所',                          sort_order: 100 },
    { region: '中部', prefecture: '愛知県', name: 'グリーンパレス春日井',                    sort_order: 110 },
    { region: '中部', prefecture: '愛知県', name: '蒲郡市民会館',                            sort_order: 120 },
    { region: '中部', prefecture: '愛知県', name: '衣浦港湾会館',                            sort_order: 130 },
    { region: '中部', prefecture: '愛知県', name: 'マリンポート鳥新',                        sort_order: 140 },
    { region: '中部', prefecture: '愛知県', name: '豊田市福祉センター',                      sort_order: 150 },
    { region: '中部', prefecture: '愛知県', name: '南陵公民館',                              sort_order: 160 },
    { region: '中部', prefecture: '愛知県', name: 'NTPマリーナりんくう',                     sort_order: 170 },
    { region: '中部', prefecture: '愛知県', name: '豊川市勤労福祉会館',                      sort_order: 180 },
    { region: '中部', prefecture: '愛知県', name: 'NTPマリーナ高浜',                         sort_order: 190 },
    { region: '中部', prefecture: '愛知県', name: '津島市文化会館',                          sort_order: 200 },
    { region: '中部', prefecture: '愛知県', name: 'あま市七宝焼アートヴィレッジ',            sort_order: 210 },
    { region: '中部', prefecture: '愛知県', name: 'ミッドシップワークス',                    sort_order: 220 },
    { region: '中部', prefecture: '愛知県', name: '赤羽根市民館',                            sort_order: 230 },
    { region: '中部', prefecture: '愛知県', name: '名古屋港少年少女ヨットトレーニングセンター', sort_order: 240 },
    { region: '中部', prefecture: '愛知県', name: 'アイプラザ一宮',                          sort_order: 250 },
  ]

  // 近畿：既存行がない（region='近畿'が0件）場合のみシード
  const kinkiCount = db.exec("SELECT COUNT(*) FROM venues WHERE region = '近畿'")
  if ((kinkiCount[0]?.values[0]?.[0] as number ?? 0) === 0) {
    for (const v of KINKI_SEED) {
      db.run(
        `INSERT INTO venues (region, prefecture, name, sort_order) VALUES (?, ?, ?, ?)`,
        [v.region, v.prefecture, v.name, v.sort_order]
      )
    }
  }

  // 中部：region='中部'が0件の場合のみシード
  const chubuCount = db.exec("SELECT COUNT(*) FROM venues WHERE region = '中部'")
  if ((chubuCount[0]?.values[0]?.[0] as number ?? 0) === 0) {
    for (const v of CHUBU_SEED) {
      db.run(
        `INSERT INTO venues (region, prefecture, name, sort_order) VALUES (?, ?, ?, ?)`,
        [v.region, v.prefecture, v.name, v.sort_order]
      )
    }
  }

  save()

  return db
}

/** DB をディスクに保存 */
export function save(): void {
  if (!db || !dbPath) return
  const data = db.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
}

/** DB を返す（同期、initDb 後に使用） */
export function getDb(): Database {
  if (!db) throw new Error('DB が初期化されていません。initDb() を先に呼んでください。')
  return db
}

export function closeDb(): void {
  save()
  db?.close()
  db = null
}

// -------- sql.js 用ユーティリティ --------

export type Row = Record<string, unknown>

/** SELECT → Row[] */
// sql.js の BindParams に合わせた型
type SqlParam = string | number | null | Uint8Array

export function query(sql: string, params: SqlParam[] = []): Row[] {
  const d = getDb()
  const stmt = d.prepare(sql)
  stmt.bind(params)
  const rows: Row[] = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as Row)
  }
  stmt.free()
  return rows
}

/** SELECT → 1行 */
export function queryOne(sql: string, params: SqlParam[] = []): Row | null {
  return query(sql, params)[0] ?? null
}

/** INSERT / UPDATE / DELETE → lastInsertRowid */
export function run(sql: string, params: SqlParam[] = []): number {
  const d = getDb()
  d.run(sql, params)
  // last_insert_rowid() を save() より先に取得する
  // save() が db.export() を呼ぶと last_insert_rowid がリセットされるため
  const id = d.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0] as number ?? 0
  // トランザクション中は save() しない（db.export() が WAL と干渉するため）
  if (!inTransaction) save()
  return id
}

/** トランザクション */
export function transaction(fn: () => void): void {
  const d = getDb()
  d.run('BEGIN')
  inTransaction = true
  try {
    fn()
    d.run('COMMIT')
    inTransaction = false
    save()
  } catch (e) {
    inTransaction = false
    try { d.run('ROLLBACK') } catch { /* sql.js が既に rollback 済みの場合は無視 */ }
    throw e
  }
}
