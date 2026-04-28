const adminDashboardService = require('../services/adminDashboardService');
const schedulingService = require('../services/schedulingService');

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

async function getProcessingCases(req, res, next) {
  try {
    const result = await adminDashboardService.getProcessingCasesList();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function downloadImportedFile(req, res, next) {
  try {
    const path = require('path');
    const fs = require('fs');
    const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads', 'pdfs');

    const rawFileName = String(req.params.fileName || '').trim();
    const safeFileName = path.basename(rawFileName);

    if (!safeFileName || safeFileName !== rawFileName || safeFileName.includes('..')) {
      const error = new Error('Nome de arquivo invalido.');
      error.statusCode = 400;
      throw error;
    }

    const filePath = path.join(UPLOADS_DIR, safeFileName);

    if (!fs.existsSync(filePath)) {
      const error = new Error('Arquivo nao encontrado.');
      error.statusCode = 404;
      throw error;
    }

    res.download(filePath, safeFileName);
  } catch (error) {
    next(error);
  }
}

async function indictPendingCase(req, res, next) {
  try {
    const expectedCaseId = Number(req.params.expectedCaseId);
    if (!Number.isInteger(expectedCaseId) || expectedCaseId <= 0) {
      const error = new Error('ID de BO pendente invalido.');
      error.statusCode = 400;
      throw error;
    }

    const result = await adminDashboardService.indictPendingCase(expectedCaseId, req.body);
    if (!result) {
      const error = new Error('BO pendente nao encontrado ou ja processado.');
      error.statusCode = 404;
      throw error;
    }

    const { delivery, ...expectedCase } = result;
    const isMockedDelivery = Boolean(delivery && delivery.mocked);

    res.status(200).json({
      success: true,
      message: isMockedDelivery
        ? `Modo simulacao: mensagem nao enviada ao WhatsApp. BO ${expectedCase.boNumber || expectedCaseId} encaminhado para indiciamento.`
        : `Mensagem enviada e BO ${expectedCase.boNumber || expectedCaseId} encaminhado para indiciamento.`,
      expectedCase,
      delivery
    });
  } catch (error) {
    next(error);
  }
}

async function getAgendaCalendar(req, res, next) {
  try {
    const result = await adminDashboardService.getAgendaCalendar(req.query.month);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function getAgendaAvailability(req, res, next) {
  try {
    const result = await schedulingService.listAvailability(req.query.date);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function createAgendaAvailability(req, res, next) {
  try {
    const result = await schedulingService.generateAvailability(req.body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

async function getAgendaSettings(req, res, next) {
  try {
    const result = await schedulingService.getSchedulingSettings();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function updateAgendaSettings(req, res, next) {
  try {
    const result = await schedulingService.updateSchedulingSettings(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function getInvolvedPeople(req, res, next) {
  try {
    const result = await adminDashboardService.getInvolvedPeopleList();
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

async function getNotifications(req, res, next) {
  try {
    const result = await adminDashboardService.getNotificationsList();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function getImportHistory(req, res, next) {
  try {
    const result = await adminDashboardService.getImportHistory();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function deleteUser(req, res, next) {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      const error = new Error('ID de usuario invalido.');
      error.statusCode = 400;
      throw error;
    }

    const result = await adminDashboardService.deleteUser(userId);
    if (!result) {
      const error = new Error('Usuario nao encontrado ou ja excluido.');
      error.statusCode = 404;
      throw error;
    }

    res.status(200).json({ success: true, userId: result.id });
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
  getProcessingCases,
  downloadImportedFile,
  indictPendingCase,
  getAgendaCalendar,
  getAgendaAvailability,
  createAgendaAvailability,
  getAgendaSettings,
  updateAgendaSettings,
  getInvolvedPeople,
  getPendingRegistrationRequests,
  approveRegistrationRequest,
  getNotifications,
  getUsers,
  getImportHistory,
  deleteUser
};
