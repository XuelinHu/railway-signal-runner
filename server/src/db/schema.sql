-- 铁道信号巡检平台 数据库结构（权威定义，由 scripts/init-postgres.mjs 执行）
--
-- 约定沿用项目已有风格：TEXT + nanoid 主键、TIMESTAMPTZ DEFAULT now()、JSONB 载荷。
-- 一处有意偏离：高频追加型日志表（login_logs / ai_messages / ai_request_logs）用 BIGSERIAL，
-- 让分页有廉价、稳定且单调的 tiebreaker，索引也不会因随机文本键而膨胀。
--
-- 全部语句幂等（IF NOT EXISTS / ADD COLUMN IF NOT EXISTS），可重复执行。

-- ============================ 身份与账号 ============================

CREATE TABLE IF NOT EXISTS users (
  id                   TEXT PRIMARY KEY,
  username             TEXT NOT NULL,
  display_name         TEXT NOT NULL DEFAULT '',
  email                TEXT,
  phone                TEXT,
  password_hash        TEXT NOT NULL,
  role                 TEXT NOT NULL DEFAULT 'student',
  status               TEXT NOT NULL DEFAULT 'active',
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  failed_login_count   INTEGER NOT NULL DEFAULT 0,
  locked_until         TIMESTAMPTZ,
  last_login_at        TIMESTAMPTZ,
  last_login_ip        TEXT,
  password_changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  remark               TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ,
  CONSTRAINT users_role_check   CHECK (role   IN ('student', 'teacher', 'admin')),
  CONSTRAINT users_status_check CHECK (status IN ('active', 'disabled', 'locked'))
);

-- 用户名/邮箱/手机号唯一，但仅在未软删的行上生效，这样删除后可以重新注册同名账号。
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key
  ON users (lower(username)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key
  ON users (lower(email)) WHERE deleted_at IS NULL AND email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_key
  ON users (phone) WHERE deleted_at IS NULL AND phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_created_idx     ON users (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS users_role_status_idx ON users (role, status);

-- 刷新令牌只存 sha256，明文不落库。family_id 用于重放检测：
-- 一个已轮换过的令牌再次出现，说明它被窃取了，整个家族全部吊销。
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  family_id   TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  replaced_by TEXT,
  user_agent  TEXT,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx    ON refresh_tokens (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx  ON refresh_tokens (family_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_expires_idx ON refresh_tokens (expires_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  channel    TEXT NOT NULL DEFAULT 'manual',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  issued_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx    ON password_reset_tokens (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_idx ON password_reset_tokens (expires_at);

-- ============================ 审计日志 ============================

CREATE TABLE IF NOT EXISTS login_logs (
  id             BIGSERIAL PRIMARY KEY,
  user_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  username_input TEXT,
  success        BOOLEAN NOT NULL,
  failure_reason TEXT,
  ip             TEXT,
  user_agent     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_logs_created_idx ON login_logs (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS login_logs_user_idx    ON login_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS login_logs_success_idx ON login_logs (success, created_at DESC);

-- ============================ 智能体 ============================

CREATE TABLE IF NOT EXISTS ai_conversations (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL DEFAULT '新对话',
  model           TEXT NOT NULL DEFAULT '',
  system_prompt   TEXT,
  message_count   INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  archived        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_conversations_user_idx    ON ai_conversations (user_id, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ai_conversations_updated_idx ON ai_conversations (updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS ai_messages (
  id                BIGSERIAL PRIMARY KEY,
  conversation_id   TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  user_id           TEXT REFERENCES users(id) ON DELETE SET NULL,
  role              TEXT NOT NULL,
  content           TEXT NOT NULL DEFAULT '',
  model             TEXT,
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  latency_ms        INTEGER,
  status            TEXT NOT NULL DEFAULT 'ok',
  error             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_messages_role_check CHECK (role IN ('system', 'user', 'assistant'))
);
CREATE INDEX IF NOT EXISTS ai_messages_conversation_idx ON ai_messages (conversation_id, id);
CREATE INDEX IF NOT EXISTS ai_messages_created_idx      ON ai_messages (created_at DESC, id DESC);

-- conversation_id 故意不加外键：调用日志要在会话被删除后依然留存。
CREATE TABLE IF NOT EXISTS ai_request_logs (
  id                BIGSERIAL PRIMARY KEY,
  user_id           TEXT REFERENCES users(id) ON DELETE SET NULL,
  conversation_id   TEXT,
  model             TEXT NOT NULL,
  endpoint          TEXT NOT NULL DEFAULT 'chat',
  status            TEXT NOT NULL DEFAULT 'ok',
  http_status       INTEGER,
  latency_ms        INTEGER,
  first_token_ms    INTEGER,
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  error             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_request_logs_created_idx ON ai_request_logs (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ai_request_logs_user_idx    ON ai_request_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_request_logs_model_idx   ON ai_request_logs (model, created_at DESC);

-- ============================ 系统设置 ============================

CREATE TABLE IF NOT EXISTS system_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  username    TEXT,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  detail      JSONB,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS audit_logs_user_idx    ON audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx  ON audit_logs (action, created_at DESC);

-- ============================ 业务数据（扩展现有两张表） ============================

ALTER TABLE training_scenes ADD COLUMN IF NOT EXISTS owner_id     TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE training_scenes ADD COLUMN IF NOT EXISTS published    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE training_scenes ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE training_scenes ADD COLUMN IF NOT EXISTS description  TEXT;
ALTER TABLE training_scenes ADD COLUMN IF NOT EXISTS difficulty   TEXT;
ALTER TABLE training_scenes ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS training_scenes_updated_idx   ON training_scenes (updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS training_scenes_published_idx ON training_scenes (published, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS training_scenes_owner_idx     ON training_scenes (owner_id, updated_at DESC);

ALTER TABLE training_records ADD COLUMN IF NOT EXISTS user_id         TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS scene_name      TEXT;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS completed       BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS inspected_count INTEGER;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS mistake_count   INTEGER;
CREATE INDEX IF NOT EXISTS training_records_created_idx ON training_records (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS training_records_user_idx    ON training_records (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS training_records_scene_idx   ON training_records (scene_id, created_at DESC);

-- ============================ updated_at 自动维护 ============================

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS ai_conversations_set_updated_at ON ai_conversations;
CREATE TRIGGER ai_conversations_set_updated_at BEFORE UPDATE ON ai_conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS training_scenes_set_updated_at ON training_scenes;
CREATE TRIGGER training_scenes_set_updated_at BEFORE UPDATE ON training_scenes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
