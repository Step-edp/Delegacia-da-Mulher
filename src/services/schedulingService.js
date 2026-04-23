const dayjs = require('dayjs');
const customParseFormat = require('dayjs/plugin/customParseFormat');
const crypto = require('crypto');

const schedulingRepository = require('../repositories/schedulingRepository');
const localSchedulingRepository = require('../repositories/localSchedulingRepository');
const adminDashboardRepository = require('../repositories/adminDashboardRepository');
const localExpectedCaseRepository = require('../repositories/localExpectedCaseRepository');
const personService = require('./personService');
const victimNotificationService = require('./victimNotificationService');
const env = require('../config/env');

dayjs.extend(customParseFormat);

function shouldUseLocalSimulation() {
  return env.auth.devMode;
}

function normalizePersonRole(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'INFRATOR' ? 'AUTOR' : normalized;
}

function normalizeDateOnly(value) {
  if (!value) {
    return null;
  }

  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const parsed = dayjs(raw);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : null;
}

function normalizeBoNumber(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function validateSchedulingSettingsPayload(payload, currentSettings = {}) {
  const hasGapValue = payload && payload.victimAuthorGapHours != null && String(payload.victimAuthorGapHours).trim() !== '';
  const hasAuthorSummonsMaxDays = payload && payload.authorSummonsMaxDays != null && String(payload.authorSummonsMaxDays).trim() !== '';
  const hasSummonsMaxAttempts = payload && payload.summonsMaxAttempts != null && String(payload.summonsMaxAttempts).trim() !== '';
  const hasSummonsIntervalHours = payload && payload.summonsIntervalHours != null && String(payload.summonsIntervalHours).trim() !== '';

  const victimAuthorGapHours = Number(hasGapValue ? payload.victimAuthorGapHours : currentSettings.victimAuthorGapHours);
  const authorSummonsMaxDays = Number(hasAuthorSummonsMaxDays ? payload.authorSummonsMaxDays : currentSettings.authorSummonsMaxDays);
  const summonsMaxAttempts = Number(hasSummonsMaxAttempts ? payload.summonsMaxAttempts : (currentSettings.summonsMaxAttempts ?? 3));
  const summonsIntervalHours = Number(hasSummonsIntervalHours ? payload.summonsIntervalHours : (currentSettings.summonsIntervalHours ?? 12));

  if (!Number.isInteger(victimAuthorGapHours) || victimAuthorGapHours < 0 || victimAuthorGapHours > 720) {
    const error = new Error('victimAuthorGapHours deve ser um numero inteiro entre 0 e 720.');
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isInteger(authorSummonsMaxDays) || authorSummonsMaxDays < 0 || authorSummonsMaxDays > 365) {
    const error = new Error('authorSummonsMaxDays deve ser um numero inteiro entre 0 e 365.');
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isInteger(summonsMaxAttempts) || summonsMaxAttempts < 1 || summonsMaxAttempts > 10) {
    const error = new Error('summonsMaxAttempts deve ser um numero inteiro entre 1 e 10.');
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isInteger(summonsIntervalHours) || summonsIntervalHours < 1) {
    const error = new Error('summonsIntervalHours deve ser um numero inteiro maior ou igual a 1.');
    error.statusCode = 400;
    throw error;
  }

  return {
    victimAuthorGapHours,
    authorSummonsMaxDays,
    summonsMaxAttempts,
    summonsIntervalHours
  };
}

function isVictimAuthorRole(personRole) {
  return personRole === 'VITIMA' || personRole === 'AUTOR';
}

function getOppositeVictimAuthorRole(personRole) {
  if (personRole === 'VITIMA') {
    return 'AUTOR';
  }

  if (personRole === 'AUTOR') {
    return 'VITIMA';
  }

  return null;
}

function isAuthorRole(personRole) {
  return personRole === 'AUTOR';
}

async function readSchedulingSettings() {
  if (shouldUseLocalSimulation()) {
    const result = await localSchedulingRepository.getSchedulingSettings();
    return {
      mocked: true,
      ...result
    };
  }

  try {
    return await schedulingRepository.getSchedulingSettings();
  } catch (error) {
    if (!env.auth.devMode) {
      throw error;
    }

    const result = await localSchedulingRepository.getSchedulingSettings();
    return {
      mocked: true,
      ...result
    };
  }
}

async function saveSchedulingSettings(payload) {
  const currentSettings = await readSchedulingSettings();
  const input = validateSchedulingSettingsPayload(payload, currentSettings);

  if (shouldUseLocalSimulation()) {
    const result = await localSchedulingRepository.updateSchedulingSettings(input);
    return {
      mocked: true,
      ...result
    };
  }

  try {
    return await schedulingRepository.updateSchedulingSettings(input);
  } catch (error) {
    if (!env.auth.devMode) {
      throw error;
    }

    const result = await localSchedulingRepository.updateSchedulingSettings(input);
    return {
      mocked: true,
      ...result
    };
  }
}

function parseDateAndTime(date, time) {
  return dayjs(`${date} ${time}`, 'YYYY-MM-DD HH:mm', true);
}

function validateGeneratePayload(payload) {
  const date = String(payload.date || '').trim();
  const startTime = String(payload.startTime || '').trim();
  const endTime = String(payload.endTime || '').trim();
  const intervalMinutes = Number(payload.intervalMinutes || 30);

  const start = parseDateAndTime(date, startTime);
  const end = parseDateAndTime(date, endTime);

  if (!start.isValid() || !end.isValid()) {
    const error = new Error('Data/horario invalido. Use date YYYY-MM-DD, startTime HH:mm e endTime HH:mm.');
    error.statusCode = 400;
    throw error;
  }

  if (intervalMinutes < 10 || intervalMinutes > 240) {
    const error = new Error('intervalMinutes deve ficar entre 10 e 240.');
    error.statusCode = 400;
    throw error;
  }

  if (!end.isAfter(start)) {
    const error = new Error('endTime deve ser maior que startTime.');
    error.statusCode = 400;
    throw error;
  }

  return {
    date,
    start,
    end,
    intervalMinutes
  };
}

function validateListAvailabilityInput(payload) {
  const input = typeof payload === 'string'
    ? { date: payload }
    : (payload || {});
  const normalizedDate = String(input.date || '').trim();

  if (!dayjs(normalizedDate, 'YYYY-MM-DD', true).isValid()) {
    const error = new Error('Data invalida. Use YYYY-MM-DD.');
    error.statusCode = 400;
    throw error;
  }

  let caseId = null;
  if (input.caseId != null && String(input.caseId).trim() !== '') {
    caseId = Number(input.caseId);
    if (!Number.isInteger(caseId) || caseId <= 0) {
      const error = new Error('caseId invalido.');
      error.statusCode = 400;
      throw error;
    }
  }

  let personRole = null;
  if (input.personRole != null && String(input.personRole).trim() !== '') {
    personRole = normalizePersonRole(input.personRole);
    if (!['VITIMA', 'AUTOR', 'TESTEMUNHA', 'RESPONSAVEL'].includes(personRole)) {
      const error = new Error('personRole invalido. Use VITIMA, AUTOR, TESTEMUNHA ou RESPONSAVEL.');
      error.statusCode = 400;
      throw error;
    }
  }

  return {
    date: normalizedDate,
    caseId,
    personRole
  };
}

function validateAvailabilityOptionsInput(payload) {
  const input = payload || {};
  const today = dayjs().format('YYYY-MM-DD');
  const startDate = normalizeDateOnly(input.startDate || today);

  if (!startDate || !dayjs(startDate, 'YYYY-MM-DD', true).isValid()) {
    const error = new Error('startDate invalida. Use YYYY-MM-DD.');
    error.statusCode = 400;
    throw error;
  }

  const days = Number(input.days || 30);
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    const error = new Error('days deve ser um numero inteiro entre 1 e 90.');
    error.statusCode = 400;
    throw error;
  }

  let caseId = null;
  if (input.caseId != null && String(input.caseId).trim() !== '') {
    caseId = Number(input.caseId);
    if (!Number.isInteger(caseId) || caseId <= 0) {
      const error = new Error('caseId invalido.');
      error.statusCode = 400;
      throw error;
    }
  }

  let personRole = null;
  if (input.personRole != null && String(input.personRole).trim() !== '') {
    personRole = normalizePersonRole(input.personRole);
    if (!['VITIMA', 'AUTOR', 'TESTEMUNHA', 'RESPONSAVEL'].includes(personRole)) {
      const error = new Error('personRole invalido. Use VITIMA, AUTOR, TESTEMUNHA ou RESPONSAVEL.');
      error.statusCode = 400;
      throw error;
    }
  }

  return {
    startDate,
    endDate: dayjs(startDate).add(days - 1, 'day').format('YYYY-MM-DD'),
    days,
    caseId,
    personRole
  };
}

