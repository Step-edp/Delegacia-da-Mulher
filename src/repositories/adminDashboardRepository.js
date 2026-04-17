const pool = require('../config/database');

async function getCasesOfDay() {
  const query = `
    SELECT
      id,
      protocol_number AS "protocolNumber",
      title,
      status,
      priority,
      opened_at AS "openedAt"
    FROM cases
    WHERE opened_at::date = CURRENT_DATE
    ORDER BY opened_at DESC
  `;

  const { rows } = await pool.query(query);
  return {
    total: rows.length,
    items: rows
  };
}

async function getPendingSummary() {
  const query = `
    SELECT
      (SELECT COUNT(*) FROM expected_cases WHERE status = 'PENDENTE')::int AS "expectedCasesPending",
      (SELECT COUNT(*) FROM summons WHERE status = 'pending')::int AS "summonsPending",
      (SELECT COUNT(*) FROM notifications WHERE status IN ('pending', 'queued', 'failed'))::int AS "notificationsPending",
      (SELECT COUNT(*) FROM users WHERE is_active = FALSE)::int AS "pendingRegistrations",
      (SELECT COUNT(*) FROM users WHERE is_active = TRUE)::int AS "activeUsers"
  `;

  const { rows } = await pool.query(query);
  return rows[0];
}

async function getPendingRegistrationRequests() {
  const query = `
    SELECT
      u.id,
      u.full_name AS "fullName",
      u.email,
      u.role,
      u.created_at AS "createdAt",
      p.cpf,
      p.phone
    FROM users u
    LEFT JOIN persons p ON p.id = u.person_id
    WHERE u.is_active = FALSE
    ORDER BY u.created_at DESC
  `;

  const { rows } = await pool.query(query);
  return {
    total: rows.length,
    items: rows
  };
}

async function approveUserRegistration(userId) {
  const query = `
    UPDATE users
    SET is_active = TRUE,
        updated_at = NOW()
    WHERE id = $1
    RETURNING id
  `;

  const { rows } = await pool.query(query, [userId]);
  return rows[0] || null;
}

async function getPendingExpectedCases() {
  const query = `
    SELECT
      id,
      bo_number AS "boNumber",
      natureza,
      victim_name AS "victimName",
      author_name AS "authorName",
      status,
      created_at AS "createdAt"
    FROM expected_cases
    WHERE status = 'PENDENTE'
    ORDER BY created_at DESC
  `;

  const { rows } = await pool.query(query);
  return {
    total: rows.length,
    items: rows
  };
}

async function getActiveUsers() {
  const query = `
    SELECT
      u.id,
      u.full_name AS "fullName",
      u.email,
      u.role,
      u.is_active AS "isActive",
      u.created_at AS "createdAt",
      u.updated_at AS "updatedAt",
      p.cpf,
      p.phone
    FROM users u
    LEFT JOIN persons p ON p.id = u.person_id
    WHERE u.is_active = TRUE
    ORDER BY COALESCE(u.updated_at, u.created_at) DESC, u.full_name ASC
  `;

  const { rows } = await pool.query(query);
  return {
    total: rows.length,
    items: rows
  };
}

async function getAgendaOfDay() {
  const query = `
    SELECT
      a.id,
      a.slot_id AS "slotId",
      a.status,
      a.appointment_type AS "appointmentType",
      a.person_role AS "personRole",
      s.starts_at AS "startsAt",
      s.ends_at AS "endsAt",
      p.full_name AS "personName"
    FROM appointments a
    INNER JOIN availability_slots s ON s.id = a.slot_id
    INNER JOIN persons p ON p.id = a.person_id
    WHERE s.starts_at::date = CURRENT_DATE
    ORDER BY s.starts_at ASC
  `;

  const { rows } = await pool.query(query);
  return {
    total: rows.length,
    items: rows
  };
}

async function getRecurrenceSummary() {
  const query = `
    SELECT
      s.person_id AS "personId",
      p.full_name AS "personName",
      p.cpf,
      COUNT(DISTINCT s.case_id)::int AS "caseCount"
    FROM summons s
    INNER JOIN persons p ON p.id = s.person_id
    WHERE s.person_type = 'AUTOR'
      AND s.case_id IS NOT NULL
    GROUP BY s.person_id, p.full_name, p.cpf
    HAVING COUNT(DISTINCT s.case_id) > 1
    ORDER BY COUNT(DISTINCT s.case_id) DESC, p.full_name ASC
    LIMIT 20
  `;

  const { rows } = await pool.query(query);
  return {
    total: rows.length,
    items: rows
  };
}

module.exports = {
  getCasesOfDay,
  getPendingSummary,
  getPendingRegistrationRequests,
  approveUserRegistration,
  getPendingExpectedCases,
  getActiveUsers,
  getAgendaOfDay,
  getRecurrenceSummary
};
