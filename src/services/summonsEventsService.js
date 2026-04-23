const summonsEventsRepository = require('../repositories/summonsEventsRepository');
const summonsRepository = require('../repositories/summonsRepository');
const PDFDocument = require('pdfkit');

const EVENT_LABELS = {
  link_clicked: 'Usuário clicou no link',
  schedule_button_clicked: 'Usuário clicou no botão de agendar',
  scheduled: 'Usuário agendou',
  refusal_clicked: 'Usuário clicou no botão de recusa',
  no_action_timeout: 'Usuário não agendou dentro do prazo',
  attempt_sent: 'Intimação enviada',
  certificate_downloaded: 'Certificado de não agendamento baixado'
};

function formatEventLabel(eventType, metadata) {
  const base = EVENT_LABELS[eventType] || eventType;
  if (metadata && metadata.attemptNumber) {
    return `${base} (tentativa ${metadata.attemptNumber})`;
  }
  return base;
}

async function recordLinkClicked({ summonsId, ipAddress, userAgent }) {
  return summonsEventsRepository.recordEvent({
    summonsId,
    eventType: 'link_clicked',
    ipAddress,
    userAgent
  });
}

async function recordScheduleButtonClicked({ summonsId, ipAddress, userAgent }) {
  return summonsEventsRepository.recordEvent({
    summonsId,
    eventType: 'schedule_button_clicked',
    ipAddress,
    userAgent
  });
}

async function recordScheduled({ summonsId, ipAddress, userAgent, appointmentId }) {
  await summonsEventsRepository.recordEvent({
    summonsId,
    eventType: 'scheduled',
    ipAddress,
    userAgent,
    metadata: appointmentId ? { appointmentId } : null
  });

  // Marca intimação como recebida
  const pool = require('../config/database');
  await pool.query(
    `UPDATE summons SET status = 'received', updated_at = NOW() WHERE id = $1`,
    [summonsId]
  );
}

async function recordRefusal({ summonsId, ipAddress, userAgent }) {
  await summonsEventsRepository.recordEvent({
    summonsId,
    eventType: 'refusal_clicked',
    ipAddress,
    userAgent
  });

  // Recusa também conta como intimação recebida
  const pool = require('../config/database');
  await pool.query(
    `UPDATE summons SET status = 'received', updated_at = NOW() WHERE id = $1`,
    [summonsId]
  );
}

async function recordNoActionTimeout({ summonsId, attemptNumber }) {
  return summonsEventsRepository.recordEvent({
    summonsId,
    eventType: 'no_action_timeout',
    metadata: { attemptNumber }
  });
}

async function recordAttemptSent({ summonsId, attemptNumber }) {
  return summonsEventsRepository.recordEvent({
    summonsId,
    eventType: 'attempt_sent',
    metadata: { attemptNumber }
  });
}

async function recordCertificateDownloaded({ summonsId, userId, userName }) {
  return summonsEventsRepository.recordEvent({
    summonsId,
    eventType: 'certificate_downloaded',
    userId,
    metadata: { downloadedBy: userName }
  });
}

async function getHistoryByCaseId(caseId) {
  const [events, summonsList] = await Promise.all([
    summonsEventsRepository.findEventsByCaseId(caseId),
    summonsEventsRepository.findSummonsWithEventsByCaseId(caseId)
  ]);

  return {
    summons: summonsList,
    events: events.map((e) => ({
      ...e,
      label: formatEventLabel(e.eventType, e.metadata)
    }))
  };
}

async function getHistoryByBoNumber(boNumber) {
  const normalizedBo = String(boNumber || '').trim();
  if (!normalizedBo) {
    const error = new Error('Numero de BO invalido.');
    error.statusCode = 400;
    throw error;
  }

  const caseId = await summonsEventsRepository.findCaseIdByBoNumber(normalizedBo);
  if (!caseId) {
    const error = new Error('BO nao encontrado.');
    error.statusCode = 404;
    throw error;
  }

  const history = await getHistoryByCaseId(caseId);
  return {
    boNumber: normalizedBo,
    caseId,
    ...history
  };
}