function validateVictimAttendanceContextInput(payload) {
  const boNumber = normalizeBoNumber(payload && payload.bo);

  if (!boNumber) {
    const error = new Error('bo e obrigatorio para localizar o atendimento da vitima.');
    error.statusCode = 400;
    throw error;
  }

  return { boNumber };
}

function buildGapViolationError(victimAuthorGapHours) {
  const error = new Error(`Deve haver pelo menos ${victimAuthorGapHours} hora(s) de diferenca entre os agendamentos de vitima e infrator do mesmo caso.`);
  error.statusCode = 409;
  return error;
}

function buildAuthorSummonsDeadlineError(dueDate) {
  const normalizedDueDate = normalizeDateOnly(dueDate);
  const formattedDueDate = normalizedDueDate && dayjs(normalizedDueDate).isValid()
    ? dayjs(normalizedDueDate).format('DD/MM/YYYY')
    : valueOrFallback(normalizedDueDate, 'data informada');
  const error = new Error(`O infrator deste caso pode agendar somente ate ${formattedDueDate}, conforme o prazo maximo da intimacao.`);
  error.statusCode = 409;
  return error;
}

function valueOrFallback(value, fallback) {
  const text = String(value || '').trim();
  return text || fallback;
}

function findGapConflict({ targetStartsAt, appointments, victimAuthorGapHours }) {
  const targetTime = new Date(targetStartsAt).getTime();
  const minimumGapMs = victimAuthorGapHours * 60 * 60 * 1000;

  return (Array.isArray(appointments) ? appointments : []).find((appointment) => {
    const appointmentTime = new Date(appointment.startsAt).getTime();
    if (Number.isNaN(targetTime) || Number.isNaN(appointmentTime)) {
      return false;
    }

    return Math.abs(targetTime - appointmentTime) < minimumGapMs;
  }) || null;
}

