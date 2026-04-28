const fs = require('fs/promises');
const path = require('path');

const STORE_PATH = path.resolve(process.cwd(), 'database', 'dev-data', 'local-auth.json');
const PROTECTED_ADMIN_USERS = [
  {
    cpf: '40280221851',
    email: 'stephanieps.amorim@gmail.com',
    fullName: 'Stephanie de Paula Santos Amorim',
    phone: '12996839184',
    legacyNames: ['super admin']
  },
  {
    cpf: '00000000000',
    email: 'joao@gmail.com',
    fullName: 'Joao',
    phone: '24974012990',
    legacyNames: []
  }
];

function normalizeCpf(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function createDefaultAdminUser(admin, id) {
  const now = new Date().toISOString();

  return {
    id,
    personId: id,
    fullName: admin.fullName,
    email: admin.email,
    phone: admin.phone,
    cpf: admin.cpf,
    role: 'admin',
    isActive: true,
    createdAt: now,
    updatedAt: now
  };
}

function createDefaultStore() {
  const users = PROTECTED_ADMIN_USERS.map((admin, index) => createDefaultAdminUser(admin, index + 1));

  return {
    lastUserId: users.length,
    users
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
  const syncedStore = syncProtectedAdminUsers(parsed.users);
  const nextStore = {
    lastUserId: Math.max(Number(parsed.lastUserId) || 0, syncedStore.lastUserId),
    users: syncedStore.users
  };

  const normalizedOriginalUsers = Array.isArray(parsed.users)
    ? parsed.users.map((item) => normalizeUserRecord(item))
    : [];
  const didUsersChange = JSON.stringify(normalizedOriginalUsers) !== JSON.stringify(nextStore.users);
  const didLastUserIdChange = Number(parsed.lastUserId) !== nextStore.lastUserId;

  if (didUsersChange || didLastUserIdChange) {
    await writeStore(nextStore);
  }

  return nextStore;
}

async function writeStore(store) {
  await ensureStoreFile();
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function normalizeUserRecord(user) {
  return {
    id: Number(user.id),
    personId: Number(user.personId),
    fullName: String(user.fullName || '').trim(),
    email: user.email == null ? null : String(user.email).trim(),
    phone: user.phone == null ? null : String(user.phone).trim(),
    cpf: String(user.cpf || '').trim(),
    role: String(user.role || 'agent').trim(),
    isActive: Boolean(user.isActive),
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null
  };
}

function isProtectedAdminConfig(user, protectedAdmin) {
  const cpf = normalizeCpf(user && user.cpf);
  const email = normalizeEmail(user && user.email);

  return cpf === protectedAdmin.cpf
    || email === protectedAdmin.email;
}

function migrateProtectedAdminUser(user) {
  const normalized = normalizeUserRecord(user);
  const protectedAdmin = PROTECTED_ADMIN_USERS.find((item) => isProtectedAdminConfig(normalized, item));

  if (!protectedAdmin) {
    return normalized;
  }

  const fullName = String(normalized.fullName || '').trim().toLowerCase();
  const shouldReplaceLegacyName = (protectedAdmin.legacyNames || [])
    .map((item) => String(item || '').trim().toLowerCase())
    .includes(fullName);

  return {
    ...normalized,
    fullName: normalized.fullName && !shouldReplaceLegacyName ? normalized.fullName : protectedAdmin.fullName,
    email: protectedAdmin.email,
    phone: protectedAdmin.phone,
    cpf: protectedAdmin.cpf,
    role: 'admin',
    isActive: true
  };
}

function syncProtectedAdminUsers(users) {
  const normalizedUsers = Array.isArray(users)
    ? users.map((item) => normalizeUserRecord(item))
    : [];
  const nextUsers = normalizedUsers.map((item) => migrateProtectedAdminUser(item));
  let maxId = nextUsers.reduce((acc, item) => Math.max(acc, Number(item.id) || 0), 0);

  for (const admin of PROTECTED_ADMIN_USERS) {
    const index = nextUsers.findIndex((item) => isProtectedAdminConfig(item, admin));

    if (index >= 0) {
      const current = nextUsers[index];
      nextUsers[index] = {
        ...current,
        fullName: admin.fullName,
        email: admin.email,
        phone: admin.phone,
        cpf: admin.cpf,
        role: 'admin',
        isActive: true,
        updatedAt: current.updatedAt || current.createdAt || new Date().toISOString()
      };
      continue;
    }

    maxId += 1;
    nextUsers.push(createDefaultAdminUser(admin, maxId));
  }

  return {
    users: nextUsers,
    lastUserId: maxId
  };
}

function toPendingRegistrationItem(user) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    cpf: user.cpf,
    phone: user.phone
  };
}

function toActiveUserItem(user) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    cpf: user.cpf,
    phone: user.phone,
    isActive: user.isActive
  };
}

