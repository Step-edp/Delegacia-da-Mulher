const summonsEventsService = require('../services/summonsEventsService');

function parseSummonsId(req, res) {
  const summonsId = Number(req.params.summonsId);
  if (!Number.isInteger(summonsId) || summonsId <= 0) {
    res.status(400).json({ error: 'summonsId invalido.' });
    return null;
  }
  return summonsId;
}

async function recordLinkClicked(req, res, next) {
  try {
    const summonsId = parseSummonsId(req, res);
    if (!summonsId) {
      return;
    }

    await summonsEventsService.recordLinkClicked({
      summonsId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || null
    });

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
}

async function recordScheduleButtonClicked(req, res, next) {
  try {
    const summonsId = parseSummonsId(req, res);
    if (!summonsId) {
      return;
    }

    await summonsEventsService.recordScheduleButtonClicked({
      summonsId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || null
    });

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
}

async function recordScheduled(req, res, next) {
  try {
    const summonsId = parseSummonsId(req, res);
    if (!summonsId) {
      return;
    }

    await summonsEventsService.recordScheduled({
      summonsId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || null
    });

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
}

async function recordRefusal(req, res, next) {
  try {
    const summonsId = parseSummonsId(req, res);
    if (!summonsId) {
      return;
    }

    await summonsEventsService.recordRefusal({
      summonsId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || null
    });

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
}

async function getHistoryByCaseId(req, res, next) {
  try {
    const caseId = Number(req.params.caseId);
    if (!Number.isInteger(caseId) || caseId <= 0) {
      res.status(400).json({ error: 'caseId invalido.' });
      return;
    }

    const result = await summonsEventsService.getHistoryByCaseId(caseId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function getHistoryByBoNumber(req, res, next) {
  try {
    const boNumber = String(req.query.bo || '').trim();
    if (!boNumber) {
      res.status(400).json({ error: 'Numero de BO invalido.' });
      return;
    }

    const result = await summonsEventsService.getHistoryByBoNumber(boNumber);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function downloadCertificate(req, res, next) {
  try {
    const caseId = Number(req.params.caseId);
    if (!Number.isInteger(caseId) || caseId <= 0) {
      res.status(400).json({ error: 'caseId invalido.' });
      return;
    }

    const result = await summonsEventsService.generateCertificatePdf({
      caseId,
      userId: req.auth && req.auth.userId,
      userName: req.auth && req.auth.userId ? `admin-${req.auth.userId}` : null
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificado-nao-agendamento-bo-${caseId}.pdf"`);
    res.send(result.pdfBuffer);
  } catch (error) {
    next(error);
  }
}

async function downloadCertificateByBo(req, res, next) {
  try {
    const boNumber = String(req.query.bo || '').trim();
    if (!boNumber) {
      res.status(400).json({ error: 'Numero de BO invalido.' });
      return;
    }

    const result = await summonsEventsService.generateCertificatePdfByBo({
      boNumber,
      userId: req.auth && req.auth.userId,
      userName: req.auth && req.auth.userId ? `admin-${req.auth.userId}` : null
    });

    const safeBo = boNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificado-nao-agendamento-bo-${safeBo}.pdf"`);
    res.send(result.pdfBuffer);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  recordLinkClicked,
  recordScheduleButtonClicked,
  recordScheduled,
  recordRefusal,
  getHistoryByCaseId,
  getHistoryByBoNumber,
  downloadCertificate,
  downloadCertificateByBo
};
