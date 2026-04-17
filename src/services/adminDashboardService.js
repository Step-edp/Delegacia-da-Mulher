const fs = require('fs/promises');
const path = require('path');

const dashboardRepository = require('../repositories/adminDashboardRepository');
const dailyImportRepository = require('../repositories/dailyImportRepository');
const env = require('../config/env');
const localAuthRepository = require('../repositories/localAuthRepository');
const localExpectedCaseRepository = require('../repositories/localExpectedCaseRepository');
const whatsappService = require('./whatsappService');

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads', 'pdfs');
const SUPER_ADMIN_FULL_NAME = 'Stephanie de Paula Santos Amorim';
const SUPER_ADMIN_EMAIL = 'stephanieps.amorim@gmail.com';

function toIsoOrNull(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function padNumber(value) {
  return String(value).padStart(2, '0');
}

function buildMonthKeyFromDate(date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}`;
}

function buildDateKeyFromDate(date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function buildDateKeyFromIso(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return buildDateKeyFromDate(parsed);
}

function parseAgendaMonth(monthValue) {
  const normalized = String(monthValue || '').trim();
  const today = new Date();

  if (!normalized) {
    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    return {
      month: buildMonthKeyFromDate(currentMonthStart),
      monthStart: buildDateKeyFromDate(currentMonthStart),
      nextMonthStart: buildDateKeyFromDate(nextMonthStart)
    };
  }

  const match = normalized.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    const error = new Error('Mes invalido. Use YYYY-MM.');
    error.statusCode = 400;
    throw error;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    const error = new Error('Mes invalido. Use YYYY-MM.');
    error.statusCode = 400;
    throw error;
  }

  const monthStartDate = new Date(year, monthIndex, 1);
  const nextMonthStartDate = new Date(year, monthIndex + 1, 1);

  return {
    month: buildMonthKeyFromDate(monthStartDate),
    monthStart: buildDateKeyFromDate(monthStartDate),
    nextMonthStart: buildDateKeyFromDate(nextMonthStartDate)
  };
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeLower(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePersonName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeComparableText(value) {
  const normalized = normalizePersonName(value);
  if (!normalized) {
    return '';
  }

  return normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function buildInvolvedPersonKey({ fullName, cpf }) {
  const digits = normalizeDigits(cpf);
  if (digits) {
    return `cpf:${digits}`;
  }

  const comparableName = normalizeComparableText(fullName);
  return comparableName ? `name:${comparableName}` : null;
}

function mapInvolvedRoleLabel(role) {
  if (role === 'VITIMA') {
    return 'Vitima';
  }

  if (role === 'INFRATOR') {
    return 'Infrator';
  }

  if (role === 'TESTEMUNHA') {
    return 'Testemunha';
  }

  return role;
}

function splitWitnessNames(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizePersonName(item)).filter(Boolean);
  }

  const normalized = normalizePersonName(value);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/[;|]/)
    .map((item) => normalizePersonName(item))
    .filter(Boolean);
}

function buildInvolvedSourceEntries(item) {
  const entries = [];

  if (normalizePersonName(item.victimName)) {
    entries.push({
      fullName: item.victimName,
      cpf: item.victimCpf,
      role: 'VITIMA'
    });
  }

  if (normalizePersonName(item.authorName)) {
    entries.push({
      fullName: item.authorName,
      cpf: item.authorCpf,
      role: 'INFRATOR'
    });
  }

  splitWitnessNames(item.witnesses && item.witnesses.length ? item.witnesses : item.witnessName)
    .forEach((witnessName) => {
      entries.push({
        fullName: witnessName,
        cpf: item.witnessCpf,
        role: 'TESTEMUNHA'
      });
    });

  return entries;
}

function buildInvolvedPeopleResponse(sourceItems) {
  const peopleMap = new Map();
  const roleOrder = ['INFRATOR', 'VITIMA', 'TESTEMUNHA'];

  for (const item of Array.isArray(sourceItems) ? sourceItems : []) {
    const boNumber = normalizePersonName(item.boNumber).toUpperCase();
    const natureza = normalizePersonName(item.natureza);
    const seenAt = toIsoOrNull(item.updatedAt) || toIsoOrNull(item.createdAt);

    for (const entry of buildInvolvedSourceEntries(item)) {
      const fullName = normalizePersonName(entry.fullName);
      const cpf = normalizeDigits(entry.cpf) || null;
      const key = buildInvolvedPersonKey({ fullName, cpf });

      if (!key) {
        continue;
      }

      const existing = peopleMap.get(key) || {
        id: key,
        fullName,
        cpf,
        roles: new Set(),
        boNumbers: new Set(),
        naturezas: new Set(),
        latestSeenAt: seenAt
      };

      if (!existing.fullName || fullName.length > existing.fullName.length) {
        existing.fullName = fullName;
      }

      if (!existing.cpf && cpf) {
        existing.cpf = cpf;
      }

      if (entry.role) {
        existing.roles.add(entry.role);
      }

      if (boNumber) {
        existing.boNumbers.add(boNumber);
      }

      if (natureza) {
        existing.naturezas.add(natureza);
      }

      if (!existing.latestSeenAt || (seenAt && new Date(seenAt).getTime() > new Date(existing.latestSeenAt).getTime())) {
        existing.latestSeenAt = seenAt;
      }

      peopleMap.set(key, existing);
    }
  }

  const items = [...peopleMap.values()]
    .map((item) => {
      const boNumbers = [...item.boNumbers].sort((left, right) => right.localeCompare(left, 'pt-BR'));
      const naturezas = [...item.naturezas].sort((left, right) => left.localeCompare(right, 'pt-BR'));
      const roles = [...item.roles]
        .sort((left, right) => roleOrder.indexOf(left) - roleOrder.indexOf(right))
        .map(mapInvolvedRoleLabel);
      const boCount = boNumbers.length;
      const recurrenceCount = boCount > 1 ? boCount - 1 : 0;

      return {
        id: item.id,
        fullName: item.fullName,
        cpf: item.cpf,
        roles,
        boNumbers,
        naturezas,
        boCount,
        recurrenceCount,
        isRecurrent: recurrenceCount > 0,
        latestSeenAt: item.latestSeenAt || null
      };
    })
    .sort((left, right) => {
      if (Number(right.isRecurrent) !== Number(left.isRecurrent)) {
        return Number(right.isRecurrent) - Number(left.isRecurrent);
      }

      if (right.recurrenceCount !== left.recurrenceCount) {
        return right.recurrenceCount - left.recurrenceCount;
      }

      return left.fullName.localeCompare(right.fullName, 'pt-BR');
    });

  return {
    total: items.length,
    recurrentTotal: items.filter((item) => item.isRecurrent).length,
    items
  };
}

function isProtectedUser(user) {
  if (!user) {
    return false;
  }

  const protectedCpf = normalizeDigits(env.auth.devAdminCpf || '40280221851');
  return normalizeDigits(user.cpf) === protectedCpf
    || normalizeLower(user.email) === SUPER_ADMIN_EMAIL;
}

function annotateUserItem(user) {
  return {
    ...user,
    isProtected: isProtectedUser(user)
  };
}

function buildAgendaCalendarResponse({ month, items, mocked = false }) {
  const normalizedItems = Array.isArray(items)
    ? items
        .map((item) => ({
          id: item.id,
          slotId: item.slotId,
          status: item.status || null,
          appointmentType: item.appointmentType || null,
          personRole: item.personRole || null,
          startsAt: toIsoOrNull(item.startsAt),
          endsAt: toIsoOrNull(item.endsAt),
          personName: normalizePersonName(item.personName) || null,
          dateKey: buildDateKeyFromIso(item.startsAt)
        }))
        .filter((item) => Boolean(item.startsAt) && Boolean(item.dateKey))
    : [];

  const daysWithAppointments = new Set(normalizedItems.map((item) => item.dateKey)).size;
  return {
    ...(mocked ? { mocked: true } : {}),
    month,
    total: normalizedItems.length,
    daysWithAppointments,
    items: normalizedItems
  };
}

function buildNotificationsResponse({ items, mocked = false }) {
  const normalizedItems = Array.isArray(items)
    ? items
        .map((item) => {
          const caseProtocolNumber = normalizePersonName(item.caseProtocolNumber);

          return {
            id: item.id,
            targetName: normalizePersonName(item.targetName) || null,
            targetCpf: normalizeDigits(item.targetCpf) || null,
            targetPhone: normalizeDigits(item.targetPhone) || null,
            caseId: item.caseId || null,
            caseProtocolNumber: caseProtocolNumber ? caseProtocolNumber.toUpperCase() : null,
            message: String(item.message || '').trim(),
            channel: normalizeLower(item.channel) || null,
            status: normalizeLower(item.status) || null,
            scheduledFor: toIsoOrNull(item.scheduledFor),
            sentAt: toIsoOrNull(item.sentAt),
            createdAt: toIsoOrNull(item.createdAt)
          };
        })
        .filter((item) => item.id != null)
    : [];

  const pendingTotal = normalizedItems.filter((item) => ['pending', 'queued', 'failed'].includes(item.status)).length;

  return {
    ...(mocked ? { mocked: true } : {}),
    total: normalizedItems.length,
    pendingTotal,
    items: normalizedItems
  };
}

function buildDevAgendaCalendar(monthValue) {
  const parsedMonth = parseAgendaMonth(monthValue);
  const now = new Date();
  const currentMonthKey = buildMonthKeyFromDate(now);
  const shouldIncludeMockItem = parsedMonth.month === currentMonthKey;

  return buildAgendaCalendarResponse({
    month: parsedMonth.month,
    mocked: true,
    items: shouldIncludeMockItem
      ? [{
          id: 1,
          slotId: 1,
          status: 'AGENDADO',
          appointmentType: 'ATENDIMENTO',
          personRole: 'VITIMA',
          startsAt: now.toISOString(),
          endsAt: new Date(now.getTime() + 30 * 60000).toISOString(),
          personName: SUPER_ADMIN_FULL_NAME
        }]
      : []
  });
}

function buildDevNotificationsList() {
  const now = new Date().toISOString();

  return buildNotificationsResponse({
    mocked: true,
    items: [{
      id: 1,
      targetName: 'Vitima Exemplo',
      targetCpf: '00000000000',
      targetPhone: '11999999999',
      caseId: 1,
      caseProtocolNumber: 'DEV-001',
      message: 'Atualizacao do caso: o autor Exemplo foi intimado.',
      channel: 'whatsapp',
      status: 'queued',
      scheduledFor: now,
      sentAt: null,
      createdAt: now
    }]
  });
}

function sanitizeUploadOriginalName(fileName) {
  return String(fileName || '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
}

function resolveUploadTimestamp(savedName) {
  const match = String(savedName || '').match(/^(\d+)-/);
  if (!match) {
    return Number.NaN;
  }

  return Number(match[1]);
}

async function resolveSavedFileName({ sourceName, importedAt }) {
  const safeOriginalName = sanitizeUploadOriginalName(sourceName);
  if (!safeOriginalName) {
    return null;
  }

  let fileNames = [];

  try {
    fileNames = await fs.readdir(UPLOADS_DIR);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }

  const matches = fileNames
    .filter((fileName) => fileName.endsWith(`-${safeOriginalName}`))
    .map((fileName) => {
      const timestamp = resolveUploadTimestamp(fileName);
      const importedAtMs = new Date(importedAt || 0).getTime();
      const delta = Number.isNaN(timestamp) || Number.isNaN(importedAtMs)
        ? Number.MAX_SAFE_INTEGER
        : Math.abs(timestamp - importedAtMs);

      return { fileName, timestamp, delta };
    })
    .sort((left, right) => {
      if (left.delta !== right.delta) {
        return left.delta - right.delta;
      }

      return right.timestamp - left.timestamp;
    });

  return matches[0] ? matches[0].fileName : null;
}

async function mapImportHistoryItem(item) {
  const importedAt = toIsoOrNull(item.createdAt) || toIsoOrNull(item.updatedAt);
  const savedName = item.savedName || await resolveSavedFileName({
    sourceName: item.sourceName,
    importedAt
  });

  return {
    id: item.id,
    importedAt,
    file: {
      originalName: item.sourceName || null,
      savedName
    },
    uploadedBy: null,
    period: {
      raw: null,
      iso: {
        start: toIsoOrNull(item.periodStart),
        end: toIsoOrNull(item.periodEnd)
      }
    }
  };
}

function shouldUseLocalSimulation() {
  return env.auth.devMode;
}

function normalizeCount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function buildEmptyCasesOfDay() {
  return {
    total: 0,
    items: []
  };
}

function buildEmptyInvolvedPeopleOverview() {
  return {
    total: 0,
    recurrentTotal: 0,
    items: []
  };
}

function buildEmptyPendingSummary() {
  return {
    expectedCasesPending: 0,
    summonsPending: 0,
    notificationsPending: 0,
    pendingRegistrations: 0,
    activeUsers: 0
  };
}

function normalizePendingSummary(summary) {
  return {
    expectedCasesPending: normalizeCount(summary && summary.expectedCasesPending),
    summonsPending: normalizeCount(summary && summary.summonsPending),
    notificationsPending: normalizeCount(summary && summary.notificationsPending),
    pendingRegistrations: normalizeCount(summary && summary.pendingRegistrations),
    activeUsers: normalizeCount(summary && summary.activeUsers)
  };
}

function buildEmptyAgendaOfDay() {
  return {
    total: 0,
    items: []
  };
}

function buildEmptyRecurrenceSummary() {
  return {
    total: 0,
    items: []
  };
}

function logDashboardOverviewSectionFailure(sectionName, error) {
  const message = error && error.message ? error.message : 'Erro desconhecido.';
  console.warn(`[adminDashboardService] dashboard overview fallback for ${sectionName}: ${message}`);
}

function buildOverviewSectionResult(result, { sectionName, fallbackValue, transform }) {
  if (result.status === 'fulfilled') {
    return {
      value: typeof transform === 'function' ? transform(result.value) : result.value,
      warning: null
    };
  }

  logDashboardOverviewSectionFailure(sectionName, result.reason);

  return {
    value: fallbackValue,
    warning: sectionName
  };
}

async function buildDevDashboardOverview() {
  const [pendingRegistrationsResult, pendingExpectedCasesResult, activeUsersResult] = await Promise.allSettled([
    localAuthRepository.countPendingRegistrations(),
    localExpectedCaseRepository.countPendingExpectedCases(),
    localAuthRepository.countActiveUsers()
  ]);
  const involvedPeople = await getInvolvedPeopleList();

  const pendingRegistrations = pendingRegistrationsResult.status === 'fulfilled'
    ? pendingRegistrationsResult.value
    : 0;
  const expectedCasesPending = pendingExpectedCasesResult.status === 'fulfilled'
    ? pendingExpectedCasesResult.value
    : 0;
  const activeUsers = activeUsersResult.status === 'fulfilled'
    ? activeUsersResult.value
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    mocked: true,
    casesOfDay: { total: 1, items: [{ protocolNumber: 'DEV-001', title: 'Caso de teste', status: 'open', priority: 'medium', openedAt: new Date().toISOString() }] },
    involvedPeople: { total: involvedPeople.total },
    pending: { expectedCasesPending, summonsPending: 1, notificationsPending: 1, pendingRegistrations, activeUsers },
    agendaOfDay: { total: 1, items: [{ personName: SUPER_ADMIN_FULL_NAME, appointmentType: 'ATENDIMENTO', personRole: 'VITIMA', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 30 * 60000).toISOString(), status: 'AGENDADO' }] },
    recurrence: { total: 1, items: [{ personName: 'Autor Exemplo', cpf: '00000000000', caseCount: 2 }] }
  };
}

async function getDashboardOverview() {
  if (shouldUseLocalSimulation()) {
    return buildDevDashboardOverview();
  }

  const results = await Promise.allSettled([
    getInvolvedPeopleList(),
    dashboardRepository.getCasesOfDay(),
    dashboardRepository.getPendingSummary(),
    dashboardRepository.getAgendaOfDay(),
    dashboardRepository.getRecurrenceSummary()
  ]);

  const rejectedResults = results.filter((result) => result.status === 'rejected');
  if (rejectedResults.length === results.length) {
    throw rejectedResults[0].reason;
  }

  const [
    involvedPeopleResult,
    casesOfDayResult,
    pendingResult,
    agendaOfDayResult,
    recurrenceResult
  ] = results;

  const involvedPeople = buildOverviewSectionResult(involvedPeopleResult, {
    sectionName: 'involvedPeople',
    fallbackValue: buildEmptyInvolvedPeopleOverview(),
    transform: (value) => ({
      total: normalizeCount(value && value.total)
    })
  });

  const casesOfDay = buildOverviewSectionResult(casesOfDayResult, {
    sectionName: 'casesOfDay',
    fallbackValue: buildEmptyCasesOfDay()
  });

  const pending = buildOverviewSectionResult(pendingResult, {
    sectionName: 'pending',
    fallbackValue: buildEmptyPendingSummary(),
    transform: normalizePendingSummary
  });

  const agendaOfDay = buildOverviewSectionResult(agendaOfDayResult, {
    sectionName: 'agendaOfDay',
    fallbackValue: buildEmptyAgendaOfDay()
  });

  const recurrence = buildOverviewSectionResult(recurrenceResult, {
    sectionName: 'recurrence',
    fallbackValue: buildEmptyRecurrenceSummary()
  });

  const warnings = [
    involvedPeople.warning,
    casesOfDay.warning,
    pending.warning,
    agendaOfDay.warning,
    recurrence.warning
  ].filter(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    ...(warnings.length ? { partial: true, warnings } : {}),
    casesOfDay: casesOfDay.value,
    involvedPeople: involvedPeople.value,
    pending: pending.value,
    agendaOfDay: agendaOfDay.value,
    recurrence: recurrence.value
  };
}

async function getPendingRegistrationRequests() {
  if (shouldUseLocalSimulation()) {
    const result = await localAuthRepository.listPendingRegistrations();
    return {
      mocked: true,
      total: result.total,
      items: result.items
    };
  }

  try {
    return await dashboardRepository.getPendingRegistrationRequests();
  } catch (error) {
    if (!env.auth.devMode) {
      throw error;
    }

    const result = await localAuthRepository.listPendingRegistrations();
    return {
      mocked: true,
      total: result.total,
      items: result.items
    };
  }
}

async function approveRegistrationRequest(userId) {
  if (shouldUseLocalSimulation()) {
    return localAuthRepository.approveRegistration(userId);
  }

  try {
    return await dashboardRepository.approveUserRegistration(userId);
  } catch (error) {
    if (!env.auth.devMode) {
      throw error;
    }

    return localAuthRepository.approveRegistration(userId);
  }
}

async function getPendingCasesList() {
  if (shouldUseLocalSimulation()) {
    const result = await localExpectedCaseRepository.listPendingExpectedCases();

    return {
      mocked: true,
      total: result.total,
      items: result.items
    };
  }

  try {
    return await dashboardRepository.getPendingExpectedCases();
  } catch (error) {
    if (!env.auth.devMode) {
      throw error;
    }

    const result = await localExpectedCaseRepository.listPendingExpectedCases();

    return {
      mocked: true,
      total: result.total,
      items: result.items
    };
  }
}

async function findPendingCaseForIndictment(expectedCaseId) {
  if (shouldUseLocalSimulation()) {
    return localExpectedCaseRepository.findPendingExpectedCaseById(expectedCaseId);
  }

  try {
    return await dashboardRepository.findPendingExpectedCaseById(expectedCaseId);
  } catch (error) {
    if (!env.auth.devMode) {
      throw error;
    }

    return localExpectedCaseRepository.findPendingExpectedCaseById(expectedCaseId);
  }
}

async function markPendingCaseForIndictment(expectedCaseId) {
  if (shouldUseLocalSimulation()) {
    return localExpectedCaseRepository.markPendingCaseAsProcessing(expectedCaseId);
  }

  try {
    return await dashboardRepository.markPendingCaseAsProcessing(expectedCaseId);
  } catch (error) {
    if (!env.auth.devMode) {
      throw error;
    }

    return localExpectedCaseRepository.markPendingCaseAsProcessing(expectedCaseId);
  }
}

async function indictPendingCase(expectedCaseId, payload) {
  const expectedCase = await findPendingCaseForIndictment(expectedCaseId);

  if (!expectedCase) {
    return null;
  }

  const delivery = await whatsappService.sendIndictmentMessage({
    phone: payload && payload.authorWhatsapp,
    messageTemplate: payload && payload.messageTemplate,
    publicBaseUrl: payload && payload.publicBaseUrl,
    authorName: expectedCase.authorName,
    boNumber: expectedCase.boNumber
  });

  const updatedCase = await markPendingCaseForIndictment(expectedCaseId);
  if (!updatedCase) {
    const error = new Error('BO pendente nao encontrado ou ja processado.');
    error.statusCode = 409;
    throw error;
  }

  return {
    ...updatedCase,
    delivery
  };
}

async function getInvolvedPeopleList() {
  if (shouldUseLocalSimulation()) {
    const result = await localExpectedCaseRepository.listInvolvedPeopleSource();
    return {
      mocked: true,
      ...buildInvolvedPeopleResponse(result.items)
    };
  }

  try {
    const result = await dashboardRepository.listInvolvedPeopleSource();
    return buildInvolvedPeopleResponse(result.items);
  } catch (error) {
    if (!env.auth.devMode) {
      throw error;
    }

    const result = await localExpectedCaseRepository.listInvolvedPeopleSource();
    return {
      mocked: true,
      ...buildInvolvedPeopleResponse(result.items)
    };
  }
}

async function getAgendaCalendar(monthValue) {
  const parsedMonth = parseAgendaMonth(monthValue);

  if (shouldUseLocalSimulation()) {
    return buildDevAgendaCalendar(parsedMonth.month);
  }

  try {
    const result = await dashboardRepository.listAgendaByMonth({
      monthStart: parsedMonth.monthStart,
      nextMonthStart: parsedMonth.nextMonthStart
    });

    return buildAgendaCalendarResponse({
      month: parsedMonth.month,
      items: result.items
    });
  } catch (error) {
    if (!env.auth.devMode) {
      throw error;
    }

    return buildDevAgendaCalendar(parsedMonth.month);
  }
}

async function getUsersList() {
  if (shouldUseLocalSimulation()) {
    const result = await localAuthRepository.listActiveUsers();
    return {
      mocked: true,
      total: result.total,
      items: result.items.map(annotateUserItem)
    };
  }

  try {
    const result = await dashboardRepository.getActiveUsers();
    return {
      total: result.total,
      items: result.items.map(annotateUserItem)
    };
  } catch (error) {
    if (!env.auth.devMode) {
      throw error;
    }

    const result = await localAuthRepository.listActiveUsers();
    return {
      mocked: true,
      total: result.total,
      items: result.items.map(annotateUserItem)
    };
  }
}

async function deleteUser(userId) {
  if (shouldUseLocalSimulation()) {
    const user = await localAuthRepository.findUserById(userId);

    if (!user || !user.isActive) {
      return null;
    }

    if (isProtectedUser(user)) {
      const error = new Error('Super Admin nao pode ser excluido.');
      error.statusCode = 403;
      throw error;
    }

    return localAuthRepository.deleteUser(userId);
  }

  try {
    const user = await dashboardRepository.findUserById(userId);

    if (!user || !user.isActive) {
      return null;
    }

    if (isProtectedUser(user)) {
      const error = new Error('Super Admin nao pode ser excluido.');
      error.statusCode = 403;
      throw error;
    }

    return dashboardRepository.deleteUser(userId);
  } catch (error) {
    if (!env.auth.devMode) {
      throw error;
    }

    const user = await localAuthRepository.findUserById(userId);

    if (!user || !user.isActive) {
      return null;
    }

    if (isProtectedUser(user)) {
      const protectedError = new Error('Super Admin nao pode ser excluido.');
      protectedError.statusCode = 403;
      throw protectedError;
    }

    return localAuthRepository.deleteUser(userId);
  }
}

async function getNotificationsList() {
  if (shouldUseLocalSimulation()) {
    return buildDevNotificationsList();
  }

  try {
    const result = await dashboardRepository.getNotifications();
    return buildNotificationsResponse(result);
  } catch (error) {
    if (!env.auth.devMode) {
      throw error;
    }

    return buildDevNotificationsList();
  }
}

async function getImportHistory() {
  if (shouldUseLocalSimulation()) {
    const result = await localExpectedCaseRepository.listImportHistory();
    return {
      mocked: true,
      total: result.total,
      items: await Promise.all(result.items.map(mapImportHistoryItem))
    };
  }

  try {
    const result = await dailyImportRepository.getImportHistory();
    return {
      total: result.total,
      items: await Promise.all(result.items.map(mapImportHistoryItem))
    };
  } catch (error) {
    if (!env.auth.devMode) {
      throw error;
    }

    const result = await localExpectedCaseRepository.listImportHistory();
    return {
      mocked: true,
      total: result.total,
      items: await Promise.all(result.items.map(mapImportHistoryItem))
    };
  }
}

module.exports = {
  getDashboardOverview,
  getPendingCasesList,
  indictPendingCase,
  getAgendaCalendar,
  getInvolvedPeopleList,
  getPendingRegistrationRequests,
  approveRegistrationRequest,
  getUsersList,
  getNotificationsList,
  getImportHistory,
  deleteUser
};