function isSuperAdminUser(user) {
  return PROTECTED_ADMIN_USERS.some((item) => isProtectedAdminConfig(user, item));
}

function sortActiveUsers(left, right) {
  const leftPriority = isSuperAdminUser(left) ? 0 : 1;
  const rightPriority = isSuperAdminUser(right) ? 0 : 1;

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  const leftDate = new Date(left.updatedAt || left.createdAt || 0).getTime();
  const rightDate = new Date(right.updatedAt || right.createdAt || 0).getTime();

  if (rightDate !== leftDate) {
    return rightDate - leftDate;
  }

  return String(left.fullName || '').localeCompare(String(right.fullName || ''), 'pt-BR');
}

async function findUserById(userId) {
  const store = await readStore();
  const user = store.users
    .map(normalizeUserRecord)
    .find((item) => Number(item.id) === Number(userId));

  return user || null;
}

async function createPendingRegistration({ fullName, cpf, email, phone, role }) {
  const store = await readStore();
  const existingUser = store.users.find((user) => String(user.cpf || '').trim() === String(cpf || '').trim());

  if (existingUser) {
    const error = new Error('Ja existe um usuario cadastrado com este CPF.');
    error.statusCode = 409;
    throw error;
  }

  const createdAt = new Date().toISOString();
  const nextId = store.lastUserId + 1;
  const user = normalizeUserRecord({
    id: nextId,
    personId: nextId,
    fullName,
    email,
    phone,
    cpf,
    role: role || 'agent',
    isActive: false,
    createdAt,
    updatedAt: createdAt
  });

  store.lastUserId = nextId;
  store.users.push(user);
  await writeStore(store);

  return user;
}

async function listPendingRegistrations() {
  const store = await readStore();
  const items = store.users
    .map(normalizeUserRecord)
    .filter((user) => !user.isActive)
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))
    .map(toPendingRegistrationItem);

  return {
    total: items.length,
    items
  };
}

async function countPendingRegistrations() {
  const result = await listPendingRegistrations();
  return result.total;
}

async function listActiveUsers() {
  const store = await readStore();
  const items = store.users
    .map(normalizeUserRecord)
    .filter((user) => user.isActive)
    .sort(sortActiveUsers)
    .map(toActiveUserItem);

  return {
    total: items.length,
    items
  };
}

async function countActiveUsers() {
  const result = await listActiveUsers();
  return result.total;
}

async function approveRegistration(userId) {
  const store = await readStore();
  const user = store.users.find((item) => Number(item.id) === Number(userId));

  if (!user || user.isActive) {
    return null;
  }

  user.isActive = true;
  user.updatedAt = new Date().toISOString();
  await writeStore(store);

  return {
    id: Number(user.id)
  };
}

async function deleteUser(userId) {
  const store = await readStore();
  const index = store.users.findIndex((item) => Number(item.id) === Number(userId));

  if (index === -1) {
    return null;
  }

  const [user] = store.users.splice(index, 1);
  await writeStore(store);

  return {
    id: Number(user.id)
  };
}

module.exports = {
  createPendingRegistration,
  listPendingRegistrations,
  countPendingRegistrations,
  listActiveUsers,
  countActiveUsers,
  approveRegistration,
  findUserById,
  deleteUser
};