async function findVictimAuthorGapConflict({ startsAt, caseId, personRole, victimAuthorGapHours }) {
  if (!caseId || !isVictimAuthorRole(personRole) || victimAuthorGapHours <= 0) {
    return null;
  }

  const repository = shouldUseLocalSimulation() ? localSchedulingRepository : schedulingRepository;
  const oppositeRole = getOppositeVictimAuthorRole(personRole);
  const appointments = await repository.listAppointmentsByCaseAndRoles({
    caseId,
    roles: oppositeRole ? [oppositeRole] : []
  });

  return findGapConflict({
    targetStartsAt: startsAt,
    appointments,
    victimAuthorGapHours
  });
}

async function findAuthorSummonsDeadline({ caseId, personRole }) {
  if (!caseId || !isAuthorRole(personRole)) {
    return null;
  }

  let latestSummons = null;

  if (shouldUseLocalSimulation()) {
    latestSummons = await localSchedulingRepository.findLatestSummonsDeadlineByCaseAndPersonType({
      caseId,
      personType: 'AUTOR'
    });

    if (!latestSummons) {
      try {
        latestSummons = await schedulingRepository.findLatestSummonsDeadlineByCaseAndPersonType({
          caseId,
          personType: 'AUTOR'
        });
      } catch (error) {
        latestSummons = null;
      }
    }
  } else {
    latestSummons = await schedulingRepository.findLatestSummonsDeadlineByCaseAndPersonType({
      caseId,
      personType: 'AUTOR'
    });
  }

  return normalizeDateOnly(latestSummons && latestSummons.dueDate);
}

