BEGIN;

WITH upsert_person AS (
  INSERT INTO persons (full_name, cpf, phone)
  VALUES ('Joao', '00000000000', '24974012990')
  ON CONFLICT (cpf)
  DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    updated_at = NOW()
  RETURNING id
)
INSERT INTO users (person_id, full_name, email, password_hash, role, is_active)
SELECT id, 'Joao', 'joao@gmail.com', 'OTP_ONLY_LOGIN', 'admin', TRUE
FROM upsert_person
ON CONFLICT (email)
DO UPDATE SET
  person_id = EXCLUDED.person_id,
  full_name = EXCLUDED.full_name,
  role = 'admin',
  is_active = TRUE,
  updated_at = NOW();

COMMIT;
