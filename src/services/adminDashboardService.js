const dashboardRepository = require('../repositories/adminDashboardRepository');
const env = require('../config/env');
const localAuthRepository = require('../repositories/localAuthRepository');
const localExpectedCaseRepository = require('../repositories/localExpectedCaseRepository');

async function buildDevDashboardOverview() {
  const [pendingRegistrationsResult, pendingExpectedCasesResult, activeUsersResult] = await Promise.allSettled([
    localAuthRepository.countPendingRegistrations(),
    localExpectedCaseRepository.countPendingExpectedCases(),
    localAuthRepository.countActiveUsers()
  ]);

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
    pending: { expectedCasesPending, summonsPending: 1, notificationsPending: 1, pendingRegistrations, activeUsers },
    agendaOfDay: { total: 1, items: [{ personName: 'Super Admin', appointmentType: 'ATENDIMENTO', personRole: 'VITIMA', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 30 * 60000).toISOString(), status: 'AGENDADO' }] },
    recurrence: { total: 1, items: [{ personName: 'Autor Exemplo', cpf: '00000000000', caseCount: 2 }] }
  };
}

async function getDashboardOverview() {
  try {
    const [casesOfDay, pending, agendaOfDay, recurrence] = await Promise.all([
      dashboardRepository.getCasesOfDay(),
      dashboardRepository.getPendingSummary(),
      dashboardRepository.getAgendaOfDay(),
      dashboardRepository.getRecurrenceSummary()
    ]);

    return {
      generatedAt: new Date().toISOString(),
      casesOfDay,
      pending,
      agendaOfDay,
      recurrence
    };
  } catch (error) {
    if (!env.auth.devMode) {
      throw error;
    }

    return buildDevDashboardOverview();
  }
}

async function getPendingRegistrationRequests() {
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

async function getUsersList() {
  try {
    return await dashboardRepository.getActiveUsers();
  } catch (error) {
    if (!env.auth.devMode) {
      throw error;
    }

    const result = await localAuthRepository.listActiveUsers();
    return {
      mocked: true,
      total: result.total,
      items: result.items
    };
  }
}

module.exports = {
  getDashboardOverview,
  getPendingCasesList,
  getPendingRegistrationRequests,
  approveRegistrationRequest,
  getUsersList
};
