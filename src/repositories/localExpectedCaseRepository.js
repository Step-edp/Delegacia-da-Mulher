const fs = require('fs/promises');
const path = require('path');

const STORE_PATH = path.resolve(process.cwd(), 'database', 'dev-data', 'local-expected-cases.json');
const EXPECTED_CASE_TEXT_LIMIT = 200;

function clampExpectedCaseText(value) {
  const normalized = value == null ? '' : String(value).trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, EXPECTED_CASE_TEXT_LIMIT).trim() || null;
}

function createDefaultStore() {
  return {
    lastExpectedCaseId: 0,
    expectedCases: []
  };
}

async function ensureStoreFile() {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });

  try {
    await fs.access(STORE_PATH);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }

    await fs.writeFile(STORE_PATH, JSON.stringify(createDefaultStore(), null, 2), 'utf8');
  }
}

async function readStore() {
  await ensureStoreFile();

  const raw = await fs.readFile(STORE_PATH, 'utf8');
  if (!raw.trim()) {
    return createDefaultStore();
  }

  const parsed = JSON.parse(raw);
  const expectedCases = ensureExpectedCasesExtractionOrder(
    Array.isArray(parsed.expectedCases) ? parsed.expectedCases : []
  );

  if (JSON.stringify(Array.isArray(parsed.expectedCases) ? parsed.expectedCases : []) !== JSON.stringify(expectedCases)) {
    await writeStore({
      lastExpectedCaseId: Number(parsed.lastExpectedCaseId) || 0,
      expectedCases
    });
  }

  return {
    lastExpectedCaseId: Number(parsed.lastExpectedCaseId) || 0,
    expectedCases
  };
}

