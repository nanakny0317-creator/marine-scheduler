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

CREATE TRIGGER IF NOT EXISTS venues_updated_at
  AFTER UPDATE ON venues
  FOR EACH ROW
  BEGIN
    UPDATE venues SET updated_at = datetime('now','localtime') WHERE id = OLD.id;
  END;
`
