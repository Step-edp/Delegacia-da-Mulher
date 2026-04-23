const pool = require('../config/database');

async function findByIdWithPerson(summonsId) {
  const query = `
    SELECT
      s.id,
      s.case_id AS "caseId",
      s.person_id AS "personId",
      s.status,
      s.delivery_channel AS "deliveryChannel",
      s.person_type AS "personType",
      s.summons_text AS "summonsText",
      s.attempt_number AS "attemptNumber",
      p.full_name AS "personName",
      p.phone AS "personPhone"
    FROM summons s
    INNER JOIN persons p ON p.id = s.person_id
    WHERE s.id = $1
    LIMIT 1
  `;

  const { rows } = await pool.query(query, [summonsId]);
  return rows[0] || null;
}

async function createSummons(payload) {
  const query = `
    INSERT INTO summons (
      case_id,
      person_id,
      due_date,
      status,
      delivery_channel,
      notes,
      created_by_user_id,
      person_type,
      summons_text,
      token_hash,
      token_jti,
      token_expires_at,
      attempt_number
    )
    VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING
      id,
      case_id AS "caseId",
      person_id AS "personId",
      due_date AS "dueDate",
      status,
      delivery_channel AS "deliveryChannel",
      person_type AS "personType",
      summons_text AS "summonsText",
      token_jti AS "tokenJti",
      token_expires_at AS "tokenExpiresAt",
      attempt_number AS "attemptNumber",
      created_at AS "createdAt"
  `;

  const values = [
    payload.caseId,
    payload.personId,
    payload.dueDate,
    payload.deliveryChannel || null,
    payload.notes || null,
    payload.createdByUserId || null,
    payload.personType,
    payload.summonsText,
    payload.tokenHash,
    payload.tokenJti,
    payload.tokenExpiresAt,
    payload.attemptNumber || 1
  ];

  const { rows } = await pool.query(query, values);
  return rows[0];
}

async function markAsSent(summonsId, deliveryChannel) {
  const query = `
    UPDATE summons
    SET
      status = 'sent',
      delivery_channel = $2,
      delivered_at = NOW(),
      updated_at = NOW()
    WHERE id = $1
  `;

  await pool.query(query, [summonsId, deliveryChannel]);
}

module.exports = {
  createSummons,
  findByIdWithPerson,
  markAsSent
};
