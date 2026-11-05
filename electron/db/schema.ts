/**
 * DBスキーマ定義
 * 将来Supabaseへ移行できるよう、型とSQL定義を分離
 */

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 受講者基本情報
CREATE TABLE IF NOT EXISTS students (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  student_code   TEXT,          -- 受講者番号（6桁ゼロ埋め連番。旧システムの番号も入れられる）
  license_number TEXT,          -- 操縦免許証番号
  last_name      TEXT NOT NULL,
  first_name   TEXT NOT NULL,
  last_kana   TEXT,
  first_kana  TEXT,
  birth_date  TEXT,
  gender      TEXT CHECK(gender IN ('male','female','other')),
  postal_code TEXT,
  prefecture  TEXT,
  city        TEXT,
  address1    TEXT,
  address2    TEXT,
  mail_postal_code TEXT,        -- 送付先住所（申請住所と別の場合）
  mail_prefecture  TEXT,
  mail_city        TEXT,
  mail_address1    TEXT,
  mail_address2    TEXT,
  phone       TEXT,
  mobile      TEXT,
  email       TEXT,
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 申込情報
CREATE TABLE IF NOT EXISTS enrollments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id    INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  menu          TEXT NOT NULL,
  course_date   TEXT,
  venue         TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending','confirmed','completed','cancelled')),
  extra_json    TEXT DEFAULT '{}',
  note          TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 更新講習情報
CREATE TABLE IF NOT EXISTS renewals (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  enrollment_id       INTEGER NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  documents_collected INTEGER NOT NULL DEFAULT 0,
  submitted_to_office INTEGER NOT NULL DEFAULT 0,
  license_lost        INTEGER NOT NULL DEFAULT 0,
  license_expired     INTEGER NOT NULL DEFAULT 0,
  submission_date     TEXT,
  note                TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 重複保留レビュー
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
);

-- 試験日程マスター
CREATE TABLE IF NOT EXISTS exam_sessions (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_date          TEXT NOT NULL,
  exam_location      TEXT NOT NULL,
  qualification_type TEXT NOT NULL,
  exam_id            TEXT NOT NULL,
  exam_type          TEXT NOT NULL DEFAULT '学科+実技',
  created_at         TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 会場マスター
CREATE TABLE IF NOT EXISTS venues (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  region       TEXT NOT NULL DEFAULT '近畿',
  prefecture   TEXT NOT NULL,
  city         TEXT,
  name         TEXT NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 試験記録（学生ごとの受験履歴）
CREATE TABLE IF NOT EXISTS exam_records (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id          INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  enrollment_id       INTEGER REFERENCES enrollments(id) ON DELETE SET NULL,
  qualification_type  TEXT NOT NULL DEFAULT '',

  shintai_cert        INTEGER NOT NULL DEFAULT 0,
  shintai_valid_until TEXT,

  gakka_session_id    INTEGER REFERENCES exam_sessions(id) ON DELETE SET NULL,
  gakka_exam_number   TEXT,
  gakka_result        TEXT CHECK(gakka_result IN ('合','免','否','不')),
  gakka_result_date   TEXT,

  jitsugi_session_id  INTEGER REFERENCES exam_sessions(id) ON DELETE SET NULL,
  jitsugi_exam_number TEXT,
  jitsugi_result      TEXT CHECK(jitsugi_result IN ('合','免','否','不')),
  jitsugi_result_date TEXT,

  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- updated_at 自動更新トリガー
CREATE TRIGGER IF NOT EXISTS students_updated_at
  AFTER UPDATE ON students
  FOR EACH ROW
  BEGIN
    UPDATE students SET updated_at = datetime('now','localtime') WHERE id = OLD.id;
  END;

CREATE TRIGGER IF NOT EXISTS enrollments_updated_at
  AFTER UPDATE ON enrollments
  FOR EACH ROW
  BEGIN
    UPDATE enrollments SET updated_at = datetime('now','localtime') WHERE id = OLD.id;
  END;

CREATE TRIGGER IF NOT EXISTS renewals_updated_at
  AFTER UPDATE ON renewals
  FOR EACH ROW
  BEGIN
    UPDATE renewals SET updated_at = datetime('now','localtime') WHERE id = OLD.id;
  END;

CREATE TRIGGER IF NOT EXISTS pending_reviews_updated_at
  AFTER UPDATE ON pending_reviews
  FOR EACH ROW
  BEGIN
    UPDATE pending_reviews SET updated_at = datetime('now','localtime') WHERE id = OLD.id;
  END;

CREATE TRIGGER IF NOT EXISTS exam_sessions_updated_at
  AFTER UPDATE ON exam_sessions
  FOR EACH ROW
  BEGIN
    UPDATE exam_sessions SET updated_at = datetime('now','localtime') WHERE id = OLD.id;
  END;

CREATE TRIGGER IF NOT EXISTS venues_updated_at
  AFTER UPDATE ON venues
  FOR EACH ROW
  BEGIN
    UPDATE venues SET updated_at = datetime('now','localtime') WHERE id = OLD.id;
  END;

CREATE TRIGGER IF NOT EXISTS exam_records_updated_at
  AFTER UPDATE ON exam_records
  FOR EACH ROW
  BEGIN
    UPDATE exam_records SET updated_at = datetime('now','localtime') WHERE id = OLD.id;
  END;
`