async function assertAuthorSummonsDeadlineForSlot({ slotId, caseId, personRole }) {
  if (!caseId || !isAuthorRole(personRole)) {
    return;
  }

  const authorSummonsDueDate = await findAuthorSummonsDeadline({ caseId, personRole });
  if (!authorSummonsDueDate) {
    return;
  }

  const repository = shouldUseLocalSimulation() ? localSchedulingRepository : schedulingRepository;
  const slot = await repository.findAvailabilitySlotById(slotId);
  if (!slot) {
    const error = new Error('Horario nao encontrado.');
    error.statusCode = 404;
    throw error;
  }

  const slotDate = normalizeDateOnly(slot.startsAt);
  if (slotDate && slotDate > authorSummonsDueDate) {
    throw buildAuthorSummonsDeadlineError(authorSummonsDueDate);
  }
}

async function assertVictimAuthorGapForSlot({ slotId, caseId, personRole, victimAuthorGapHours }) {
  if (!caseId || !isVictimAuthorRole(personRole) || victimAuthorGapHours <= 0) {
    return;
  }

  const repository = shouldUseLocalSimulation() ? localSchedulingRepository : schedulingRepository;
  const slot = await repository.findAvailabilitySlotById(slotId);
  if (!slot) {
    const error = new Error('Horario nao encontrado.');
    error.statusCode = 404;
    throw error;
  }

  const conflict = await findVictimAuthorGapConflict({
    startsAt: slot.startsAt,
    caseId,
    personRole,
    victimAuthorGapHours
  });

  if (conflict) {
    throw buildGapViolationError(victimAuthorGapHours);
  }
}

async function generateAvailability(payload) {
  const input = validateGeneratePayload(payload);
  const created = [];
  const repository = shouldUseLocalSimulation() ? localSchedulingRepository : schedulingRepository;

  let cursor = input.start;
  while (true) {
    const slotStart = cursor;
    const slotEnd = cursor.add(input.intervalMinutes, 'minute');

    if (slotEnd.isAfter(input.end)) {
      break;
    }

    const slot = await repository.createAvailabilitySlot({
      startsAt: slotStart.toDate(),
      endsAt: slotEnd.toDate()
    });

    if (slot) {
      created.push(slot);
    }

    cursor = slotEnd;
  }

  return {
    date: input.date,
    createdCount: created.length,
    slots: created
  };
}

async function listAvailability(date) {
  const input = validateListAvailabilityInput(date);
  const repository = shouldUseLocalSimulation() ? localSchedulingRepository : schedulingRepository;
  const slots = await repository.listAvailabilityByDate(input.date);
  const settings = await readSchedulingSettings();
  const victimAuthorGapHours = Number(settings && settings.victimAuthorGapHours) || 0;
  const authorSummonsMaxDays = Number(settings && settings.authorSummonsMaxDays);
  const authorSummonsDueDate = await findAuthorSummonsDeadline({
    caseId: input.caseId,
    personRole: input.personRole
  });
  let filteredSlots = slots;

  if (authorSummonsDueDate && input.date > authorSummonsDueDate) {
    filteredSlots = [];
  }

  if (filteredSlots.length > 0 && input.caseId && isVictimAuthorRole(input.personRole) && victimAuthorGapHours > 0) {
    filteredSlots = [];

    for (const slot of slots) {
      const conflict = await findVictimAuthorGapConflict({
        startsAt: slot.startsAt,
        caseId: input.caseId,
        personRole: input.personRole,
        victimAuthorGapHours
      });

      if (!conflict) {
        filteredSlots.push(slot);
      }
    }
  }

  return {
    date: input.date,
    victimAuthorGapHours,
    authorSummonsMaxDays: Number.isInteger(authorSummonsMaxDays) ? authorSummonsMaxDays : 3,
    authorSummonsDueDate,
    slots: filteredSlots
  };
}

