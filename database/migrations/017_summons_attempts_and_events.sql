BEGIN;

-- Configurações de tentativas de intimação (singleton)
ALTER TABLE scheduling_settings
  ADD COLUMN IF NOT EXISTS summons_max_attempts INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS summons_interval_hours INTEGER NOT NULL DEFAULT 12;

ALTER TABLE scheduling_settings
  DROP CONSTRAINT IF EXISTS scheduling_settings_summons_attempts_chk;
ALTER TABLE scheduling_settings
  ADD CONSTRAINT scheduling_settings_summons_attempts_chk
    CHECK (summons_max_attempts >= 1 AND summons_max_attempts <= 10);

ALTER TABLE scheduling_settings
  DROP CONSTRAINT IF EXISTS scheduling_settings_summons_interval_chk;
ALTER TABLE scheduling_settings
  ADD CONSTRAINT scheduling_settings_summons_interval_chk
    CHECK (summons_interval_hours >= 1);

-- Número da tentativa em cada intimação
ALTER TABLE summons
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1;

-- Histórico de eventos de intimação
CREATE TABLE IF NOT EXISTS summons_events (
  id BIGSERIAL PRIMARY KEY,
  summons_id BIGINT NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address VARCHAR(45),
  user_agent TEXT,
  user_id BIGINT,
  metadata JSONB,
  CONSTRAINT summons_events_summons_fk
    FOREIGN KEY (summons_id)
    REFERENCES summons(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT summons_events_user_fk
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT summons_events_type_chk
    CHECK (event_type IN (
      'link_clicked',
      'schedule_button_clicked',
      'scheduled',
      'refusal_clicked',
      'no_action_timeout',
      'attempt_sent',
      'certificate_downloaded'
    ))
);

CREATE INDEX IF NOT EXISTS idx_summons_events_summons_id
  ON summons_events (summons_id);

CREATE INDEX IF NOT EXISTS idx_summons_events_type
  ON summons_events (event_type);

CREATE INDEX IF NOT EXISTS idx_summons_events_occurred_at
  ON summons_events (occurred_at);

COMMIT;
