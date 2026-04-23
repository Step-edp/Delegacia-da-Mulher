const pool = require('../config/database');

const DEFAULT_SCHEDULING_SETTINGS = Object.freeze({
  victimAuthorGapHours: 0,
  authorSummonsMaxDays: 3,
  summonsMaxAttempts: 3,
  summonsIntervalHours: 12,
  updatedAt: null
});

function buildDefaultSchedulingSettings() {
  return {
    ...DEFAULT_SCHEDULING_SETTINGS
  };
}

function isMissingSchedulingSettingsSchemaError(error) {
  const message = String(error && error.message ? error.message : '').toLowerCase();

  if (error && error.code === '42P01') {
    return message.includes('scheduling_settings');
  }

  if (error && error.code === '42703') {
    return message.includes('author_summons_max_days')
      || message.includes('victim_author_gap_hours')
      || message.includes('summons_max_attempts')
      || message.includes('summons_interval_hours');
  }

  return false;
}

async function createAvailabilitySlot({ startsAt, endsAt }) {
  const query = `
    INSERT INTO availability_slots (starts_at, ends_at, status)
    VALUES ($1, $2, 'DISPONIVEL')
    ON CONFLICT (starts_at) DO NOTHING
    RETURNING
      id,
      starts_at AS "startsAt",
      ends_at AS "endsAt",
      status
  `;

  const { rows } = await pool.query(query, [startsAt, endsAt]);
  return rows[0] || null;
}

async function findAvailabilitySlotById(slotId) {
  const query = `
    SELECT
      id,
      starts_at AS "startsAt",
      ends_at AS "endsAt",
      status
    FROM availability_slots
    WHERE id = $1
    LIMIT 1
  `;

  const { rows } = await pool.query(query, [slotId]);
  return rows[0] || null;
}

async function listAvailabilityByDate(date) {
  const query = `
    SELECT
      id,
      starts_at AS "startsAt",
      ends_at AS "endsAt",
      status
    FROM availability_slots
    WHERE starts_at::date = $1::date
    ORDER BY starts_at ASC
  `;

  const { rows } = await pool.query(query, [date]);
  return rows;
}

async function listAvailabilityDatesInRange({ startDate, endDate }) {
  const query = `
    SELECT DISTINCT starts_at::date::text AS date
    FROM availability_slots
    WHERE starts_at::date >= $1::date
      AND starts_at::date <= $2::date
      AND status = 'DISPONIVEL'
    ORDER BY date ASC
  `;

  const { rows } = await pool.query(query, [startDate, endDate]);
  return rows.map((row) => row.date);
}

async function listAppointmentsByCaseAndRoles({ caseId, roles }) {
  const query = `
    SELECT
      a.id,
      a.case_id AS "caseId",
      a.person_role AS "personRole",
      a.status,
      s.starts_at AS "startsAt",
      s.ends_at AS "endsAt"
    FROM appointments a
    INNER JOIN availability_slots s ON s.id = a.slot_id
    WHERE a.case_id = $1
      AND a.status <> 'CANCELADO'
      AND ($2::text[] IS NULL OR a.person_role = ANY($2::text[]))
    ORDER BY s.starts_at ASC
  `;

  const roleList = Array.isArray(roles) && roles.length ? roles : null;
  const { rows } = await pool.query(query, [caseId, roleList]);
  return rows;
}

async function findLatestSummonsDeadlineByCaseAndPersonType({ caseId, personType }) {
  const query = `
    SELECT
      due_date AS "dueDate",
      delivered_at AS "deliveredAt",
      created_at AS "createdAt",
      status
    FROM summons
    WHERE case_id = $1
      AND person_type = $2
      AND status <> 'cancelled'
      AND (delivered_at IS NOT NULL OR status IN ('sent', 'received', 'expired'))
    ORDER BY COALESCE(delivered_at, created_at) DESC, id DESC
    LIMIT 1
  `;

  const { rows } = await pool.query(query, [caseId, personType]);
  return rows[0] || null;
}

async function ensureSchedulingSettingsRow() {
  await pool.query(
    `
    INSERT INTO scheduling_settings (id, victim_author_gap_hours, author_summons_max_days)
    VALUES (1, 0, 3)
    ON CONFLICT (id) DO NOTHING
    `
  );
}

async function getSchedulingSettings() {
  try {
    await ensureSchedulingSettingsRow();

    const query = `
      SELECT
        victim_author_gap_hours AS "victimAuthorGapHours",
        author_summons_max_days AS "authorSummonsMaxDays",
        COALESCE(summons_max_attempts, 3) AS "summonsMaxAttempts",
        COALESCE(summons_interval_hours, 12) AS "summonsIntervalHours",
        updated_at AS "updatedAt"
      FROM scheduling_settings
      WHERE id = 1
      LIMIT 1
    `;

    const { rows } = await pool.query(query);
    return rows[0] || buildDefaultSchedulingSettings();
  } catch (error) {
    if (isMissingSchedulingSettingsSchemaError(error)) {
      return buildDefaultSchedulingSettings();
    }

    throw error;
  }
}

