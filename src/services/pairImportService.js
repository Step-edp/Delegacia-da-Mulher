const fs = require('fs/promises');
const pdfParse = require('pdf-parse');
const env = require('../config/env');
const { parseBoBookContent } = require('../utils/boBookParser');
const { parseExtratoContent } = require('../utils/extratoParser');
const pairImportRepository = require('../repositories/pairImportRepository');
const localExpectedCaseRepository = require('../repositories/localExpectedCaseRepository');
const personService = require('./personService');

async function extractTextFromPdfFile(filePath) {
  const fileBuffer = await fs.readFile(filePath);
  const data = await pdfParse(fileBuffer);
  return data.text || '';
}

function validatePairFiles(files) {
  const boFiles = files && files.bo;
  const extratoFiles = files && files.extrato;

  if (!boFiles || !boFiles.length || !extratoFiles || !extratoFiles.length) {
    const error = new Error('Envie os dois PDFs: campo bo e campo extrato.');
    error.statusCode = 400;
    throw error;
  }

  return {
    boFile: boFiles[0],
    extratoFile: extratoFiles[0]
  };
}

function normalizeComparableBoNumber(value) {
  let normalized = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  // Remove common prefixes like "BO", "BOLETIM", "RDO", etc.
  normalized = normalized
    .replace(/^BO(?=[A-Z0-9])/, '')
    .replace(/^RDO(?=[A-Z0-9])/, '')
    .replace(/^BOLETIM(?=[A-Z0-9])/, '');
  
  return normalized;
}

function resolveTargetBoNumber(boData, extratoData) {
  const boNumberFromBo = String(boData.boNumber || '').trim();
  const boNumberFromExtrato = String(extratoData.boNumber || '').trim();

  const normalizedBoFromBo = normalizeComparableBoNumber(boNumberFromBo);
  const normalizedBoFromExtrato = normalizeComparableBoNumber(boNumberFromExtrato);

  if (normalizedBoFromBo && normalizedBoFromExtrato && normalizedBoFromBo !== normalizedBoFromExtrato) {
    const error = new Error('BO e Extrato possuem numeros de BO diferentes.');
    error.statusCode = 409;
    throw error;
  }

  const boNumber = boNumberFromBo || boNumberFromExtrato;

  if (!boNumber) {
    const error = new Error('Nao foi possivel identificar o numero do BO para vinculo.');
    error.statusCode = 422;
    throw error;
  }

  return boNumber;
}

function normalizeWhatsappPhone(value, label) {
  const digits = String(value || '').replace(/\D/g, '');

  if (!digits) {
    return null;
  }

  if (digits.length < 10 || digits.length > 13) {
    const error = new Error(`WhatsApp da ${label} invalido. Informe entre 10 e 13 digitos.`);
    error.statusCode = 400;
    throw error;
  }

  return digits;
}

function normalizeManualPhones(payload) {
  return {
    victimWhatsapp: normalizeWhatsappPhone(payload && payload.victimWhatsapp, 'vitima'),
    authorWhatsapp: normalizeWhatsappPhone(payload && payload.authorWhatsapp, 'indiciado')
  };
}

async function upsertPeopleFromBoData(boData, manualPhones) {
  const upserted = [];

  if (boData.victimCpf && boData.victim) {
    const victim = await personService.upsertPerson({
      cpf: boData.victimCpf,
      fullName: boData.victim,
      phone: manualPhones.victimWhatsapp
    });
    upserted.push({ role: 'VITIMA', person: victim });
  }

  if (boData.authorCpf && boData.author) {
    const author = await personService.upsertPerson({
      cpf: boData.authorCpf,
      fullName: boData.author,
      phone: manualPhones.authorWhatsapp
    });
    upserted.push({ role: 'AUTOR', person: author });
  }

  if (boData.witnessCpf && boData.witness) {
    const witness = await personService.upsertPerson({
      cpf: boData.witnessCpf,
      fullName: boData.witness
    });
    upserted.push({ role: 'TESTEMUNHA', person: witness });
  }

  return upserted;
}

function buildLocalSyncedPeople(boData, manualPhones) {
  const syncedPeople = [];

  if (boData.victimCpf && boData.victim) {
    syncedPeople.push({
      role: 'VITIMA',
      person: {
        id: null,
        fullName: boData.victim,
        cpf: boData.victimCpf,
        phone: manualPhones.victimWhatsapp,
        mocked: true
      }
    });
  }

  if (boData.authorCpf && boData.author) {
    syncedPeople.push({
      role: 'AUTOR',
      person: {
        id: null,
        fullName: boData.author,
        cpf: boData.authorCpf,
        phone: manualPhones.authorWhatsapp,
        mocked: true
      }
    });
  }

  if (boData.witnessCpf && boData.witness) {
    syncedPeople.push({
      role: 'TESTEMUNHA',
      person: {
        id: null,
        fullName: boData.witness,
        cpf: boData.witnessCpf,
        mocked: true
      }
    });
  }

  return syncedPeople;
}

async function importBoAndExtratoPair(files, payload) {
  const { boFile, extratoFile } = validatePairFiles(files);
  const manualPhones = normalizeManualPhones(payload);

  const boText = await extractTextFromPdfFile(boFile.path);
  const extratoText = await extractTextFromPdfFile(extratoFile.path);

  const boData = parseBoBookContent(boText);
  const extratoData = parseExtratoContent(extratoText);
  const boNumber = resolveTargetBoNumber(boData, extratoData);

  if (env.auth.devMode) {
    const syncedPeople = buildLocalSyncedPeople(boData, manualPhones);
    const expectedCase = await localExpectedCaseRepository.findPendingExpectedCaseByBoNumber(boNumber);

    if (!expectedCase) {
      const error = new Error(`Nenhum expected_case PENDENTE encontrado para o BO ${boNumber}.`);
      error.statusCode = 404;
      throw error;
    }

    const linked = await localExpectedCaseRepository.linkPairToExpectedCase({
      expectedCaseId: expectedCase.id,
      boFile,
      extratoFile,
      boData,
      extratoData,
      manualPhones
    });

    return {
      boData,
      extratoData,
      manualPhones,
      syncedPeople,
      matchedExpectedCase: linked.expectedCase,
      pairLink: linked.pair,
      mocked: true
    };
  }

  const syncedPeople = await upsertPeopleFromBoData(boData, manualPhones);
  const expectedCase = await pairImportRepository.findPendingExpectedCaseByBoNumber(boNumber);

  if (!expectedCase) {
    const error = new Error(`Nenhum expected_case PENDENTE encontrado para o BO ${boNumber}.`);
    error.statusCode = 404;
    throw error;
  }

  const linked = await pairImportRepository.linkPairToExpectedCase({
    expectedCaseId: expectedCase.id,
    boFile,
    extratoFile,
    boData,
    extratoData
  });

  return {
    boData,
    extratoData,
    manualPhones,
    syncedPeople,
    matchedExpectedCase: linked.expectedCase,
    pairLink: linked.pair
  };
}

module.exports = {
  importBoAndExtratoPair
};
