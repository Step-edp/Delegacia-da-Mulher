function formatDateTime(isoDate) {
  if (!isoDate) {
    return '-';
  }

  return new Date(isoDate).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function renderList(container, items, renderItem) {
  if (!container) {
    return;
  }

  if (!items || !items.length) {
    container.innerHTML = '<p class="muted">Sem registros.</p>';
    return;
  }

  container.innerHTML = items.map(renderItem).join('');
}

function safeCount(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function formatRoleLabel(role) {
  const normalizedRole = String(role || '').trim().toLowerCase();

  if (normalizedRole === 'agent') {
    return 'Agente';
  }

  if (normalizedRole === 'plantonista') {
    return 'Plantonista';
  }

  if (normalizedRole === 'admin') {
    return 'Administrador';
  }

  if (normalizedRole === 'manager') {
    return 'Gestor';
  }

  return role ? String(role).trim() : 'nao informado';
}

function readDashboardSummaryCache() {
  try {
    const raw = localStorage.getItem('adminDashboardSummary');
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function writeDashboardSummaryCache(summary) {
  localStorage.setItem('adminDashboardSummary', JSON.stringify(summary));
}

function countEnabledNaturesFromStorage() {
  const NATURE_ITEMS_COUNT = 30;
  try {
    const raw = localStorage.getItem('adminNatureEnabledState');
    const state = raw ? JSON.parse(raw) : {};
    if (!state || typeof state !== 'object') {
      return NATURE_ITEMS_COUNT;
    }
    const disabledCount = Object.values(state).filter((v) => v === false).length;
    return NATURE_ITEMS_COUNT - disabledCount;
  } catch (error) {
    return NATURE_ITEMS_COUNT;
  }
}

function buildSummaryCards(summary) {
  return [
    { label: 'Envolvidos', value: summary.involvedPeopleTotal, action: 'goToInvolvedPage' },
    { label: 'Usuarios', value: summary.activeUsers, action: 'goToUsersPage' },
    { label: 'Solicitações de cadastro', value: summary.pendingRegistrations, action: 'goToRegistrationRequestsPage' },
    { label: 'BOs Pendentes', value: summary.expectedCasesPending, action: 'goToPendingPage' },
    { label: 'Agenda', value: summary.agendaTotal, action: 'goToAgendaPage' },
    { label: 'Intimações Pendentes', value: summary.summonsPending },
    { label: 'Mensagens', value: summary.notificationsPending, action: 'goToMessagesPage' },
    { label: 'Natureza', value: countEnabledNaturesFromStorage(), action: 'goToNaturePage' },
    { label: 'Certificado de não agendamento', value: safeCount(summary.certificatesGenerated), action: 'goToCertificatePage' }
  ];
}

function runSummaryCardAction(action) {
  if (action === 'goToInvolvedPage') {
    window.location.href = '/admin/envolvidos';
    return;
  }

  if (action === 'goToUsersPage') {
    window.location.href = '/admin/usuarios';
    return;
  }

  if (action === 'goToRegistrationRequestsPage') {
    window.location.href = '/admin/cadastros';
    return;
  }

  if (action === 'goToPendingPage') {
    window.location.href = '/admin/pendencias';
    return;
  }

  if (action === 'goToAgendaPage') {
    window.location.href = '/admin/agenda';
    return;
  }

  if (action === 'goToMessagesPage') {
    window.location.href = '/admin/mensagens';
    return;
  }

  if (action === 'goToNaturePage') {
    window.location.href = '/admin/natureza';
  }

  if (action === 'goToCertificatePage') {
    window.location.href = '/admin/certificado-nao-agendamento';
  }
}

function renderSummaryCards(cardsData) {
  const cards = document.getElementById('summaryCards');
  cards.innerHTML = cardsData.map((card) => `
    <div class="card ${card.action ? 'clickable-card' : ''}" ${card.action ? `data-action="${card.action}" role="link" tabindex="0" aria-label="${card.label}"` : ''}>
      <div class="label">${card.label}</div>
      <div class="value">${card.value}</div>
    </div>
  `).join('');

  cards.onclick = (event) => {
    const card = event.target.closest('.card[data-action]');
    if (!card) {
      return;
    }

    runSummaryCardAction(card.dataset.action);
  };

  cards.onkeydown = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    const card = event.target.closest('.card[data-action]');
    if (!card) {
      return;
    }

    event.preventDefault();
    runSummaryCardAction(card.dataset.action);
  };
}

function toStartOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function formatDayLabel(date) {
  return date.toLocaleDateString('pt-BR');
}

function formatDateTimeFull(isoDate) {
  if (!isoDate) {
    return '-';
  }

  return new Date(isoDate).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function toMinuteOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function formatMinute(minute) {
  const h = String(Math.floor(minute / 60)).padStart(2, '0');
  const m = String(minute % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function buildCoverageByDay(startDate, endDate) {
  const days = [];
  let current = toStartOfDay(startDate);
  const endDay = toStartOfDay(endDate);

  while (current.getTime() <= endDay.getTime()) {
    const isStartDay = current.toDateString() === startDate.toDateString();
    const isEndDay = current.toDateString() === endDate.toDateString();

    const coveredStart = isStartDay ? toMinuteOfDay(startDate) : 0;
    const coveredEnd = isEndDay ? toMinuteOfDay(endDate) : 1439;

    const gaps = [];
    if (coveredStart > 0) {
      gaps.push({ start: 0, end: coveredStart - 1 });
    }
    if (coveredEnd < 1439) {
      gaps.push({ start: coveredEnd + 1, end: 1439 });
    }

    const coveredDuration = Math.max(0, coveredEnd - coveredStart + 1);
    const coveredPct = (coveredDuration / 1440) * 100;
    const beforePct = (coveredStart / 1440) * 100;
    const afterPct = ((1439 - coveredEnd) / 1440) * 100;

    days.push({
      date: new Date(current),
      coveredStart,
      coveredEnd,
      coveredPct,
      beforePct,
      afterPct,
      gaps
    });

    current = addDays(current, 1);
  }

  return days;
}

function minuteRangesToGaps(ranges) {
  if (!ranges.length) {
    return [{ start: 0, end: 1439 }];
  }

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged = [];

  for (const range of sorted) {
    if (!merged.length) {
      merged.push({ ...range });
      continue;
    }

    const last = merged[merged.length - 1];
    if (range.start <= last.end + 1) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  const gaps = [];
  let cursor = 0;

  for (const interval of merged) {
    if (interval.start > cursor) {
      gaps.push({ start: cursor, end: interval.start - 1 });
    }
    cursor = interval.end + 1;
  }

  if (cursor <= 1439) {
    gaps.push({ start: cursor, end: 1439 });
  }

  return gaps;
}

function rangesCoverageToDayRows(dayKey, ranges) {
  const dayDate = new Date(`${dayKey}T00:00:00`);
  const gaps = minuteRangesToGaps(ranges);
  const coveredDuration = 1440 - gaps.reduce((acc, gap) => acc + (gap.end - gap.start + 1), 0);
  const coveredPct = (coveredDuration / 1440) * 100;

  let coveredStart = 0;
  let coveredEnd = 1439;

  if (coveredDuration <= 0) {
    coveredStart = 0;
    coveredEnd = 0;
  } else {
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    coveredStart = sorted[0].start;
    coveredEnd = sorted[sorted.length - 1].end;
  }

  const beforePct = (coveredStart / 1440) * 100;
  const afterPct = ((1439 - coveredEnd) / 1440) * 100;

  return {
    date: dayDate,
    coveredStart,
    coveredEnd,
    coveredPct,
    beforePct,
    afterPct,
    gaps
  };
}

function buildAggregatedCoverageFromHistory(history) {
  const dayMap = new Map();

  for (const entry of history) {
    const period = entry && entry.period;
    if (!period || !period.iso || !period.iso.start || !period.iso.end) {
      continue;
    }

    const start = new Date(period.iso.start);
    const end = new Date(period.iso.end);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      continue;
    }

    const dayRows = buildCoverageByDay(start, end);
    for (const row of dayRows) {
      const dayKey = row.date.toISOString().slice(0, 10);
      if (!dayMap.has(dayKey)) {
        dayMap.set(dayKey, []);
      }
      dayMap.get(dayKey).push({ start: row.coveredStart, end: row.coveredEnd });
    }
  }

  return [...dayMap.entries()]
    .map(([dayKey, ranges]) => rangesCoverageToDayRows(dayKey, ranges))
    .sort((a, b) => a.date - b.date);
}

function buildCoverageHtml(dayRows) {
  return dayRows
    .map((day) => {
      const gapsText = day.gaps.length
        ? day.gaps.map((g) => `${formatMinute(g.start)} às ${formatMinute(g.end)}`).join(' e ')
        : 'Sem lacunas no dia.';

      return `
        <div class="coverage-day">
          <div class="coverage-day-header">
            <strong>${formatDayLabel(day.date)}</strong>
            <span>Coberto: ${formatMinute(day.coveredStart)} às ${formatMinute(day.coveredEnd)}</span>
          </div>
          <div class="coverage-bar">
            ${day.beforePct > 0 ? `<div class="coverage-segment-missing" style="width:${day.beforePct}%;"></div>` : ''}
            ${day.coveredPct > 0 ? `<div class="coverage-segment-covered" style="width:${day.coveredPct}%;"></div>` : ''}
            ${day.afterPct > 0 ? `<div class="coverage-segment-missing" style="width:${day.afterPct}%;"></div>` : ''}
          </div>
          <div class="coverage-gaps"><strong>Faltando:</strong> ${gapsText}</div>
        </div>
      `;
    })
    .join('');
}

function renderPeriodCoverage(history) {
  const chart = document.getElementById('coverageChart');
  const hint = document.getElementById('coverageHint');
  const aggregatedRows = buildAggregatedCoverageFromHistory(history || []);

  if (!aggregatedRows.length) {
    chart.innerHTML = '<p class="muted">Ainda sem período carregado do Livro de BOs.</p>';
    hint.textContent = '';
    return;
  }

  const incompleteRows = aggregatedRows.filter((day) => day.gaps.length > 0);
  chart.innerHTML = incompleteRows.length
    ? buildCoverageHtml(incompleteRows)
    : '<p class="muted">Todos os dias desse período estão completos.</p>';

  if (incompleteRows.length !== aggregatedRows.length) {
    hint.textContent = `${aggregatedRows.length - incompleteRows.length} dia(s) completo(s) ocultado(s). Use "Ver histórico" para ver todos os dias.`;
  } else {
    hint.textContent = '';
  }
}

async function loadRegistrationRequests() {
  const token = localStorage.getItem('adminAccessToken');
  const container = document.getElementById('registrationRequestsList');
  const hint = document.getElementById('registrationRequestsHint');

  if (!container || !hint) {
    return;
  }

  if (!token) {
    container.innerHTML = '<p class="muted">Nenhuma solicitacao encontrada.</p>';
    hint.textContent = '';
    return;
  }

  const response = await fetch('/api/admin/dashboard/pending-registrations', {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem('adminAccessToken');
    window.location.href = '/admin';
    return;
  }

  if (!response.ok) {
    container.innerHTML = '<p class="muted">Erro ao carregar solicitacoes de cadastro.</p>';
    hint.textContent = '';
    return;
  }

  const data = await response.json();
  renderList(container, data.items, (item) => `
    <div class="item registration-request-item" data-user-id="${item.id}">
      <strong>${item.fullName}</strong>
      <div>${item.email || 'sem email'}</div>
      <div>Perfil: ${formatRoleLabel(item.role)}</div>
      <div class="muted">CPF: ${item.cpf || '-'} | ${item.phone || 'sem telefone'}</div>
      <div class="registration-request-actions">
        <button type="button" class="approve-btn" data-user-id="${item.id}">Aprovar</button>
      </div>
    </div>
  `);

  if (!data.items || !data.items.length) {
    container.innerHTML = '<p class="muted">Nenhuma solicitacao de cadastro pendente.</p>';
  }

  hint.textContent = data.items && data.items.length ? 'Clique em Aprovar para liberar o usuario.' : '';
}

async function approveRegistrationRequest(userId) {
  const token = localStorage.getItem('adminAccessToken');
  const response = await fetch(`/api/admin/dashboard/pending-registrations/${userId}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Falha ao aprovar solicitacao.');
  }

  return data;
}

function bindRegistrationRequestActions() {
  const container = document.getElementById('registrationRequestsList');

  if (!container) {
    return;
  }

  container.addEventListener('click', async (event) => {
    const button = event.target.closest('.approve-btn');
    if (!button) {
      return;
    }

    const userId = button.dataset.userId;
    button.disabled = true;
    button.textContent = 'Aprovando...';

    try {
      await approveRegistrationRequest(userId);
      await loadDashboard();
      await loadRegistrationRequests();
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Aprovar';
      alert(error.message || 'Erro ao aprovar solicitacao.');
    }
  });
}

function readImportHistory() {
  try {
    const raw = localStorage.getItem('boImportHistory');
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
  }
}

function writeImportHistory(history) {
  localStorage.setItem('boImportHistory', JSON.stringify(history.slice(0, 30)));
}

function toIsoOrNull(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function buildPeriodLabel(startIso, endIso) {
  const start = toIsoOrNull(startIso);
  const end = toIsoOrNull(endIso);

  if (!start || !end) {
    return null;
  }

  const startDate = new Date(start);
  const endDate = new Date(end);
  const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  return `${dateFormatter.format(startDate)} às ${timeFormatter.format(startDate)} até ${dateFormatter.format(endDate)} às ${timeFormatter.format(endDate)}`;
}

function normalizeImportHistoryEntry(entry) {
  const periodIso = entry && entry.period && entry.period.iso ? entry.period.iso : {};
  const start = toIsoOrNull(periodIso.start);
  const end = toIsoOrNull(periodIso.end);

  return {
    importedAt: toIsoOrNull(entry && entry.importedAt),
    period: {
      raw: entry && entry.period && entry.period.raw ? entry.period.raw : buildPeriodLabel(start, end),
      iso: {
        start,
        end
      }
    },
    file: {
      originalName: entry && entry.file && entry.file.originalName ? entry.file.originalName : null,
      savedName: entry && entry.file && entry.file.savedName ? entry.file.savedName : null
    },
    uploadedBy: entry && entry.uploadedBy ? entry.uploadedBy : null
  };
}

function buildHistoryEntryKey(entry) {
  const normalized = normalizeImportHistoryEntry(entry);
  return [
    normalized.file.originalName || '',
    normalized.period.iso.start || '',
    normalized.period.iso.end || ''
  ].join('|');
}

function mergeImportHistories(primaryHistory, secondaryHistory) {
  const merged = new Map();

  for (const item of Array.isArray(primaryHistory) ? primaryHistory : []) {
    const normalized = normalizeImportHistoryEntry(item);
    merged.set(buildHistoryEntryKey(normalized), normalized);
  }

  for (const item of Array.isArray(secondaryHistory) ? secondaryHistory : []) {
    const normalized = normalizeImportHistoryEntry(item);
    const key = buildHistoryEntryKey(normalized);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, normalized);
      continue;
    }

    merged.set(key, {
      ...existing,
      importedAt: existing.importedAt || normalized.importedAt,
      file: {
        originalName: existing.file.originalName || normalized.file.originalName,
        savedName: existing.file.savedName || normalized.file.savedName
      },
      uploadedBy: existing.uploadedBy || normalized.uploadedBy,
      period: {
        raw: existing.period.raw || normalized.period.raw,
        iso: {
          start: existing.period.iso.start || normalized.period.iso.start,
          end: existing.period.iso.end || normalized.period.iso.end
        }
      }
    });
  }

  return [...merged.values()]
    .sort((left, right) => new Date(right.importedAt || 0).getTime() - new Date(left.importedAt || 0).getTime())
    .slice(0, 30);
}

async function fetchImportHistory() {
  const token = localStorage.getItem('adminAccessToken');
  if (!token) {
    return readImportHistory();
  }

  const response = await fetch('/api/admin/dashboard/import-history', {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem('adminAccessToken');
    window.location.href = '/admin';
    return [];
  }

  if (!response.ok) {
    throw new Error('Erro ao carregar historico de importacoes.');
  }

  const data = await response.json();
  return mergeImportHistories(data.items || [], readImportHistory());
}

async function loadImportHistory() {
  const history = await fetchImportHistory();
  writeImportHistory(history);
  renderPeriodCoverage(history);
  return history;
}

function readAdminUser() {
  try {
    const raw = localStorage.getItem('adminUser');
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function readDevPendingCases() {
  try {
    const raw = localStorage.getItem('devPendingExpectedCases');
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch (error) {
    return 0;
  }
}

function writeDevPendingCases(value) {
  const safeValue = Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
  localStorage.setItem('devPendingExpectedCases', String(safeValue));
}

function writeDevPendingBos(boEntries) {
  const list = Array.isArray(boEntries)
    ? boEntries
        .map((entry) => ({
          boNumber: entry && entry.boNumber ? String(entry.boNumber).trim() : '',
          flagrante: entry && entry.flagrante ? String(entry.flagrante).trim() : null,
          natureza: entry && entry.natureza ? String(entry.natureza).trim() : null,
          victim: entry && entry.victim ? String(entry.victim).trim() : null,
          author: entry && entry.author ? String(entry.author).trim() : null,
          local: entry && entry.local ? String(entry.local).trim() : null
        }))
        .filter((entry) => Boolean(entry.boNumber))
    : [];
  localStorage.setItem('devPendingBos', JSON.stringify(list));
}

function buildOriginalFileLink(file) {
  if (file && file.savedName) {
    return `/uploads/pdfs/${encodeURIComponent(file.savedName)}`;
  }

  return null;
}

function appendImportHistoryEntry(data) {
  const history = readImportHistory();
  const adminUser = readAdminUser();
  history.unshift({
    importedAt: new Date().toISOString(),
    period: data.period || null,
    file: data.file || null,
    uploadedBy: adminUser
      ? {
          fullName: adminUser.fullName || null,
          cpf: adminUser.cpf || null,
          role: adminUser.role || null
        }
      : null
  });
  writeImportHistory(history);
}


async function uploadBoPdf() {
  const token = localStorage.getItem('adminAccessToken');
  const fileInput = document.getElementById('boPdfFile');
  const fileNameEl = document.getElementById('boFileName');
  const statusEl = document.getElementById('boUploadStatus');
  const file = fileInput.files && fileInput.files[0];

  if (!file) {
    statusEl.textContent = 'Selecione um PDF antes de enviar.';
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  statusEl.textContent = 'Enviando PDF...';

  const response = await fetch('/api/pdfs/upload', {
    method: 'POST',
    headers: token
      ? {
          Authorization: `Bearer ${token}`
        }
      : undefined,
    body: formData
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    statusEl.textContent = data.error || 'Falha ao importar Livro de BOs.';
    return;
  }

  const boNumber = data && data.boBook ? data.boBook.boNumber || '-' : '-';
  const totalBos = Number(data && data.totalBosExtracted ? data.totalBosExtracted : 0);
  const totalPending = Number(data && data.pendingToAttachFiles ? data.pendingToAttachFiles : 0);
  if (totalBos > 1) {
    statusEl.textContent = `Importacao concluida. ${totalBos} BOs extraidos e ${totalPending} pendencias de inserir arquivos criadas.`;
  } else {
    statusEl.textContent = `Importacao concluida. BO extraido: ${boNumber}. ${totalPending} pendencia(s) de inserir arquivos criada(s).`;
  }

  if (data && data.persistenceMode === 'mocked_without_database') {
    writeDevPendingCases(totalPending);
    writeDevPendingBos(data.boEntries || []);
  }

  if (data && data.period) {
    appendImportHistoryEntry(data);
    try {
      await loadImportHistory();
    } catch (error) {
      renderPeriodCoverage(readImportHistory());
    }
  }

  try {
    await loadDashboard();
  } catch (error) {
    // Ignore dashboard refresh error; upload already succeeded.
  }

  fileInput.value = '';
  fileNameEl.textContent = 'Nenhum arquivo selecionado';
}

function setupBoUploaderInteractions() {
  const fileInput = document.getElementById('boPdfFile');
  const dropzone = document.getElementById('boDropzone');
  const fileNameEl = document.getElementById('boFileName');

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    fileNameEl.textContent = file ? file.name : 'Nenhum arquivo selecionado';
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove('drag-over');
    });
  });

  dropzone.addEventListener('drop', (event) => {
    const files = event.dataTransfer && event.dataTransfer.files;
    if (!files || !files.length) {
      return;
    }

    fileInput.files = files;
    const file = files[0];
    fileNameEl.textContent = file ? file.name : 'Nenhum arquivo selecionado';
  });
}

async function loadDashboard() {
  const token = localStorage.getItem('adminAccessToken');
  if (!token) {
    window.location.href = '/admin';
    return;
  }

  const response = await fetch('/api/admin/dashboard/overview', {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem('adminAccessToken');
    window.location.href = '/admin';
    return;
  }

  if (!response.ok) {
    throw new Error('Falha ao carregar dashboard.');
  }

  const data = await response.json();

  if (data && data.mocked && data.pending && !Number.isFinite(Number(data.pending.expectedCasesPending))) {
    data.pending.expectedCasesPending = readDevPendingCases();
  }

  data.casesOfDay = data.casesOfDay || { total: 0, items: [] };
  data.involvedPeople = data.involvedPeople || { total: 0 };
  data.agendaOfDay = data.agendaOfDay || { total: 0, items: [] };
  data.recurrence = data.recurrence || { total: 0, items: [] };

  if (!data.pending) {
    data.pending = {};
  }

  data.pending.pendingRegistrations = safeCount(data.pending.pendingRegistrations);
  data.pending.activeUsers = safeCount(data.pending.activeUsers);
  data.pending.expectedCasesPending = safeCount(data.pending.expectedCasesPending);
  data.pending.summonsPending = safeCount(data.pending.summonsPending);
  data.pending.notificationsPending = safeCount(data.pending.notificationsPending);
  data.pending.certificatesGenerated = safeCount(data.pending.certificatesGenerated);

  if (data && data.mocked) {
    writeDevPendingCases(data.pending.expectedCasesPending);
  }

  const summarySnapshot = {
    casesOfDayTotal: safeCount(data.casesOfDay.total),
    involvedPeopleTotal: safeCount(data.involvedPeople.total),
    agendaTotal: safeCount(data.agendaOfDay.total),
    activeUsers: data.pending.activeUsers,
    pendingRegistrations: data.pending.pendingRegistrations,
    expectedCasesPending: data.pending.expectedCasesPending,
    summonsPending: data.pending.summonsPending,
    notificationsPending: data.pending.notificationsPending,
    certificatesGenerated: data.pending.certificatesGenerated
  };

  writeDashboardSummaryCache(summarySnapshot);
  renderSummaryCards(buildSummaryCards(summarySnapshot));

  renderList(document.getElementById('casesList'), data.casesOfDay.items, (item) => `
    <div class="item">
      <strong>${item.protocolNumber}</strong>
      <div>${item.title}</div>
      <div class="muted">${item.status} | ${item.priority} | ${formatDateTime(item.openedAt)}</div>
    </div>
  `);

  renderList(document.getElementById('pendingList'), [data.pending], (item) => `
    <div class="item">
      <div><strong>Casos esperados:</strong> ${item.expectedCasesPending}</div>
      <div><strong>Intimacoes:</strong> ${item.summonsPending}</div>
      <div><strong>Natureza:</strong> ${item.notificationsPending}</div>
    </div>
  `);

  renderList(document.getElementById('agendaList'), data.agendaOfDay.items, (item) => `
    <div class="item">
      <strong>${item.personName}</strong>
      <div>${item.appointmentType} | ${item.personRole || '-'}</div>
      <div class="muted">${formatDateTime(item.startsAt)} ate ${formatDateTime(item.endsAt)} | ${item.status}</div>
    </div>
  `);

  renderList(document.getElementById('recurrenceList'), data.recurrence.items, (item) => `
    <div class="item">
      <strong>${item.personName}</strong>
      <div>CPF: ${item.cpf}</div>
      <div class="muted">${item.caseCount} casos distintos</div>
    </div>
  `);
}

document.getElementById('refreshBtn').addEventListener('click', () => {
  Promise.all([loadDashboard(), loadRegistrationRequests()]).catch((error) => {
    alert(error.message);
  });
});

document.getElementById('boUploadForm').addEventListener('submit', (event) => {
  event.preventDefault();
  uploadBoPdf().catch((error) => {
    const statusEl = document.getElementById('boUploadStatus');
    statusEl.textContent = error.message || 'Erro ao enviar PDF.';
  });
});

setupBoUploaderInteractions();
bindRegistrationRequestActions();

const cachedDashboardSummary = readDashboardSummaryCache();
if (cachedDashboardSummary) {
  renderSummaryCards(buildSummaryCards({
    casesOfDayTotal: safeCount(cachedDashboardSummary.casesOfDayTotal),
    involvedPeopleTotal: safeCount(cachedDashboardSummary.involvedPeopleTotal),
    agendaTotal: safeCount(cachedDashboardSummary.agendaTotal),
    activeUsers: safeCount(cachedDashboardSummary.activeUsers),
    pendingRegistrations: safeCount(cachedDashboardSummary.pendingRegistrations),
    expectedCasesPending: safeCount(cachedDashboardSummary.expectedCasesPending),
    summonsPending: safeCount(cachedDashboardSummary.summonsPending),
    notificationsPending: safeCount(cachedDashboardSummary.notificationsPending),
    certificatesGenerated: safeCount(cachedDashboardSummary.certificatesGenerated)
  }));
}

loadImportHistory().catch(() => {
  try {
    renderPeriodCoverage(readImportHistory());
  } catch (error) {
    renderPeriodCoverage([]);
  }
});

loadDashboard().catch((error) => {
  alert(error.message);
});

loadRegistrationRequests().catch((error) => {
  const container = document.getElementById('registrationRequestsList');
  if (container) {
    container.innerHTML = '<p class="muted">Erro ao carregar solicitacoes de cadastro.</p>';
  }
});