async function updateSchedulingSettings({ victimAuthorGapHours, authorSummonsMaxDays, summonsMaxAttempts, summonsIntervalHours }) {
  const query = `
    INSERT INTO scheduling_settings (id, victim_author_gap_hours, author_summons_max_days, summons_max_attempts, summons_interval_hours)
    VALUES (1, $1, $2, $3, $4)
    ON CONFLICT (id)
    DO UPDATE SET
      victim_author_gap_hours = EXCLUDED.victim_author_gap_hours,
      author_summons_max_days = EXCLUDED.author_summons_max_days,
      summons_max_attempts = EXCLUDED.summons_max_attempts,
      summons_interval_hours = EXCLUDED.summons_interval_hours,
      updated_at = NOW()
    RETURNING
      victim_author_gap_hours AS "victimAuthorGapHours",
      author_summons_max_days AS "authorSummonsMaxDays",
      COALESCE(summons_max_attempts, 3) AS "summonsMaxAttempts",
      COALESCE(summons_interval_hours, 12) AS "summonsIntervalHours",
      updated_at AS "updatedAt"
  `;

  const { rows } = await pool.query(query, [victimAuthorGapHours, authorSummonsMaxDays, summonsMaxAttempts ?? 3, summonsIntervalHours ?? 12]);
  return rows[0] || null;
}

async function bookAppointment({ slotId, personId, userId, appointmentType, notes, attendanceCode, caseId, personRole }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const lockSlotQuery = `
      SELECT id, starts_at AS "startsAt", ends_at AS "endsAt", status
      FROM availability_slots
      WHERE id = $1
      FOR UPDATE
    `;

    const slotResult = await client.query(lockSlotQuery, [slotId]);
    const slot = slotResult.rows[0];

    if (!slot) {
      const error = new Error('Horario nao encontrado.');
      error.statusCode = 404;
      throw error;
    }

    if (slot.status !== 'DISPONIVEL') {
      const error = new Error('Horario indisponivel para agendamento.');
      error.statusCode = 409;
      throw error;
    }

    const createAppointmentQuery = `
      INSERT INTO appointments (
        slot_id,
        person_id,
        user_id,
        case_id,
        person_role,
        appointment_type,
        status,
        notes,
        attendance_code
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'AGENDADO', $7, $8)
      RETURNING
        id,
        slot_id AS "slotId",
        person_id AS "personId",
        user_id AS "userId",
        case_id AS "caseId",
        person_role AS "personRole",
        appointment_type AS "appointmentType",
        status,
        notes,
        attendance_code AS "attendanceCode",
        booked_at AS "bookedAt",
        created_at AS "createdAt"
    `;

    const appointmentResult = await client.query(createAppointmentQuery, [
      slotId,
      personId,
      userId || null,
      caseId || null,
      personRole || null,
      appointmentType,
      notes || null,
      attendanceCode
    ]);

    await client.query(
      `
      UPDATE availability_slots
      SET status = 'RESERVADO', updated_at = NOW()
      WHERE id = $1
      `,
      [slotId]
    );

    await client.query('COMMIT');

    return {
      slot,
      appointment: appointmentResult.rows[0]
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function confirmAttendanceByCode({ attendanceCode, adminUserId }) {
  const query = `
    UPDATE appointments
    SET
      status = 'CONCLUIDO',
      attendance_confirmed_at = NOW(),
      attendance_confirmed_by_user_id = $2,
      updated_at = NOW()
    WHERE attendance_code = $1
      AND attendance_confirmed_at IS NULL
      AND status <> 'CANCELADO'
    RETURNING
      id,
      slot_id AS "slotId",
      person_id AS "personId",
      case_id AS "caseId",
      person_role AS "personRole",
      status,
      attendance_code AS "attendanceCode",
      attendance_confirmed_at AS "attendanceConfirmedAt",
      attendance_confirmed_by_user_id AS "attendanceConfirmedByUserId",
      updated_at AS "updatedAt"
  `;

  const { rows } = await pool.query(query, [attendanceCode, adminUserId || null]);
  return rows[0] || null;
}

module.exports = {
  createAvailabilitySlot,
  findAvailabilitySlotById,
  listAvailabilityByDate,
  listAvailabilityDatesInRange,
  listAppointmentsByCaseAndRoles,
  findLatestSummonsDeadlineByCaseAndPersonType,
  getSchedulingSettings,
  updateSchedulingSettings,
  bookAppointment,
  confirmAttendanceByCode
};
