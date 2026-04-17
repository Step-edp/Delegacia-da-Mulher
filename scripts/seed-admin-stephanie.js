const pool = require('../src/config/database');

async function main() {
  const cpf = '40280221851';
  const fullName = 'Stephanie de Paula Santos Amorim';
  const phone = '12996839184';
  const email = 'stephanieps.amorim@gmail.com';

  const personSql = `
    INSERT INTO persons (full_name, cpf, phone)
    VALUES ($1, $2, $3)
    ON CONFLICT (cpf)
    DO UPDATE SET
      full_name = EXCLUDED.full_name,
      phone = EXCLUDED.phone,
      updated_at = NOW()
    RETURNING id, full_name AS "fullName", cpf, phone
  `;

  const personRes = await pool.query(personSql, [fullName, cpf, phone]);
  const person = personRes.rows[0];

  const userSql = `
    INSERT INTO users (person_id, full_name, email, password_hash, role, is_active)
    VALUES ($1, $2, $3, $4, 'admin', TRUE)
    ON CONFLICT (email)
    DO UPDATE SET
      person_id = EXCLUDED.person_id,
      full_name = EXCLUDED.full_name,
      role = 'admin',
      is_active = TRUE,
      updated_at = NOW()
    RETURNING id, person_id AS "personId", full_name AS "fullName", email, role, is_active AS "isActive"
  `;

  const userRes = await pool.query(userSql, [person.id, fullName, email, 'OTP_ONLY_LOGIN']);
  const user = userRes.rows[0];

  console.log(JSON.stringify({ person, user }, null, 2));
}

main()
  .catch((error) => {
    console.error('ERRO_CADASTRO:', error && (error.stack || error.message || error));
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch (error) {
      // ignore close errors
    }
  });
