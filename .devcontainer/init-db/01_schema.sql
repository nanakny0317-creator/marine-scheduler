-- marine_scheduler PostgreSQL スキーマ
-- electron/db/schema.ts (SQLite) の PostgreSQL 移植版
-- このファイルは postgres コンテナ初回起動時に自動実行されます

-- -----------------------------------------------
-- updated_at 自動更新用トリガー関数（全テーブル共用）
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------
-- 受講者基本情報
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS students (
  id             SERIAL PRIMARY KEY,
  student_code   TEXT,                          -- 受講者番号（6桁ゼロ埋め連番）
  license_number TEXT,                          -- 操縦免許証番号
  last_name      TEXT NOT NULL,
  first_name     TEXT NOT NULL,
  last_kana      TEXT,
  first_kana     TEXT,
  birth_date     DATE,
  gender         TEXT CHECK (gender IN ('male', 'female', 'other')),
  postal_code    TEXT,
  prefecture     TEXT,
  city           TEXT,
  address1       TEXT,
  address2       TEXT,
  phone          TEXT,
  mobile         TEXT,
  email          TEXT,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------
-- 申込情報
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS enrollments (
  id           SERIAL PRIMARY KEY,
  student_id   INTEGER NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  menu         TEXT NOT NULL,
  course_date  DATE,
  venue        TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  extra_json   JSONB NOT NULL DEFAULT '{}',    -- SQLite TEXT → JSONB に昇格
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER enrollments_updated_at
  BEFORE UPDATE ON enrollments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------
-- 更新講習情報
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS renewals (
  id                   SERIAL PRIMARY KEY,
  enrollment_id        INTEGER NOT NULL REFERENCES enrollments (id) ON DELETE CASCADE,
  documents_collected  BOOLEAN NOT NULL DEFAULT FALSE,  -- SQLite INTEGER(0/1) → BOOLEAN
  submitted_to_office  BOOLEAN NOT NULL DEFAULT FALSE,
  license_lost         BOOLEAN NOT NULL DEFAULT FALSE,
  license_expired      BOOLEAN NOT NULL DEFAULT FALSE,
  submission_date      DATE,
  note                 TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER renewals_updated_at
  BEFORE UPDATE ON renewals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------
-- 重複保留レビュー
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS pending_reviews (
  id             SERIAL PRIMARY KEY,
  student_id     INTEGER NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  candidate_id   INTEGER NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  match_reasons  JSONB NOT NULL DEFAULT '[]',  -- SQLite TEXT → JSONB に昇格
  match_score    INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'resolved')),
  resolution     TEXT CHECK (resolution IN ('merged', 'different')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER pending_reviews_updated_at
  BEFORE UPDATE ON pending_reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------
-- 会場マスター
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS venues (
  id           SERIAL PRIMARY KEY,
  region       TEXT NOT NULL DEFAULT '近畿',
  prefecture   TEXT NOT NULL,
  city         TEXT,
  name         TEXT NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  active       BOOLEAN NOT NULL DEFAULT TRUE,  -- SQLite INTEGER(0/1) → BOOLEAN
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER venues_updated_at
  BEFORE UPDATE ON venues
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