async function getHistoryBySummonsId(summonsId) {
  const events = await summonsEventsRepository.findEventsBySummonsId(summonsId);
  return events.map((e) => ({
    ...e,
    label: formatEventLabel(e.eventType, e.metadata)
  }));
}

async function countCertificatesDownloaded() {
  return summonsEventsRepository.countCertificatesDownloaded();
}

async function generateCertificatePdf({ caseId, userId, userName }) {
  const { summons, events } = await getHistoryByCaseId(caseId);

  // Registrar download do certificado em cada intimação do caso
  await Promise.all(
    summons.map((s) =>
      summonsEventsRepository.recordEvent({
        summonsId: s.id,
        eventType: 'certificate_downloaded',
        userId: userId || null,
        metadata: { downloadedBy: userName || null }
      })
    )
  );

  // Atualizar contador no localStorage será feito pelo frontend
  const pdfBuffer = await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 60 });
    const buffers = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    // Cabeçalho
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('CERTIFICADO DE NÃO AGENDAMENTO', { align: 'center' })
      .moveDown(0.5);

    doc
      .fontSize(11)
      .font('Helvetica')
      .text('Delegacia de Defesa da Mulher', { align: 'center' })
      .moveDown(1.5);

    doc
      .fontSize(10)
      .font('Helvetica')
      .text(`Emitido em: ${now}`, { align: 'right' });

    if (userName) {
      doc.text(`Emitido por: ${userName}`, { align: 'right' });
    }
    doc.moveDown(1);

    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .text(`Caso ID: ${caseId}`)
      .moveDown(0.5);

    // Intimações
    if (summons.length > 0) {
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('Intimações realizadas:')
        .moveDown(0.3);

      summons.forEach((s) => {
        doc
          .fontSize(10)
          .font('Helvetica')
          .text(`• ${s.personName} (${s.personType}) — Tentativa ${s.attemptNumber} — Status: ${s.status}`)
          .moveDown(0.1);
      });
    }

    doc.moveDown(1);

    // Histórico de eventos
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .text('Histórico de eventos:')
      .moveDown(0.3);

    if (events.length === 0) {
      doc.fontSize(10).font('Helvetica').text('Nenhum evento registrado.');
    } else {
      events.forEach((e) => {
        const dateStr = new Date(e.occurredAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        doc
          .fontSize(10)
          .font('Helvetica')
          .text(`[${dateStr}] ${e.label}${e.personName ? ` — ${e.personName}` : ''}`)
          .moveDown(0.1);
      });
    }

    doc.moveDown(2);

    doc
      .fontSize(9)
      .font('Helvetica')
      .text(
        'Este documento foi gerado automaticamente pelo sistema da Delegacia de Defesa da Mulher e certifica as tentativas de intimação realizadas e os eventos registrados no sistema.',
        { align: 'center', color: '#666666' }
      );

    doc.end();
  });

  return { pdfBuffer };
}

async function generateCertificatePdfByBo({ boNumber, userId, userName }) {
  const normalizedBo = String(boNumber || '').trim();
  if (!normalizedBo) {
    const error = new Error('Numero de BO invalido.');
    error.statusCode = 400;
    throw error;
  }

  const caseId = await summonsEventsRepository.findCaseIdByBoNumber(normalizedBo);
  if (!caseId) {
    const error = new Error('BO nao encontrado.');
    error.statusCode = 404;
    throw error;
  }

  return generateCertificatePdf({ caseId, userId, userName });
}

module.exports = {
  recordLinkClicked,
  recordScheduleButtonClicked,
  recordScheduled,
  recordRefusal,
  recordNoActionTimeout,
  recordAttemptSent,
  recordCertificateDownloaded,
  getHistoryByCaseId,
  getHistoryByBoNumber,
  getHistoryBySummonsId,
  countCertificatesDownloaded,
  generateCertificatePdf,
  generateCertificatePdfByBo
};
