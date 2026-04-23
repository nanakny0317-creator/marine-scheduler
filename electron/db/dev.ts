/**
 * 開発専用 DB ユーティリティ
 * production ビルドでは呼び出されない
 */
import { run, transaction, query } from './index'
import { createStudent } from './students'
import { createEnrollment } from './enrollments'
import { createPendingReview } from './pending_reviews'

export function devResetAll(): void {
  transaction(() => {
    run('DELETE FROM pending_reviews')
    run('DELETE FROM enrollments')
    run('DELETE FROM students')
  })
}

export function devGetCounts(): { students: number; enrollments: number; pendingReviews: number } {
  const s = query('SELECT COUNT(*) AS c FROM students')[0]?.c ?? 0
  const e = query('SELECT COUNT(*) AS c FROM enrollments')[0]?.c ?? 0
  const p = query('SELECT COUNT(*) AS c FROM pending_reviews')[0]?.c ?? 0
  return { students: Number(s), enrollments: Number(e), pendingReviews: Number(p) }
}

export function devSeedTestData(): { students: number; enrollments: number; pendingReviews: number } {
  const inserted = { students: 0, enrollments: 0, pendingReviews: 0 }

  transaction(() => {
    // ── 通常会員 16名 ──────────────────────────────
    const normals: Parameters<typeof createStudent>[0][] = [
      { student_code: null, license_number: null, last_name: '田中', first_name: '太郎', last_kana: 'タナカ', first_kana: 'タロウ', birth_date: '1985-03-15', gender: 'male',   postal_code: '5300001', prefecture: '大阪府', city: '大阪市北区', address1: '梅田1-1-1', phone: '06-1234-5678', mobile: '090-1111-2222', email: 'tanaka@example.com', note: null },
      { student_code: null, license_number: null, last_name: '山田', first_name: '花子', last_kana: 'ヤマダ', first_kana: 'ハナコ', birth_date: '1990-07-22', gender: 'female', postal_code: '6040000', prefecture: '京都府', city: '京都市中京区', address1: '御池通1-2', phone: '075-234-5678', mobile: '090-2222-3333', email: 'yamada@example.com', note: null },
      { student_code: null, license_number: '0300160004901', last_name: '佐藤', first_name: '健',  last_kana: 'サトウ',  first_kana: 'ケン',   birth_date: '1980-01-01', gender: 'male',   postal_code: '6500021', prefecture: '兵庫県', city: '神戸市中央区', address1: '三宮1-1-1', phone: '078-345-6789', mobile: null, email: 'sato.ken@example.com', note: null },
      { student_code: null, license_number: null, last_name: '鈴木', first_name: '美咲', last_kana: 'スズキ', first_kana: 'ミサキ', birth_date: '1995-11-08', gender: 'female', postal_code: '5200044', prefecture: '滋賀県', city: '大津市', address1: '浜町2-3', phone: '077-456-7890', mobile: '090-3333-4444', email: 'suzuki@example.com', note: null },
      { student_code: null, license_number: null, last_name: '伊藤', first_name: '誠',  last_kana: 'イトウ',  first_kana: 'マコト', birth_date: '1978-04-30', gender: 'male',   postal_code: '6300000', prefecture: '奈良県', city: '奈良市', address1: '三条町1-1', phone: '0742-56-7890', mobile: null, email: null, note: null },
      { student_code: null, license_number: null, last_name: '渡辺', first_name: 'さくら', last_kana: 'ワタナベ', first_kana: 'サクラ', birth_date: '1988-09-14', gender: 'female', postal_code: '6400000', prefecture: '和歌山県', city: '和歌山市', address1: '本町1-1', phone: '073-567-8901', mobile: '080-4444-5555', email: 'watanabe@example.com', note: null },
      { student_code: null, license_number: null, last_name: '山本', first_name: '浩二', last_kana: 'ヤマモト', first_kana: 'コウジ', birth_date: '1970-12-25', gender: 'male',   postal_code: '5900000', prefecture: '大阪府', city: '堺市堺区', address1: '市之町1-1', phone: '072-678-9012', mobile: null, email: 'yamamoto@example.com', note: null },
      { student_code: null, license_number: '0300270009812', last_name: '中村', first_name: '優子', last_kana: 'ナカムラ', first_kana: 'ユウコ', birth_date: '1992-06-18', gender: 'female', postal_code: '6700000', prefecture: '兵庫県', city: '姫路市', address1: '駅前町1-1', phone: '079-789-0123', mobile: '090-5555-6666', email: 'nakamura@example.com', note: null },
      { student_code: null, license_number: null, last_name: '小林', first_name: '拓也', last_kana: 'コバヤシ', first_kana: 'タクヤ', birth_date: '1983-08-05', gender: 'male',   postal_code: '6110000', prefecture: '京都府', city: '宇治市', address1: '宇治塔川1-1', phone: null, mobile: '090-6666-7777', email: 'kobayashi@example.com', note: null },
      { student_code: null, license_number: null, last_name: '加藤', first_name: '明美', last_kana: 'カトウ',  first_kana: 'アケミ', birth_date: '1976-02-14', gender: 'female', postal_code: '5600000', prefecture: '大阪府', city: '豊中市', address1: '玉井町1-1', phone: '06-8901-2345', mobile: null, email: null, note: null },
      { student_code: null, license_number: null, last_name: '吉田', first_name: '龍一', last_kana: 'ヨシダ',  first_kana: 'リュウイチ', birth_date: '1991-10-31', gender: 'male',   postal_code: '5220000', prefecture: '滋賀県', city: '彦根市', address1: '元町1-1', phone: '0749-90-1234', mobile: '080-7777-8888', email: 'yoshida@example.com', note: null },
      { student_code: null, license_number: null, last_name: '山口', first_name: '真由美', last_kana: 'ヤマグチ', first_kana: 'マユミ', birth_date: '1987-03-20', gender: 'female', postal_code: '6340000', prefecture: '奈良県', city: '橿原市', address1: '八木町1-1', phone: null, mobile: '090-8888-9999', email: 'yamaguchi@example.com', note: null },
      { student_code: null, license_number: null, last_name: '松本', first_name: '翔',  last_kana: 'マツモト', first_kana: 'ショウ',  birth_date: '1993-07-07', gender: 'male',   postal_code: '6740000', prefecture: '兵庫県', city: '明石市', address1: '魚住町1-1', phone: '078-012-3456', mobile: '090-9999-0000', email: 'matsumoto@example.com', note: null },
      { student_code: null, license_number: null, last_name: '林',  first_name: '奈々', last_kana: 'ハヤシ',  first_kana: 'ナナ',   birth_date: '1982-01-15', gender: 'female', postal_code: '5640000', prefecture: '大阪府', city: '吹田市', address1: '江坂町1-1', phone: '06-2345-6789', mobile: null, email: 'hayashi@example.com', note: null },
      { student_code: null, license_number: null, last_name: '井上', first_name: '慎太郎', last_kana: 'イノウエ', first_kana: 'シンタロウ', birth_date: '1968-05-22', gender: 'male',   postal_code: '6210000', prefecture: '京都府', city: '亀岡市', address1: '追分町1-1', phone: '0771-34-5678', mobile: '080-0000-1111', email: null, note: null },
      { student_code: null, license_number: null, last_name: '木村', first_name: '咲',  last_kana: 'キムラ',  first_kana: 'サキ',   birth_date: '1997-09-03', gender: 'female', postal_code: '6630000', prefecture: '兵庫県', city: '西宮市', address1: '甲子園1-1', phone: null, mobile: '090-1234-5678', email: 'kimura@example.com', note: null },
    ]

    const savedNormals: { id: number; index: number }[] = []
    for (const [i, s] of normals.entries()) {
      const saved = createStudent(s)
      savedNormals.push({ id: saved.id, index: i })
      inserted.students++
    }

    // ── 同姓同名・別人（生年月日が違う）──────────────
    // 佐藤 健 は既に #3 で登録済み（1980-01-01）。別人として 1992年生まれも追加
    const satoKen2 = createStudent({ student_code: null, license_number: null, last_name: '佐藤', first_name: '健', last_kana: 'サトウ', first_kana: 'ケン', birth_date: '1992-06-15', gender: 'male', postal_code: '5300000', prefecture: '大阪府', city: '大阪市西区', address1: '新町1-1', phone: '06-9876-5432', mobile: null, email: 'sato.ken2@example.com', note: null })
    inserted.students++

    // ── 旧字体ペア① 髙橋 ↔ 高橋（同フリガナ・同生年月日）──
    const takahashiOld = createStudent({ student_code: null, license_number: null, last_name: '髙橋', first_name: '一郎', last_kana: 'タカハシ', first_kana: 'イチロウ', birth_date: '1975-05-10', gender: 'male', postal_code: '5300000', prefecture: '大阪府', city: '大阪市中央区', address1: '本町2-3-4', phone: '06-1111-2222', mobile: null, email: 'takahashi@example.com', note: null })
    inserted.students++
    const takahashiNew = createStudent({ student_code: null, license_number: null, last_name: '高橋', first_name: '一郎', last_kana: 'タカハシ', first_kana: 'イチロウ', birth_date: '1975-05-10', gender: 'male', postal_code: '5300000', prefecture: '大阪府', city: '大阪市中央区', address1: '本町2-3-4', phone: '06-1111-2222', mobile: null, email: 'takahashi@example.com', note: '【要確認】重複の可能性あり' })
    inserted.students++
    createPendingReview({ student_id: takahashiNew.id, candidate_id: takahashiOld.id, match_reasons: JSON.stringify(['同フリガナ', '生年月日一致']), match_score: 50 })
    inserted.pendingReviews++

    // ── 旧字体ペア② 齊藤 ↔ 斉藤（同フリガナ・同生年月日）──
    const saitoOld = createStudent({ student_code: null, license_number: null, last_name: '齊藤', first_name: '美子', last_kana: 'サイトウ', first_kana: 'ミコ', birth_date: '1988-11-30', gender: 'female', postal_code: '6040000', prefecture: '京都府', city: '京都市右京区', address1: '太秦1-2-3', phone: '075-222-3333', mobile: '080-2222-3333', email: 'saito@example.com', note: null })
    inserted.students++
    const saitoNew = createStudent({ student_code: null, license_number: null, last_name: '斉藤', first_name: '美子', last_kana: 'サイトウ', first_kana: 'ミコ', birth_date: '1988-11-30', gender: 'female', postal_code: '6040000', prefecture: '京都府', city: '京都市右京区', address1: '太秦1-2-3', phone: '075-222-3333', mobile: '080-2222-3333', email: 'saito@example.com', note: '【要確認】重複の可能性あり' })
    inserted.students++
    createPendingReview({ student_id: saitoNew.id, candidate_id: saitoOld.id, match_reasons: JSON.stringify(['同フリガナ', '生年月日一致', 'メール一致']), match_score: 65 })
    inserted.pendingReviews++

    // ── 申込（enrollment）を数件 ──────────────────────
    const enrollTargets = savedNormals.slice(0, 8)
    const menus = ['1級小型船舶操縦士', '2級小型船舶操縦士', '特殊小型船舶操縦士', '更新講習', '失効再交付']
    const venues = ['ヤマハマリーナ琵琶湖', '大手前センチュリービル', '京都市生涯学習総合センター（京都アスニー）', '兵庫県立のじぎく会館']
    const dates = ['2026-05-10', '2026-05-17', '2026-06-07', '2026-06-14', null]
    for (const [j, { id }] of enrollTargets.entries()) {
      createEnrollment({
        student_id: id,
        menu: menus[j % menus.length],
        course_date: dates[j % dates.length],
        venue: venues[j % venues.length],
        status: j % 3 === 0 ? 'confirmed' : 'pending',
        extra_json: JSON.stringify({ application_type: j < 6 ? 'new' : 'renewal' }),
        note: null,
      })
      inserted.enrollments++
    }

    // 佐藤 健（別人2人分）にも申込追加
    createEnrollment({ student_id: satoKen2.id, menu: '2級小型船舶操縦士', course_date: '2026-05-17', venue: '大手前センチュリービル', status: 'pending', extra_json: JSON.stringify({ application_type: 'new' }), note: null })
    inserted.enrollments++
  })

  return inserted
}
