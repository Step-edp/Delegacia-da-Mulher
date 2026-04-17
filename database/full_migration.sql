-- Migração completa - Delegacia da Mulher
-- Gerado em: 2026-04-17T00:29:48.892Z
-- Execute este arquivo no seu banco PostgreSQL

\c railway;

-- ===========================================
-- Migração: 001_initial_schema.sql
-- ===========================================

BEGIN;

CREATE TABLE IF NOT EXISTS persons (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(200) NOT NULL,
  cpf CHAR(11) NOT NULL UNIQUE,
  birth_date DATE,
  phone VARCHAR(20),
  email VARCHAR(120),
  address_line VARCHAR(255),
  neighborhood VARCHAR(120),
  city VARCHAR(120),
  state CHAR(2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT persons_cpf_format_chk CHECK (cpf ~ '^[0-9]{11}$')
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  person_id BIGINT,
  full_name VARCHAR(200) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'agent',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_person_fk
    FOREIGN KEY (person_id)
    REFERENCES persons(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT users_role_chk
    CHECK (role IN ('admin', 'manager', 'agent'))
);

CREATE TABLE IF NOT EXISTS daily_imports (
  id BIGSERIAL PRIMARY KEY,
  import_date DATE NOT NULL,
  source_name VARCHAR(120) NOT NULL,
  imported_by_user_id BIGINT,
  total_rows INTEGER NOT NULL DEFAULT 0,
  successful_rows INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT daily_imports_user_fk
    FOREIGN KEY (imported_by_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT daily_imports_counts_chk
    CHECK (total_rows >= 0 AND successful_rows >= 0 AND failed_rows >= 0)
);

CREATE TABLE IF NOT EXISTS expected_cases (
  id BIGSERIAL PRIMARY KEY,
  daily_import_id BIGINT NOT NULL,
  reference_date DATE NOT NULL,
  neighborhood VARCHAR(120),
  expected_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT expected_cases_import_fk
    FOREIGN KEY (daily_import_id)
    REFERENCES daily_imports(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT expected_cases_count_chk
    CHECK (expected_count >= 0)
);

CREATE TABLE IF NOT EXISTS cases (
  id BIGSERIAL PRIMARY KEY,
  protocol_number VARCHAR(40) NOT NULL UNIQUE,
  title VARCHAR(180) NOT NULL,
  description TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  created_by_user_id BIGINT,
  assigned_to_user_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cases_created_by_fk
    FOREIGN KEY (created_by_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT cases_assigned_to_fk
    FOREIGN KEY (assigned_to_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT cases_status_chk
    CHECK (status IN ('open', 'in_progress', 'closed', 'archived')),
  CONSTRAINT cases_priority_chk
    CHECK (priority IN ('low', 'medium', 'high', 'urgent'))
);

CREATE TABLE IF NOT EXISTS case_person (
  case_id BIGINT NOT NULL,
  person_id BIGINT NOT NULL,
  person_role VARCHAR(30) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (case_id, person_id, person_role),
  CONSTRAINT case_person_case_fk
    FOREIGN KEY (case_id)
    REFERENCES cases(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT case_person_person_fk
    FOREIGN KEY (person_id)
    REFERENCES persons(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT case_person_role_chk
    CHECK (person_role IN ('victim', 'witness', 'suspect', 'reporter', 'guardian'))
);

CREATE TABLE IF NOT EXISTS summons (
  id BIGSERIAL PRIMARY KEY,
  case_id BIGINT NOT NULL,
  person_id BIGINT NOT NULL,
  due_date DATE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  delivery_channel VARCHAR(30),
  delivered_at TIMESTAMPTZ,
  notes TEXT,
  created_by_user_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT summons_case_fk
    FOREIGN KEY (case_id)
    REFERENCES cases(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT summons_person_fk
    FOREIGN KEY (person_id)
    REFERENCES persons(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT summons_created_by_fk
    FOREIGN KEY (created_by_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT summons_status_chk
    CHECK (status IN ('pending', 'sent', 'received', 'cancelled', 'expired')),
  CONSTRAINT summons_channel_chk
    CHECK (delivery_channel IS NULL OR delivery_channel IN ('email', 'sms', 'whatsapp', 'in_person', 'letter'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT,
  person_id BIGINT,
  case_id BIGINT,
  message TEXT NOT NULL,
  channel VARCHAR(30) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notifications_user_fk
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT notifications_person_fk
    FOREIGN KEY (person_id)
    REFERENCES persons(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT notifications_case_fk
    FOREIGN KEY (case_id)
    REFERENCES cases(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT notifications_target_chk
    CHECK (user_id IS NOT NULL OR person_id IS NOT NULL),
  CONSTRAINT notifications_status_chk
    CHECK (status IN ('pending', 'queued', 'sent', 'failed', 'cancelled')),
  CONSTRAINT notifications_channel_chk
    CHECK (channel IN ('email', 'sms', 'whatsapp', 'push'))
);

CREATE TABLE IF NOT EXISTS auth_codes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  code VARCHAR(12) NOT NULL,
  code_type VARCHAR(30) NOT NULL DEFAULT 'login_2fa',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT auth_codes_user_fk
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT auth_codes_code_unique UNIQUE (user_id, code, code_type),
  CONSTRAINT auth_codes_type_chk
    CHECK (code_type IN ('login_2fa', 'email_verification', 'password_reset')),
  CONSTRAINT auth_codes_expiration_chk
    CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_persons_full_name ON persons (full_name);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases (status);
CREATE INDEX IF NOT EXISTS idx_cases_opened_at ON cases (opened_at);
CREATE INDEX IF NOT EXISTS idx_case_person_person_id ON case_person (person_id);
CREATE INDEX IF NOT EXISTS idx_summons_case_id ON summons (case_id);
CREATE INDEX IF NOT EXISTS idx_notifications_case_id ON notifications (case_id);
CREATE INDEX IF NOT EXISTS idx_auth_codes_user_id ON auth_codes (user_id);
CREATE INDEX IF NOT EXISTS idx_expected_cases_reference_date ON expected_cases (reference_date);

COMMIT;


-- ===========================================
-- Migração: 002_triggers_updated_at.sql
-- ===========================================

BEGIN;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_persons_updated_at ON persons;
CREATE TRIGGER trg_persons_updated_at
BEFORE UPDATE ON persons
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_cases_updated_at ON cases;
CREATE TRIGGER trg_cases_updated_at
BEFORE UPDATE ON cases
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_summons_updated_at ON summons;
CREATE TRIGGER trg_summons_updated_at
BEFORE UPDATE ON summons
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;


-- ===========================================
-- Migração: 003_daily_imports_period.sql
-- ===========================================

BEGIN;

ALTER TABLE daily_imports
  ADD COLUMN IF NOT EXISTS period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS period_end TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'daily_imports_period_chk'
  ) THEN
    ALTER TABLE daily_imports
      ADD CONSTRAINT daily_imports_period_chk
      CHECK (
        period_start IS NULL
        OR period_end IS NULL
        OR period_end > period_start
      );
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_imports_period
  ON daily_imports (period_start, period_end)
  WHERE period_start IS NOT NULL AND period_end IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_daily_imports_period_end
  ON daily_imports (period_end DESC)
  WHERE period_end IS NOT NULL;

COMMIT;


-- ===========================================
-- Migração: 004_expected_cases_status_and_bo_fields.sql
-- ===========================================

BEGIN;

ALTER TABLE expected_cases
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
  ADD COLUMN IF NOT EXISTS bo_number VARCHAR(40),
  ADD COLUMN IF NOT EXISTS natureza VARCHAR(255),
  ADD COLUMN IF NOT EXISTS victim_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS author_name VARCHAR(200);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'expected_cases_status_chk'
  ) THEN
    ALTER TABLE expected_cases
      ADD CONSTRAINT expected_cases_status_chk
      CHECK (status IN ('PENDENTE', 'PROCESSANDO', 'CRIADO', 'DESCARTADO'));
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_expected_cases_daily_import_bo
  ON expected_cases (daily_import_id, bo_number)
  WHERE bo_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expected_cases_status
  ON expected_cases (status);

COMMIT;


-- ===========================================
-- Migração: 005_case_pdf_pairs.sql
-- ===========================================

BEGIN;

CREATE TABLE IF NOT EXISTS case_pdf_pairs (
  id BIGSERIAL PRIMARY KEY,
  expected_case_id BIGINT NOT NULL,
  bo_file_name VARCHAR(255) NOT NULL,
  bo_file_path TEXT NOT NULL,
  extrato_file_name VARCHAR(255) NOT NULL,
  extrato_file_path TEXT NOT NULL,
  extracted_bo_data JSONB NOT NULL,
  extracted_extrato_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT case_pdf_pairs_expected_case_fk
    FOREIGN KEY (expected_case_id)
    REFERENCES expected_cases(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT case_pdf_pairs_expected_case_unique UNIQUE (expected_case_id)
);

CREATE INDEX IF NOT EXISTS idx_case_pdf_pairs_created_at
  ON case_pdf_pairs (created_at DESC);

COMMIT;


-- ===========================================
-- Migração: 006_summons_person_type_and_token.sql
-- ===========================================

BEGIN;

ALTER TABLE summons
  ADD COLUMN IF NOT EXISTS person_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS summons_text TEXT,
  ADD COLUMN IF NOT EXISTS token_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS token_jti VARCHAR(64),
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'summons_person_type_chk'
  ) THEN
    ALTER TABLE summons
      ADD CONSTRAINT summons_person_type_chk
      CHECK (
        person_type IS NULL
        OR person_type IN ('VITIMA', 'AUTOR', 'TESTEMUNHA', 'RESPONSAVEL')
      );
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_summons_token_jti
  ON summons (token_jti)
  WHERE token_jti IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_summons_person_type
  ON summons (person_type)
  WHERE person_type IS NOT NULL;

COMMIT;


-- ===========================================
-- Migração: 007_auth_otp_and_sessions.sql
-- ===========================================

BEGIN;

ALTER TABLE auth_codes
  DROP CONSTRAINT IF EXISTS auth_codes_type_chk;

ALTER TABLE auth_codes
  ADD CONSTRAINT auth_codes_type_chk
  CHECK (code_type IN ('login_2fa', 'login_otp', 'email_verification', 'password_reset'));

CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  session_jti VARCHAR(64) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  channel VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT user_sessions_user_fk
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT user_sessions_channel_chk
    CHECK (channel IN ('sms', 'whatsapp')),
  CONSTRAINT user_sessions_exp_chk
    CHECK (expires_at > created_at),
  CONSTRAINT user_sessions_jti_unique UNIQUE (session_jti)
);

CREATE INDEX IF NOT EXISTS idx_auth_codes_lookup
  ON auth_codes (user_id, code_type, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id
  ON user_sessions (user_id, created_at DESC);

COMMIT;


-- ===========================================
-- Migração: 008_scheduling_slots_and_appointments.sql
-- ===========================================

BEGIN;

CREATE TABLE IF NOT EXISTS availability_slots (
  id BIGSERIAL PRIMARY KEY,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DISPONIVEL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT availability_slots_time_chk CHECK (ends_at > starts_at),
  CONSTRAINT availability_slots_status_chk CHECK (status IN ('DISPONIVEL', 'RESERVADO', 'BLOQUEADO')),
  CONSTRAINT availability_slots_start_unique UNIQUE (starts_at)
);

CREATE TABLE IF NOT EXISTS appointments (
  id BIGSERIAL PRIMARY KEY,
  slot_id BIGINT NOT NULL,
  person_id BIGINT NOT NULL,
  user_id BIGINT,
  appointment_type VARCHAR(40) NOT NULL DEFAULT 'ATENDIMENTO',
  status VARCHAR(20) NOT NULL DEFAULT 'AGENDADO',
  notes TEXT,
  booked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT appointments_slot_fk
    FOREIGN KEY (slot_id)
    REFERENCES availability_slots(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT appointments_person_fk
    FOREIGN KEY (person_id)
    REFERENCES persons(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT appointments_user_fk
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT appointments_slot_unique UNIQUE (slot_id),
  CONSTRAINT appointments_status_chk CHECK (status IN ('AGENDADO', 'CONFIRMADO', 'CANCELADO', 'CONCLUIDO'))
);

CREATE INDEX IF NOT EXISTS idx_availability_slots_date ON availability_slots (starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_person_id ON appointments (person_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments (status);

COMMIT;


-- ===========================================
-- Migração: 009_appointments_attendance_code.sql
-- ===========================================

BEGIN;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS attendance_code VARCHAR(12),
  ADD COLUMN IF NOT EXISTS attendance_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attendance_confirmed_by_user_id BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_attendance_confirmed_by_fk'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_attendance_confirmed_by_fk
      FOREIGN KEY (attendance_confirmed_by_user_id)
      REFERENCES users(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_attendance_code
  ON appointments (attendance_code)
  WHERE attendance_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_attendance_confirmed_at
  ON appointments (attendance_confirmed_at)
  WHERE attendance_confirmed_at IS NOT NULL;

COMMIT;


-- ===========================================
-- Migração: 010_appointments_case_role.sql
-- ===========================================

BEGIN;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS case_id BIGINT,
  ADD COLUMN IF NOT EXISTS person_role VARCHAR(20);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_case_fk'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_case_fk
      FOREIGN KEY (case_id)
      REFERENCES cases(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_person_role_chk'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_person_role_chk
      CHECK (person_role IS NULL OR person_role IN ('VITIMA', 'AUTOR', 'TESTEMUNHA', 'RESPONSAVEL'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_appointments_case_id
  ON appointments (case_id)
  WHERE case_id IS NOT NULL;

COMMIT;



-- ===========================================
-- SEEDS DATA
-- ===========================================

-- Seed: 001_admin_stephanie.sql

BEGIN;

WITH upsert_person AS (
  INSERT INTO persons (full_name, cpf, phone)
  VALUES ('Stephanie de Paula Santos Amorim', '40280221851', '12996839184')
  ON CONFLICT (cpf)
  DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    updated_at = NOW()
  RETURNING id
)
INSERT INTO users (person_id, full_name, email, password_hash, role, is_active)
SELECT id, 'Stephanie de Paula Santos Amorim', 'stephanieps.amorim@gmail.com', 'OTP_ONLY_LOGIN', 'admin', TRUE
FROM upsert_person
ON CONFLICT (email)
DO UPDATE SET
  person_id = EXCLUDED.person_id,
  full_name = EXCLUDED.full_name,
  role = 'admin',
  is_active = TRUE,
  updated_at = NOW();

COMMIT;


