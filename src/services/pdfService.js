const fs = require('fs/promises');
const pdfParse = require('pdf-parse');
const { extractPeriodFromText } = require('../utils/periodExtractor');
const { parseBoBookContent, parseBoBookEntries } = require('../utils/boBookParser');
const dailyImportRepository = require('../repositories/dailyImportRepository');
const expectedCaseRepository = require('../repositories/expectedCaseRepository');
const localExpectedCaseRepository = require('../repositories/localExpectedCaseRepository');
const env = require('../config/env');

function isDbUnavailableError(error) {
  const code = String(error && error.code ? error.code : '').toUpperCase();
  return code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT';
}

async function extractTextFromPdfFile(filePath) {
  const fileBuffer = await fs.readFile(filePath);
  const data = await pdfParse(fileBuffer);
  return data.text || '';
}

function validatePeriodContinuity(period, lastImport) {
  if (!lastImport) {
    return;
  }

  const currentStartMs = period.start.getTime();
  const lastEndMs = new Date(lastImport.periodEnd).getTime();

  if (Number.isNaN(currentStartMs) || Number.isNaN(lastEndMs)) {
    const error = new Error('Nao foi possivel validar o periodo com o ultimo importado.');
    error.statusCode = 500;
    throw error;
  }

  if (currentStartMs < lastEndMs) {
    const error = new Error(
      `Duplicidade detectada: o novo periodo inicia antes do fim do ultimo importado (${new Date(lastImport.periodEnd).toISOString()}).`
    );
    error.statusCode = 409;
    throw error;
  }

  if (currentStartMs > lastEndMs) {
    const error = new Error(
      `Lacuna detectada: o novo periodo inicia apos o fim do ultimo importado (${new Date(lastImport.periodEnd).toISOString()}).`
    );
    error.statusCode = 409;
    throw error;
  }
}

async function buildLocalExpectedCasesFallback({ file, period, boEntries }) {
  try {
    return await localExpectedCaseRepository.createPendingExpectedCases({
      sourceName: file.originalname,
      periodStart: period.start.toISOString(),
      periodEnd: period.end.toISOString(),
      boEntries
    });
  } catch (error) {
    return boEntries.map((entry, index) => ({
      id: index + 1,
      status: 'PENDENTE',
      boNumber: entry.boNumber || null,
      flagrante: entry.flagrante || null,
      natureza: entry.natureza || null,
      victimName: entry.victim || null,
      authorName: entry.author || null,
      local: entry.local || null,
      mocked: true
    }));
  }
}

async function processPdfUpload(file) {
  if (!file) {
    const error = new Error('Arquivo PDF nao enviado.');
    error.statusCode = 400;
    throw error;
  }

  const text = await extractTextFromPdfFile(file.path);
  const period = extractPeriodFromText(text);
  const boEntries = parseBoBookEntries(text);
  const boBook = boEntries[0] || parseBoBookContent(text);
  let lastImport = null;
  let createdImport = null;
  let expectedCases = [];
  let persistenceMode = 'database';

  try {
    lastImport = await dailyImportRepository.getLastImportedPeriod();
    validatePeriodContinuity(period, lastImport);

    createdImport = await dailyImportRepository.createImportWithPeriod({
      sourceName: file.originalname,
      periodStart: period.start,
      periodEnd: period.end,
      notes: 'Importacao registrada automaticamente via upload de PDF.'
    });

    expectedCases = await Promise.all(
      boEntries.map((entry) =>
        expectedCaseRepository.createExpectedCaseFromBo({
          dailyImportId: createdImport.id,
          periodStart: period.start,
          boBook: entry
        })
      )
    );
  } catch (error) {
    if (env.auth.devMode && isDbUnavailableError(error)) {
      persistenceMode = 'mocked_without_database';
      lastImport = null;
      createdImport = {
        id: 0,
        importDate: period.start.toISOString().slice(0, 10),
        sourceName: file.originalname,
        periodStart: period.start.toISOString(),
        periodEnd: period.end.toISOString(),
        createdAt: new Date().toISOString(),
        mocked: true
      };
      expectedCases = await buildLocalExpectedCasesFallback({ file, period, boEntries });
    } else if (isDbUnavailableError(error)) {
      const unavailableError = new Error('Banco de dados indisponivel no momento. Tente novamente em instantes.');
      unavailableError.statusCode = 503;
      throw unavailableError;
    } else {
      throw error;
    }
  }

  return {
    file: {
      originalName: file.originalname,
      savedName: file.filename,
      savedPath: file.path,
      size: file.size
    },
    period,
    importValidation: {
      status: lastImport ? 'validated' : 'first_import',
      lastImportedPeriod: lastImport
        ? {
            id: lastImport.id,
            start: new Date(lastImport.periodStart).toISOString(),
            end: new Date(lastImport.periodEnd).toISOString()
          }
        : null
    },
    persistenceMode,
    dailyImport: createdImport,
    boBook,
    boEntries,
    totalBosExtracted: boEntries.length,
    pendingToAttachFiles: expectedCases.length,
    expectedCases,
    extractedTextPreview: text.slice(0, 1200)
  };
}

module.exports = {
  processPdfUpload
};
