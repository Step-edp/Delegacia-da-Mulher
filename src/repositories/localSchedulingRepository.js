const fs = require('fs/promises');
const path = require('path');

const STORE_PATH = path.resolve(process.cwd(), 'database', 'dev-data', 'local-scheduling.json');

function createDefaultStore() {
  return {
    lastSlotId: 0,
    slots: [],
    settings: {
      victimAuthorGapHours: 0,
      authorSummonsMaxDays: 3,
      summonsMaxAttempts: 3,
      summonsIntervalHours: 12,
      updatedAt: null
    }
  };
}

async function ensureStoreDir() {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
}

async function writeStore(store) {
  await ensureStoreDir();
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function normalizeSlotRecord(slot) {
  return {
    id: Number(slot.id),
    startsAt: slot.startsAt ? new Date(slot.startsAt).toISOString() : null,
    endsAt: slot.endsAt ? new Date(slot.endsAt).toISOString() : null,
    status: String(slot.status || 'DISPONIVEL').trim().toUpperCase(),
    createdAt: slot.createdAt ? new Date(slot.createdAt).toISOString() : null,
    updatedAt: slot.updatedAt ? new Date(slot.updatedAt).toISOString() : null
  };
}

function normalizeSettingsRecord(settings) {
  return {
    victimAuthorGapHours: Number.isInteger(Number(settings && settings.victimAuthorGapHours))
      ? Math.max(0, Number(settings.victimAuthorGapHours))
      : 0,
    authorSummonsMaxDays: Number.isInteger(Number(settings && settings.authorSummonsMaxDays))
      ? Math.max(0, Number(settings.authorSummonsMaxDays))
      : 3,
    summonsMaxAttempts: Number.isInteger(Number(settings && settings.summonsMaxAttempts))
      ? Math.max(1, Number(settings.summonsMaxAttempts))
      : 3,
    summonsIntervalHours: Number.isInteger(Number(settings && settings.summonsIntervalHours))
      ? Math.max(1, Number(settings.summonsIntervalHours))
      : 12,
    updatedAt: settings && settings.updatedAt ? new Date(settings.updatedAt).toISOString() : null
  };
}

async function readStore() {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);

    return {
      lastSlotId: Number(parsed.lastSlotId) || 0,
      slots: Array.isArray(parsed.slots) ? parsed.slots.map(normalizeSlotRecord) : [],
      settings: normalizeSettingsRecord(parsed.settings)
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      const store = createDefaultStore();
      await writeStore(store);
      return store;
    }

    throw error;
  }
}

function buildDateKey(date) {
  const parsed = new Date(date);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function createAvailabilitySlot({ startsAt, endsAt }) {
  const store = await readStore();
  const normalizedStartsAt = new Date(startsAt).toISOString();
  const normalizedEndsAt = new Date(endsAt).toISOString();

  const alreadyExists = store.slots.some((slot) => slot.startsAt === normalizedStartsAt);
  if (alreadyExists) {
    return null;
  }

  const now = new Date().toISOString();
  const slot = normalizeSlotRecord({
    id: store.lastSlotId + 1,
    startsAt: normalizedStartsAt,
    endsAt: normalizedEndsAt,
    status: 'DISPONIVEL',
    createdAt: now,
    updatedAt: now
  });

  store.lastSlotId = slot.id;
  store.slots.push(slot);
  await writeStore(store);

  return {
    id: slot.id,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    status: slot.status
  };
}

async function listAvailabilityByDate(date) {
  const store = await readStore();

  return store.slots
    .filter((slot) => buildDateKey(slot.startsAt) === String(date || '').trim())
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime())
    .map((slot) => ({
      id: slot.id,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      status: slot.status
    }));
}

async function listAvailabilityDatesInRange({ startDate, endDate }) {
  const store = await readStore();
  const startMs = new Date(`${String(startDate || '').trim()}T00:00:00`).getTime();
  const endMs = new Date(`${String(endDate || '').trim()}T23:59:59`).getTime();

  const dates = new Set();

  for (const slot of store.slots) {
    const slotTime = new Date(slot.startsAt).getTime();
    if (Number.isNaN(slotTime)) {
      continue;
    }

    if (slot.status !== 'DISPONIVEL') {
      continue;
    }

    if (slotTime < startMs || slotTime > endMs) {
      continue;
    }

    dates.add(buildDateKey(slot.startsAt));
  }

  return [...dates].sort();
}

async function findAvailabilitySlotById(slotId) {
  const store = await readStore();
  const slot = store.slots.find((item) => Number(item.id) === Number(slotId));

  if (!slot) {
    return null;
  }

  return {
    id: slot.id,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    status: slot.status
  };
}

async function listAppointmentsByCaseAndRoles() {
  return [];
}

async function findLatestSummonsDeadlineByCaseAndPersonType() {
  return null;
}

async function getSchedulingSettings() {
  const store = await readStore();
  return normalizeSettingsRecord(store.settings);
}

async function updateSchedulingSettings({ victimAuthorGapHours, authorSummonsMaxDays, summonsMaxAttempts, summonsIntervalHours }) {
  const store = await readStore();
  store.settings = normalizeSettingsRecord({
    victimAuthorGapHours,
    authorSummonsMaxDays,
    summonsMaxAttempts,
    summonsIntervalHours,
    updatedAt: new Date().toISOString()
  });

  await writeStore(store);
  return store.settings;
}

module.exports = {
  createAvailabilitySlot,
  listAvailabilityByDate,
  listAvailabilityDatesInRange,
  findAvailabilitySlotById,
  listAppointmentsByCaseAndRoles,
  findLatestSummonsDeadlineByCaseAndPersonType,
  getSchedulingSettings,
  updateSchedulingSettings
};