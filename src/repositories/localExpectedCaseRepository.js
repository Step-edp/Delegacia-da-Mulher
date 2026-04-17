const fs = require('fs/promises');
const path = require('path');

const STORE_PATH = path.resolve(process.cwd(), 'database', 'dev-data', 'local-expected-cases.json');

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
  return {
    lastExpectedCaseId: Number(parsed.lastExpectedCaseId) || 0,
    expectedCases: Array.isArray(parsed.expectedCases) ? parsed.expectedCases : []
  };
}

async function writeStore(store) {
  await ensureStoreFile();
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function normalizeBoNumber(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function normalizeExpectedCaseRecord(expectedCase) {
  return {
    id: Number(expectedCase.id),
    dailyImportId: Number(expectedCase.dailyImportId) || 0,
    status: String(expectedCase.status || 'PENDENTE').trim().toUpperCase(),
    boNumber: normalizeBoNumber(expectedCase.boNumber),
    flagrante: expectedCase.flagrante == null ? null : String(expectedCase.flagrante).trim(),
    natureza: expectedCase.natureza == null ? null : String(expectedCase.natureza).trim(),
    victimName: expectedCase.victimName == null ? null : String(expectedCase.victimName).trim(),
    authorName: expectedCase.authorName == null ? null : String(expectedCase.authorName).trim(),
    local: expectedCase.local == null ? null : String(expectedCase.local).trim(),
    victimCpf: expectedCase.victimCpf == null ? null : String(expectedCase.victimCpf).trim(),
    authorCpf: expectedCase.authorCpf == null ? null : String(expectedCase.authorCpf).trim(),
    sourceName: expectedCase.sourceName == null ? null : String(expectedCase.sourceName).trim(),
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
    local: expectedCase.local,
    status: expectedCase.status,
    createdAt: expectedCase.createdAt
  };
}

function sortByNewest(left, right) {
  const leftDate = new Date(left.updatedAt || left.createdAt || 0).getTime();
  const rightDate = new Date(right.updatedAt || right.createdAt || 0).getTime();
  return rightDate - leftDate;
}

async function createPendingExpectedCases({ sourceName, periodStart, periodEnd, boEntries }) {
  const store = await readStore();
  const now = new Date().toISOString();
  const createdOrUpdated = [];
  const processedBoNumbers = new Set();

  for (const boEntry of Array.isArray(boEntries) ? boEntries : []) {
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
          status: 'PENDENTE',
          boNumber,
          flagrante: boEntry.flagrante,
          natureza: boEntry.natureza,
          victimName: boEntry.victim,
          authorName: boEntry.author,
          local: boEntry.local,
          victimCpf: boEntry.victimCpf,
          authorCpf: boEntry.authorCpf,
          sourceName,
          periodStart,
          periodEnd,
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
      local: boEntry.local,
      victimCpf: boEntry.victimCpf,
      authorCpf: boEntry.authorCpf,
      sourceName,
      periodStart,
      periodEnd,
      createdAt: now,
      updatedAt: now
    });

    store.lastExpectedCaseId = nextId;
    store.expectedCases.push(newExpectedCase);
    createdOrUpdated.push(toPendingExpectedCaseItem(newExpectedCase));
  }

  await writeStore(store);

  return createdOrUpdated.sort(sortByNewest);
}

async function listPendingExpectedCases() {
  const store = await readStore();
  const items = store.expectedCases
    .map(normalizeExpectedCaseRecord)
    .filter((expectedCase) => expectedCase.status === 'PENDENTE' && expectedCase.boNumber)
    .sort(sortByNewest)
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

module.exports = {
  createPendingExpectedCases,
  listPendingExpectedCases,
  countPendingExpectedCases
};