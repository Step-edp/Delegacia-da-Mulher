const pool = require('../config/database');

async function recordEvent(payload) {
  const query = `
    INSERT INTO summons_events (
      summons_id,
      event_type,
      occurred_at,
      ip_address,
      user_agent,
      user_id,
      metadata
    )
    VALUES ($1, $2, NOW(), $3, $4, $5, $6)
    RETURNING
      id,
      summons_id AS "summonsId",
      event_type AS "eventType",
      occurred_at AS "occurredAt",
      ip_address AS "ipAddress",
      user_id AS "userId",
      metadata
  `;

  const { rows } = await pool.query(query, [
    payload.summonsId,
    payload.eventType,
    payload.ipAddress || null,
    payload.userAgent || null,
    payload.userId || null,
    payload.metadata ? JSON.stringify(payload.metadata) : null
  ]);

  return rows[0];
}

async function findEventsBySummonsId(summonsId) {
  const query = `
    SELECT
      se.id,
      se.summons_id AS "summonsId",
      se.event_type AS "eventType",
      se.occurred_at AS "occurredAt",
      se.ip_address AS "ipAddress",
      se.user_agent AS "userAgent",
      se.user_id AS "userId",
      se.metadata,
      u.full_name AS "userName"
    FROM summons_events se
    LEFT JOIN users u ON u.id = se.user_id
    WHERE se.summons_id = $1
    ORDER BY se.occurred_at ASC
  `;

  const { rows } = await pool.query(query, [summonsId]);
  return rows;
}

async function findEventsByCaseId(caseId) {
  const query = `
    SELECT
      se.id,
      se.summons_id AS "summonsId",
      se.event_type AS "eventType",
      se.occurred_at AS "occurredAt",
      se.ip_address AS "ipAddress",
      se.user_agent AS "userAgent",
      se.user_id AS "userId",
      se.metadata,
      u.full_name AS "userName",
      s.person_type AS "personType",
      s.attempt_number AS "attemptNumber",
      p.full_name AS "personName"
    FROM summons_events se
    INNER JOIN summons s ON s.id = se.summons_id
    INNER JOIN persons p ON p.id = s.person_id
    LEFT JOIN users u ON u.id = se.user_id
    WHERE s.case_id = $1
    ORDER BY se.occurred_at ASC
  `;

  const { rows } = await pool.query(query, [caseId]);
  return rows;
}

async function countCertificatesDownloaded() {
  const query = `
    SELECT COUNT(*)::int AS total
    FROM summons_events
    WHERE event_type = 'certificate_downloaded'
  `;

  const { rows } = await pool.query(query);
  return rows[0] ? rows[0].total : 0;
}

async function findSummonsWithEventsByCaseId(caseId) {
  const query = `
    SELECT
      s.id,
      s.person_id AS "personId",
      s.person_type AS "personType",
      s.status,
      s.attempt_number AS "attemptNumber",
      s.due_date AS "dueDate",
      s.delivered_at AS "deliveredAt",
      s.created_at AS "createdAt",
      p.full_name AS "personName",
      p.phone AS "personPhone"
    FROM summons s
    INNER JOIN persons p ON p.id = s.person_id
    WHERE s.case_id = $1
    ORDER BY s.attempt_number ASC, s.created_at ASC
  `;

  const { rows } = await pool.query(query, [caseId]);
  return rows;
}

async function findCaseIdByBoNumber(boNumber) {
  const query = `
    SELECT id
    FROM cases
    WHERE UPPER(REPLACE(protocol_number, ' ', '')) = UPPER(REPLACE($1, ' ', ''))
    LIMIT 1
  `;

  const { rows } = await pool.query(query, [boNumber]);
  return rows[0] ? Number(rows[0].id) : null;
}

module.exports = {
  recordEvent,
  findEventsBySummonsId,
  findEventsByCaseId,
  countCertificatesDownloaded,
  findSummonsWithEventsByCaseId,
  findCaseIdByBoNumber
};