async function listAvailabilityOptions(payload) {
  const input = validateAvailabilityOptionsInput(payload);
  const repository = shouldUseLocalSimulation() ? localSchedulingRepository : schedulingRepository;
  const dateKeys = await repository.listAvailabilityDatesInRange({
    startDate: input.startDate,
    endDate: input.endDate
  });

  const dates = [];

  for (const dateKey of dateKeys) {
    const availability = await listAvailability({
      date: dateKey,
      caseId: input.caseId,
      personRole: input.personRole
    });

    if (!availability || !Array.isArray(availability.slots) || !availability.slots.length) {
      continue;
    }

    dates.push({
      date: dateKey,
      slotCount: availability.slots.length,
      slots: availability.slots
    });
  }

  return {
    startDate: input.startDate,
    endDate: input.endDate,
    days: input.days,
    totalDates: dates.length,
    totalSlots: dates.reduce((total, item) => total + item.slotCount, 0),
    dates
  };
}

async function getVictimAttendanceContext(payload) {
  const input = validateVictimAttendanceContextInput(payload);

  if (shouldUseLocalSimulation()) {
    const localResult = await localExpectedCaseRepository.findVictimAttendanceContextByBoNumber(input.boNumber);
    return localResult ? {
      mocked: true,
      boNumber: localResult.boNumber,
      victimName: localResult.victimName || null,
      victimCpf: localResult.victimCpf || null,
      victimPhone: normalizePhone(localResult.victimPhone) || null,
      victimEmail: localResult.victimEmail || null,
      natureza: localResult.natureza || null
    } : null;
  }

  try {
    const result = await adminDashboardRepository.findVictimAttendanceContextByBoNumber(input.boNumber);
    if (!result) {
      return null;
    }

    return {
      boNumber: result.boNumber,
      victimName: result.victimName || null,
      victimCpf: result.victimCpf || null,
      victimPhone: normalizePhone(result.victimPhone) || null,
      victimEmail: result.victimEmail || null,
      natureza: result.natureza || null
    };
  } catch (error) {
    if (!env.auth.devMode) {
      throw error;
    }

    const localResult = await localExpectedCaseRepository.findVictimAttendanceContextByBoNumber(input.boNumber);
    return localResult ? {
      mocked: true,
      boNumber: localResult.boNumber,
      victimName: localResult.victimName || null,
      victimCpf: localResult.victimCpf || null,
      victimPhone: normalizePhone(localResult.victimPhone) || null,
      victimEmail: localResult.victimEmail || null,
      natureza: localResult.natureza || null
    } : null;
  }
}

