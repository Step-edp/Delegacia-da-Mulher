const adminDashboardService = require('../services/adminDashboardService');

async function getOverview(req, res, next) {
  try {
    const result = await adminDashboardService.getDashboardOverview();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function getPendingCases(req, res, next) {
  try {
    const result = await adminDashboardService.getPendingCasesList();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function getPendingRegistrationRequests(req, res, next) {
  try {
    const result = await adminDashboardService.getPendingRegistrationRequests();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function getUsers(req, res, next) {
  try {
    const result = await adminDashboardService.getUsersList();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function approveRegistrationRequest(req, res, next) {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      const error = new Error('ID de usuario invalido.');
      error.statusCode = 400;
      throw error;
    }

    const result = await adminDashboardService.approveRegistrationRequest(userId);
    if (!result) {
      const error = new Error('Solicitacao de cadastro nao encontrada ou ja aprovada.');
      error.statusCode = 404;
      throw error;
    }

    res.status(200).json({ success: true, userId: result.id });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getOverview,
  getPendingCases,
  getPendingRegistrationRequests,
  approveRegistrationRequest,
  getUsers
};