async function writeStore(store) {
  await ensureStoreFile();
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function normalizeBoNumber(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function normalizeComparableBoNumber(value) {
  let normalized = normalizeBoNumber(value).replace(/[^A-Z0-9]/g, '');
  
  // Remove common prefixes like "BO", "BOLETIM", "RDO", etc.
  normalized = normalized
    .replace(/^BO(?=[A-Z0-9])/, '')
    .replace(/^RDO(?=[A-Z0-9])/, '')
    .replace(/^BOLETIM(?=[A-Z0-9])/, '');
  
  return normalized;
}

function pickExistingOrIncoming(existingValue, incomingValue) {
  const existing = existingValue == null ? '' : String(existingValue).trim();
  if (existing) {
    return existingValue;
  }

  return incomingValue;
}

function normalizeExpectedCaseRecord(expectedCase) {
  return {
    id: Number(expectedCase.id),
    dailyImportId: Number(expectedCase.dailyImportId) || 0,
    extractionOrder: Number(expectedCase.extractionOrder) || 0,
    status: String(expectedCase.status || 'PENDENTE').trim().toUpperCase(),
    boNumber: normalizeBoNumber(expectedCase.boNumber),
    flagrante: expectedCase.flagrante == null ? null : String(expectedCase.flagrante).trim(),
    natureza: clampExpectedCaseText(expectedCase.natureza),
    victimName: clampExpectedCaseText(expectedCase.victimName),
    authorName: clampExpectedCaseText(expectedCase.authorName),
    local: expectedCase.local == null ? null : String(expectedCase.local).trim(),
    victimCpf: expectedCase.victimCpf == null ? null : String(expectedCase.victimCpf).trim(),
    authorCpf: expectedCase.authorCpf == null ? null : String(expectedCase.authorCpf).trim(),
    victimPhone: expectedCase.victimPhone == null ? null : String(expectedCase.victimPhone).trim(),
    authorPhone: expectedCase.authorPhone == null ? null : String(expectedCase.authorPhone).trim(),
    witnessName: clampExpectedCaseText(expectedCase.witnessName),
    witnessCpf: expectedCase.witnessCpf == null ? null : String(expectedCase.witnessCpf).trim(),
    witnesses: Array.isArray(expectedCase.witnesses)
      ? expectedCase.witnesses.map((item) => clampExpectedCaseText(item)).filter(Boolean)
      : [],
    sourceName: expectedCase.sourceName == null ? null : String(expectedCase.sourceName).trim(),
    savedName: expectedCase.savedName == null ? null : String(expectedCase.savedName).trim(),
    savedPath: expectedCase.savedPath == null ? null : String(expectedCase.savedPath).trim(),
    periodStart: expectedCase.periodStart || null,
    periodEnd: expectedCase.periodEnd || null,
    createdAt: expectedCase.createdAt || null,
    updatedAt: expectedCase.updatedAt || null
  };
}

function toPendingExpectedCaseItem(expectedCase) {
  return {
    id: expectedCase.id,
    boNumber: expectedCase.boNumber,
    flagrante: expectedCase.flagrante,
    natureza: expectedCase.natureza,
    victimName: expectedCase.victimName,
    authorName: expectedCase.authorName,
    victimPhone: expectedCase.victimPhone,
    authorPhone: expectedCase.authorPhone,
    local: expectedCase.local,
    status: expectedCase.status,
    extractionOrder: expectedCase.extractionOrder,
    sourceName: expectedCase.sourceName,
    savedName: expectedCase.savedName,
    createdAt: expectedCase.createdAt
  };
}

function toTimestamp(value) {
  const dateValue = new Date(value || 0).getTime();
  return Number.isFinite(dateValue) ? dateValue : 0;
}

function buildExpectedCaseImportKey(expectedCase) {
  return [
    Number(expectedCase.dailyImportId) || 0,
    expectedCase.periodStart || '',
    expectedCase.periodEnd || '',
    expectedCase.sourceName || ''
  ].join('|');
}

function ensureExpectedCasesExtractionOrder(expectedCases) {
  const items = Array.isArray(expectedCases)
    ? expectedCases.map((item) => normalizeExpectedCaseRecord(item))
    : [];

  const groups = new Map();
  for (const item of items) {
    const key = buildExpectedCaseImportKey(item);
    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(item);
  }

  const normalizedById = new Map();
  for (const groupItems of groups.values()) {
    groupItems
      .sort((left, right) => Number(left.id) - Number(right.id))
      .forEach((item, index) => {
        normalizedById.set(Number(item.id), {
          ...item,
          extractionOrder: index + 1
        });
      });
  }

  return items.map((item) => normalizedById.get(Number(item.id)) || item);
}

function sortByNewest(left, right) {
  const leftDate = new Date(left.updatedAt || left.createdAt || 0).getTime();
  const rightDate = new Date(right.updatedAt || right.createdAt || 0).getTime();
  return rightDate - leftDate;
}

function sortByPendingBookOrder(left, right) {
  const leftImportId = Number(left.dailyImportId) || 0;
  const rightImportId = Number(right.dailyImportId) || 0;

  if (leftImportId !== rightImportId) {
    return rightImportId - leftImportId;
  }

  const leftImportMoment = Math.max(toTimestamp(left.periodStart), toTimestamp(left.createdAt));
  const rightImportMoment = Math.max(toTimestamp(right.periodStart), toTimestamp(right.createdAt));

  if (leftImportMoment !== rightImportMoment) {
    return rightImportMoment - leftImportMoment;
  }

  const leftOrder = Number(left.extractionOrder) || Number(left.id) || 0;
  const rightOrder = Number(right.extractionOrder) || Number(right.id) || 0;

  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return Number(left.id) - Number(right.id);
}

function toImportHistoryItem(item) {
  return {
    id: item.id,
    sourceName: item.sourceName,
    savedName: item.savedName || null,
    savedPath: item.savedPath || null,
    periodStart: item.periodStart,
    periodEnd: item.periodEnd,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

async function createPendingExpectedCases({ sourceName, periodStart, periodEnd, boEntries }) {
  const store = await readStore();
  const now = new Date().toISOString();
  const createdOrUpdated = [];
  const processedBoNumbers = new Set();

  for (const [index, boEntry] of Array.from(Array.isArray(boEntries) ? boEntries : []).entries()) {
    const boNumber = normalizeBoNumber(boEntry && boEntry.boNumber);
    if (!boNumber || processedBoNumbers.has(boNumber)) {
      continue;
    }

    processedBoNumbers.add(boNumber);

    const existingExpectedCase = store.expectedCases.find((expectedCase) => normalizeBoNumber(expectedCase.boNumber) === boNumber);

    if (existingExpectedCase) {
      Object.assign(
        existingExpectedCase,
        normalizeExpectedCaseRecord({
          ...existingExpectedCase,
          status: existingExpectedCase.status || 'PENDENTE',
          boNumber,
          flagrante: pickExistingOrIncoming(existingExpectedCase.flagrante, boEntry.flagrante),
          natureza: pickExistingOrIncoming(existingExpectedCase.natureza, boEntry.natureza),
          victimName: pickExistingOrIncoming(existingExpectedCase.victimName, boEntry.victim),
          authorName: pickExistingOrIncoming(existingExpectedCase.authorName, boEntry.author),
          witnessName: pickExistingOrIncoming(existingExpectedCase.witnessName, boEntry.witness),
          local: pickExistingOrIncoming(existingExpectedCase.local, boEntry.local),
          victimCpf: pickExistingOrIncoming(existingExpectedCase.victimCpf, boEntry.victimCpf),
          authorCpf: pickExistingOrIncoming(existingExpectedCase.authorCpf, boEntry.authorCpf),
          witnessCpf: pickExistingOrIncoming(existingExpectedCase.witnessCpf, boEntry.witnessCpf),
          sourceName: pickExistingOrIncoming(existingExpectedCase.sourceName, sourceName),
          savedName: pickExistingOrIncoming(existingExpectedCase.savedName, boEntry.savedName),
          savedPath: pickExistingOrIncoming(existingExpectedCase.savedPath, boEntry.savedPath),
          periodStart: pickExistingOrIncoming(existingExpectedCase.periodStart, periodStart),
          periodEnd: pickExistingOrIncoming(existingExpectedCase.periodEnd, periodEnd),
          extractionOrder: index + 1,
          createdAt: existingExpectedCase.createdAt || now,
          updatedAt: now
        })
      );

      createdOrUpdated.push(toPendingExpectedCaseItem(existingExpectedCase));
      continue;
    }

    const nextId = store.lastExpectedCaseId + 1;
    const newExpectedCase = normalizeExpectedCaseRecord({
      id: nextId,
      dailyImportId: 0,
      status: 'PENDENTE',
      boNumber,
      flagrante: boEntry.flagrante,
      natureza: boEntry.natureza,
      victimName: boEntry.victim,
      authorName: boEntry.author,
      witnessName: boEntry.witness,
      local: boEntry.local,
      victimCpf: boEntry.victimCpf,
      authorCpf: boEntry.authorCpf,
      witnessCpf: boEntry.witnessCpf,
      sourceName,
      savedName: boEntry.savedName,
      savedPath: boEntry.savedPath,
      periodStart,
      periodEnd,
      extractionOrder: index + 1,
      createdAt: now,
      updatedAt: now
    });

    store.lastExpectedCaseId = nextId;
    store.expectedCases.push(newExpectedCase);
    createdOrUpdated.push(toPendingExpectedCaseItem(newExpectedCase));
  }

  await writeStore(store);

  return createdOrUpdated.sort(sortByPendingBookOrder);
}

async function listPendingExpectedCases() {
  const store = await readStore();
  const items = store.expectedCases
    .map(normalizeExpectedCaseRecord)
    .filter((expectedCase) => expectedCase.status === 'PENDENTE' && expectedCase.boNumber)
    .sort(sortByPendingBookOrder)
    .map(toPendingExpectedCaseItem);

  return {
    total: items.length,
    items
  };
}

async function countPendingExpectedCases() {
  const result = await listPendingExpectedCases();
  return result.total;
}

async function listProcessingExpectedCases() {
  const store = await readStore();
  const items = store.expectedCases
    .map(normalizeExpectedCaseRecord)
    .filter((expectedCase) => expectedCase.status === 'PROCESSANDO' && expectedCase.boNumber)
    .sort(sortByPendingBookOrder)
    .map(toPendingExpectedCaseItem);

  return {
    total: items.length,
    items
  };
}

async function countProcessingExpectedCases() {
  const result = await listProcessingExpectedCases();
  return result.total;
}

async function listInvolvedPeopleSource() {
  const store = await readStore();
  const items = store.expectedCases
    .map(normalizeExpectedCaseRecord)
    .filter((expectedCase) => expectedCase.boNumber)
    .sort(sortByNewest)
    .map((expectedCase) => ({
      id: expectedCase.id,
      boNumber: expectedCase.boNumber,
      natureza: expectedCase.natureza,
      victimName: expectedCase.victimName,
      authorName: expectedCase.authorName,
      victimCpf: expectedCase.victimCpf,
      authorCpf: expectedCase.authorCpf,
      witnessName: expectedCase.witnessName,
      witnessCpf: expectedCase.witnessCpf,
      witnesses: expectedCase.witnesses,
      createdAt: expectedCase.createdAt,
      updatedAt: expectedCase.updatedAt
    }));

  return {
    total: items.length,
    items
  };
}

async function listImportHistory(limit = 30) {
  const store = await readStore();
  const importMap = new Map();

  for (const record of store.expectedCases.map(normalizeExpectedCaseRecord)) {
    if (!record.periodStart || !record.periodEnd) {
      continue;
    }

    const key = [record.sourceName || '', record.periodStart, record.periodEnd].join('|');
    const existingItem = importMap.get(key);
    const nextItem = {
      id: key,
      sourceName: record.sourceName || null,
      savedName: record.savedName || null,
      savedPath: record.savedPath || null,
      periodStart: record.periodStart,
      periodEnd: record.periodEnd,
      createdAt: existingItem && existingItem.createdAt
        ? existingItem.createdAt
        : (record.createdAt || record.updatedAt || null),
      updatedAt: record.updatedAt || record.createdAt || null
    };

    if (!existingItem) {
      importMap.set(key, nextItem);
      continue;
    }

    const existingUpdatedMs = new Date(existingItem.updatedAt || existingItem.createdAt || 0).getTime();
    const nextUpdatedMs = new Date(nextItem.updatedAt || nextItem.createdAt || 0).getTime();

    if (nextUpdatedMs >= existingUpdatedMs) {
      importMap.set(key, {
        ...existingItem,
        ...nextItem,
        createdAt: existingItem.createdAt || nextItem.createdAt
      });
    }
  }

  const safeLimit = Number.isInteger(Number(limit)) && Number(limit) > 0
    ? Number(limit)
    : 30;

  const items = [...importMap.values()]
    .sort(sortByNewest)
    .slice(0, safeLimit)
    .map(toImportHistoryItem);

  return {
    total: importMap.size,
    items
  };
}

async function findPendingExpectedCaseByBoNumber(boNumber) {
  const normalizedBoNumber = normalizeComparableBoNumber(boNumber);
  const store = await readStore();
  const expectedCase = store.expectedCases
    .map(normalizeExpectedCaseRecord)
    .find((item) => item.status === 'PENDENTE' && normalizeComparableBoNumber(item.boNumber) === normalizedBoNumber);

  return expectedCase ? toPendingExpectedCaseItem(expectedCase) : null;
}

async function findPendingExpectedCaseById(expectedCaseId) {
  const store = await readStore();
  const expectedCase = store.expectedCases
    .map(normalizeExpectedCaseRecord)
    .find((item) => item.status === 'PENDENTE' && Number(item.id) === Number(expectedCaseId));

  return expectedCase ? toPendingExpectedCaseItem(expectedCase) : null;
}

async function findVictimAttendanceContextByBoNumber(boNumber) {
  const normalizedBoNumber = normalizeComparableBoNumber(boNumber);
  const store = await readStore();
  const expectedCase = store.expectedCases
    .map(normalizeExpectedCaseRecord)
    .find((item) => normalizeComparableBoNumber(item.boNumber) === normalizedBoNumber);

  if (!expectedCase) {
    return null;
  }

  return {
    boNumber: expectedCase.boNumber,
    natureza: expectedCase.natureza,
    victimName: expectedCase.victimName,
    victimCpf: expectedCase.victimCpf,
    victimPhone: expectedCase.victimPhone,
    victimEmail: null
  };
}

async function markPendingCaseAsProcessing(expectedCaseId) {
  const store = await readStore();
  const expectedCase = store.expectedCases.find((item) => Number(item.id) === Number(expectedCaseId));

  if (!expectedCase || String(expectedCase.status || '').toUpperCase() !== 'PENDENTE') {
    return null;
  }

  const now = new Date().toISOString();
  expectedCase.status = 'PROCESSANDO';
  expectedCase.updatedAt = now;

  await writeStore(store);

  return {
    id: expectedCase.id,
    boNumber: expectedCase.boNumber,
    natureza: expectedCase.natureza,
    victimName: expectedCase.victimName,
    authorName: expectedCase.authorName,
    status: expectedCase.status,
    createdAt: expectedCase.createdAt || null,
    updatedAt: expectedCase.updatedAt
  };
}

async function linkPairToExpectedCase({ expectedCaseId, boFile, extratoFile, boData, extratoData, manualPhones }) {
  const store = await readStore();
  const expectedCase = store.expectedCases.find((item) => Number(item.id) === Number(expectedCaseId));

  if (!expectedCase || String(expectedCase.status || '').toUpperCase() !== 'PENDENTE') {
    const error = new Error('Caso esperado nao esta mais com status PENDENTE.');
    error.statusCode = 409;
    throw error;
  }

  const now = new Date().toISOString();
  expectedCase.status = 'PROCESSANDO';
  expectedCase.updatedAt = now;
  expectedCase.victimPhone = manualPhones && manualPhones.victimWhatsapp ? manualPhones.victimWhatsapp : (expectedCase.victimPhone || null);
  expectedCase.authorPhone = manualPhones && manualPhones.authorWhatsapp ? manualPhones.authorWhatsapp : (expectedCase.authorPhone || null);
  expectedCase.pairLink = {
    boFileName: boFile.originalname,
    boFilePath: boFile.path,
    extratoFileName: extratoFile.originalname,
    extratoFilePath: extratoFile.path,
    extractedBoData: boData,
    extractedExtratoData: extratoData,
    manualPhones: manualPhones || null,
    createdAt: now
  };

  await writeStore(store);

  return {
    expectedCase: {
      id: expectedCase.id,
      status: expectedCase.status,
      boNumber: expectedCase.boNumber,
      natureza: expectedCase.natureza,
      victimName: expectedCase.victimName,
      authorName: expectedCase.authorName
    },
    pair: {
      id: `local-${expectedCase.id}`,
      expectedCaseId: expectedCase.id,
      boFileName: boFile.originalname,
      boFilePath: boFile.path,
      extratoFileName: extratoFile.originalname,
      extratoFilePath: extratoFile.path,
      createdAt: now,
      mocked: true
    }
  };
}

module.exports = {
  createPendingExpectedCases,
  listPendingExpectedCases,
  countPendingExpectedCases,
  listProcessingExpectedCases,
  countProcessingExpectedCases,
  listImportHistory,
  listInvolvedPeopleSource,
  findPendingExpectedCaseByBoNumber,
  findPendingExpectedCaseById,
  findVictimAttendanceContextByBoNumber,
  markPendingCaseAsProcessing,
  linkPairToExpectedCase
};