function validateBookPayload(payload) {
  const slotId = Number(payload.slotId);
  const appointmentType = String(payload.appointmentType || 'ATENDIMENTO').trim().toUpperCase();
  const caseId = payload.caseId ? Number(payload.caseId) : null;
  const personRole = payload.personRole ? normalizePersonRole(payload.personRole) : null;

  if (!Number.isInteger(slotId) || slotId <= 0) {
    const error = new Error('slotId invalido.');
    error.statusCode = 400;
    throw error;
  }

  if (!payload.person || !payload.person.cpf || !payload.person.fullName) {
    const error = new Error('Informe person.cpf e person.fullName para agendar.');
    error.statusCode = 400;
    throw error;
  }

  if (caseId !== null && (!Number.isInteger(caseId) || caseId <= 0)) {
    const error = new Error('caseId invalido.');
    error.statusCode = 400;
    throw error;
  }

  if (personRole !== null && !['VITIMA', 'AUTOR', 'TESTEMUNHA', 'RESPONSAVEL'].includes(personRole)) {
    const error = new Error('personRole invalido. Use VITIMA, AUTOR, TESTEMUNHA ou RESPONSAVEL.');
    error.statusCode = 400;
    throw error;
  }

  return {
    slotId,
    appointmentType,
    notes: payload.notes || null,
    userId: payload.userId || null,
    caseId,
    personRole,
    person: payload.person
  };
}

function generateAttendanceCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function tryBookWithUniqueAttendanceCode(params) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const attendanceCode = generateAttendanceCode();

    try {
      return await schedulingRepository.bookAppointment({
        ...params,
        attendanceCode
      });
    } catch (error) {
      if (error.code === '23505') {
        continue;
      }

      throw error;
    }
  }

  const error = new Error('Nao foi possivel gerar codigo unico de confirmacao. Tente novamente.');
  error.statusCode = 500;
  throw error;
}

async function bookAppointment(payload) {
  const input = validateBookPayload(payload);
  const settings = await readSchedulingSettings();
  const victimAuthorGapHours = Number(settings && settings.victimAuthorGapHours) || 0;

  await assertAuthorSummonsDeadlineForSlot({
    slotId: input.slotId,
    caseId: input.caseId,
    personRole: input.personRole
  });

  await assertVictimAuthorGapForSlot({
    slotId: input.slotId,
    caseId: input.caseId,
    personRole: input.personRole,
    victimAuthorGapHours
  });

  const person = await personService.upsertPerson({
    cpf: input.person.cpf,
    fullName: input.person.fullName,
    phone: input.person.phone,
    email: input.person.email
  });

  const result = await tryBookWithUniqueAttendanceCode({
    slotId: input.slotId,
    personId: person.id,
    userId: input.userId,
    caseId: input.caseId,
    personRole: input.personRole,
    appointmentType: input.appointmentType,
    notes: input.notes
  });

  return {
    person,
    slot: result.slot,
    appointment: result.appointment
  };
}

async function confirmAttendance(payload) {
  const attendanceCode = String(payload.attendanceCode || '').trim().toUpperCase();
  const adminUserId = payload.adminUserId ? Number(payload.adminUserId) : null;

  if (!attendanceCode) {
    const error = new Error('attendanceCode e obrigatorio.');
    error.statusCode = 400;
    throw error;
  }

  if (adminUserId !== null && (!Number.isInteger(adminUserId) || adminUserId <= 0)) {
    const error = new Error('adminUserId invalido.');
    error.statusCode = 400;
    throw error;
  }

  const confirmed = await schedulingRepository.confirmAttendanceByCode({
    attendanceCode,
    adminUserId
  });

  if (!confirmed) {
    const error = new Error('Codigo invalido, ja utilizado ou agendamento cancelado.');
    error.statusCode = 404;
    throw error;
  }

  let victimNotifications = null;
  if (confirmed.caseId && confirmed.personRole === 'AUTOR') {
    victimNotifications = await victimNotificationService.notifyAuthorAttended({
      caseId: confirmed.caseId,
      authorName: ''
    });
  }

  return {
    appointment: confirmed,
    victimNotifications
  };
}

async function getSchedulingSettings() {
  return readSchedulingSettings();
}

async function updateSchedulingSettings(payload) {
  return saveSchedulingSettings(payload);
}

module.exports = {
  generateAvailability,
  listAvailability,
  listAvailabilityOptions,
  getVictimAttendanceContext,
  bookAppointment,
  confirmAttendance,
  getSchedulingSettings,
  updateSchedulingSettings
};
