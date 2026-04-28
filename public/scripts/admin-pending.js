function readDevPendingBos() {
  try {
    const raw = localStorage.getItem('devPendingBos');
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => {
        if (typeof entry === 'string') {
          return { boNumber: entry };
        }

        return entry || {};
      })
      .filter((entry) => Boolean(entry.boNumber));
  } catch (error) {
    return [];
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

function normalizeLower(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeSearchText(value) {
  return normalizeLower(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const MESSAGE_DRAFT_STORAGE_KEY = 'adminMessagesDrafts';

const pendingState = {
  pendingItems: [],
  processingItems: [],
  total: 0,
  activeStatusFilterKey: null
};

const PENDING_STATUS_CARDS = [
  { key: 'pending', label: 'Pendentes' },
  { key: 'processing', label: 'Processando' },
  { key: 'victimIntimated', label: 'Vitima intimada' },
  { key: 'authorIntimated', label: 'Infrator intimado' },
  { key: 'witnessIntimated', label: 'Testemunha intimadas' },
  { key: 'victimHeard', label: 'Vitima ouvida' },
  { key: 'authorHeard', label: 'Infrator ouvido' },
  { key: 'victimReported', label: 'Vitima reportada' },
  { key: 'witnessHeard', label: 'Testemulnha ouvida' },
  { key: 'victimReportedDuplicate', label: 'Vitima reportada' },
  { key: 'total', label: 'Total' }
];

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function valueOrDash(value) {
  const text = value == null ? '' : String(value).trim();
  return text || '-';
}

function valueOrEmpty(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeFlagText(value) {
  return normalizeSearchText(value);
}

function hasTrueFlag(item, keys) {
  return keys.some((key) => {
    const value = item && item[key];

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) && value > 0;
    }

    const normalized = normalizeFlagText(value);
    return normalized === 'true'
      || normalized === 'sim'
      || normalized === 'yes'
      || normalized === 'ok'
      || normalized === 'enviado'
      || normalized === 'sent'
      || normalized === 'intimado'
      || normalized === 'intimada'
      || normalized === 'ouvido'
      || normalized === 'ouvida'
      || normalized === 'reportado'
      || normalized === 'reportada';
  });
}

function matchesStatusFlag(item, keys, expectedValues) {
  const normalizedExpected = expectedValues.map(normalizeFlagText);

  return keys.some((key) => {
    const normalized = normalizeFlagText(item && item[key]);
    return normalizedExpected.includes(normalized);
  });
}

function countPendingStatusItems(items, matcher) {
  return items.filter((item) => matcher(item)).length;
}

function buildPendingStatusMatchers(total) {
  return {
    total: () => true,
    pending: () => true,
    processing: () => true,
    victimIntimated: (item) =>
      hasTrueFlag(item, ['victimIntimated', 'victimSummoned', 'victimNotified', 'victimNotifiedAt'])
        || matchesStatusFlag(item, ['victimSummonsStatus', 'victimStatus'], ['sent', 'intimada', 'intimado']),
    authorIntimated: (item) =>
      hasTrueFlag(item, ['authorIntimated', 'authorSummoned', 'authorNotified', 'authorNotifiedAt'])
        || matchesStatusFlag(item, ['authorSummonsStatus', 'authorStatus'], ['sent', 'intimada', 'intimado']),
    witnessIntimated: (item) =>
      hasTrueFlag(item, ['witnessIntimated', 'witnessSummoned', 'witnessNotified', 'witnessNotifiedAt'])
        || matchesStatusFlag(item, ['witnessSummonsStatus', 'witnessStatus'], ['sent', 'intimada', 'intimado']),
    victimHeard: (item) =>
      hasTrueFlag(item, ['victimHeard', 'victimHeardAt'])
        || matchesStatusFlag(item, ['victimAttendanceStatus', 'victimHearingStatus'], ['heard', 'ouvida', 'ouvido']),
    authorHeard: (item) =>
      hasTrueFlag(item, ['authorHeard', 'authorHeardAt'])
        || matchesStatusFlag(item, ['authorAttendanceStatus', 'authorHearingStatus'], ['heard', 'ouvida', 'ouvido']),
    witnessHeard: (item) =>
      hasTrueFlag(item, ['witnessHeard', 'witnessHeardAt'])
        || matchesStatusFlag(item, ['witnessAttendanceStatus', 'witnessHearingStatus'], ['heard', 'ouvida', 'ouvido']),
    victimReported: (item) =>
      hasTrueFlag(item, ['victimReported', 'victimReportedAt'])
        || matchesStatusFlag(item, ['victimReportStatus'], ['reportada', 'reportado']),
    victimReportedDuplicate: (item) =>
      hasTrueFlag(item, ['victimReported', 'victimReportedAt'])
        || matchesStatusFlag(item, ['victimReportStatus'], ['reportada', 'reportado'])
  };
}

function buildPendingStatusCounts(pendingItems, processingItems, total) {
  const safePendingItems = Array.isArray(pendingItems) ? pendingItems : [];
  const safeProcessingItems = Array.isArray(processingItems) ? processingItems : [];
  const matchers = buildPendingStatusMatchers(total);

  const pending = safePendingItems.length;
  const processing = safeProcessingItems.length;
  const victimIntimated = countPendingStatusItems(safePendingItems, matchers.victimIntimated);
  const authorIntimated = countPendingStatusItems(safePendingItems, matchers.authorIntimated);
  const witnessIntimated = countPendingStatusItems(safePendingItems, matchers.witnessIntimated);
  const victimHeard = countPendingStatusItems(safePendingItems, matchers.victimHeard);
  const authorHeard = countPendingStatusItems(safePendingItems, matchers.authorHeard);
  const witnessHeard = countPendingStatusItems(safePendingItems, matchers.witnessHeard);
  const victimReported = countPendingStatusItems(safePendingItems, matchers.victimReported);

  return {
    total: Number.isFinite(total) ? total : safePendingItems.length + safeProcessingItems.length,
    pending,
    processing,
    victimIntimated,
    authorIntimated,
    witnessIntimated,
    victimHeard,
    authorHeard,
    victimReported,
    witnessHeard,
    victimReportedDuplicate: victimReported
  };
}

function renderPendingStatusCards(counts) {
  const container = document.getElementById('pendingStatusCards');
  if (!container) {
    return;
  }

  const hasStaticCards = PENDING_STATUS_CARDS.every((card) =>
    Boolean(document.getElementById(`pendingCard-${card.key}`))
  );

  if (hasStaticCards) {
    PENDING_STATUS_CARDS.forEach((card, index) => {
      const value = Number(counts && counts[card.key]);
      const safeValue = Number.isFinite(value) && value >= 0 ? value : 0;
      const valueElement = document.getElementById(`pendingCard-${card.key}`);
      if (valueElement) {
        valueElement.textContent = String(safeValue);
        const cardElement = valueElement.closest('.pending-status-card');
        if (cardElement) {
          cardElement.dataset.cardKey = card.key;
          cardElement.setAttribute('role', 'button');
          cardElement.setAttribute('tabindex', '0');
          cardElement.setAttribute('aria-pressed', pendingState.activeStatusFilterKey === card.key ? 'true' : 'false');
          cardElement.classList.toggle('is-active', pendingState.activeStatusFilterKey === card.key);
          cardElement.classList.toggle('is-clickable', true);
          cardElement.dataset.cardIndex = String(index);
        }
      }
    });

    return;
  }

  container.innerHTML = PENDING_STATUS_CARDS
    .map((card, index) => {
      const value = Number(counts && counts[card.key]);
      const safeValue = Number.isFinite(value) && value >= 0 ? value : 0;
      const isActive = pendingState.activeStatusFilterKey === card.key;

      return `
        <article class="pending-status-card is-clickable${isActive ? ' is-active' : ''}" data-card-key="${escapeHtml(card.key)}" data-card-index="${index}" role="button" tabindex="0" aria-pressed="${isActive ? 'true' : 'false'}">
          <span class="pending-status-card-label">${escapeHtml(card.label)}</span>
          <strong class="pending-status-card-value" id="pendingCard-${escapeHtml(card.key)}">${safeValue}</strong>
        </article>
      `;
    })
    .join('');
}

function readMessageDrafts() {
  try {
    const raw = localStorage.getItem(MESSAGE_DRAFT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
}

function readWhatsappIndictMessage() {
  const drafts = readMessageDrafts();
  return String(drafts.whatsappInfractor || drafts.whatsapp || '').trim();
}

function readWhatsappImageUrl() {
  return String(readMessageDrafts().imageUrl || '').trim();
}

function findPendingItemById(expectedCaseId) {
  const inPending = pendingState.pendingItems.find((item) => Number(item && item.id) === Number(expectedCaseId));
  if (inPending) return inPending;
  
  return pendingState.processingItems.find((item) => Number(item && item.id) === Number(expectedCaseId)) || null;
}

function filterPendingItems(items, query) {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return items;
  }

  return items.filter((item) => {
    const values = [
      item && item.boNumber,
      item && item.flagrante,
      item && item.natureza,
      item && (item.victim || item.victimName),
      item && (item.author || item.authorName),
      item && item.local
    ];

    return values.some((value) => normalizeSearchText(value).includes(normalizedQuery));
  });
}

function renderPendingItems(items, total, query = '') {
  const container = document.getElementById('pendingList');

  if (!items.length) {
    if (query) {
      container.innerHTML = `
        <div class="item empty-state-card">
          <strong>Nenhum BO pendente encontrado</strong>
          <div class="meta">Tente ajustar a pesquisa para localizar o BO desejado.</div>
        </div>
      `;
      return;
    }

    if (total > 0) {
      container.innerHTML = `
        <div class="item empty-state-card">
          <strong>Detalhes indisponiveis no momento</strong>
          <div class="meta">Existem ${total} BO(s) pendente(s), mas os dados detalhados ainda nao foram carregados.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = '<p class="muted">Nenhum BO pendente no momento.</p>';
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const expectedCaseId = Number(item && item.id);
      const canIndict = Number.isInteger(expectedCaseId) && expectedCaseId > 0;
      const boNumber = valueOrDash(item && item.boNumber);
      const flagrante = valueOrDash(item && item.flagrante);
      const natureza = valueOrDash(item && item.natureza);
      const victim = valueOrDash(item && (item.victim || item.victimName));
      const author = valueOrDash(item && (item.author || item.authorName));
      const local = valueOrDash(item && item.local);
      const victimWhatsapp = valueOrEmpty(item && item.victimPhone);
      const authorWhatsapp = valueOrEmpty(item && item.authorPhone);
      const flagranteLabel = flagrante === '-' ? 'Sem flagrante informado' : `Flagrante ${flagrante}`;
      const escapedBoNumber = escapeHtml(boNumber);
      const escapedExpectedCaseId = canIndict ? String(expectedCaseId) : '';
      const savedName = valueOrEmpty(item && item.savedName);
      const sourceName = valueOrEmpty(item && item.sourceName);
      const downloadLabel = sourceName || savedName || 'Arquivo original';
      const downloadHtml = savedName
        ? `<a class="download-original-link" href="/api/admin/dashboard/download-file/${encodeURIComponent(savedName)}" target="_blank" download="${escapeHtml(sourceName || savedName)}">⬇ ${escapeHtml(downloadLabel)}</a>`
        : '';

      return `
        <article class="item bo-card">
          <div class="item-main">
            <div>
              <div class="eyebrow">BO</div>
              <strong>${escapedBoNumber}</strong>
            </div>
            <span class="flag-chip">${escapeHtml(flagranteLabel)}</span>
          </div>
          <div class="natureza">${escapeHtml(natureza)}</div>
          <div class="detail-grid">
            <div class="detail-block">
              <span class="detail-label">Vitima</span>
              <span class="detail-value">${escapeHtml(victim)}</span>
            </div>
            <div class="detail-block">
              <span class="detail-label">Indiciado</span>
              <span class="detail-value">${escapeHtml(author)}</span>
            </div>
            <div class="detail-block detail-block-wide">
              <span class="detail-label">Local</span>
              <span class="detail-value">${escapeHtml(local)}</span>
            </div>
          </div>
          ${downloadHtml ? `<div class="bo-card-download">${downloadHtml}</div>` : ''}

          <form class="upload-pair-form" data-bo-number="${escapedBoNumber}" data-expected-case-id="${escapedExpectedCaseId}">
            <div class="upload-pair-header">
              <strong>Anexos</strong>
              <span class="upload-pair-hint">2 PDFs</span>
            </div>

            <div class="upload-contact-grid">
              <label class="upload-text-field" for="victimWhatsapp-${escapedBoNumber}">
                <span class="detail-label">WhatsApp vitima</span>
                <input id="victimWhatsapp-${escapedBoNumber}" class="upload-text-input" type="tel" name="victimWhatsapp" inputmode="numeric" autocomplete="off" placeholder="11999999999" value="${escapeHtml(victimWhatsapp)}" />
              </label>

              <label class="upload-text-field" for="authorWhatsapp-${escapedBoNumber}">
                <span class="detail-label">WhatsApp indiciado</span>
                <input id="authorWhatsapp-${escapedBoNumber}" class="upload-text-input" type="tel" name="authorWhatsapp" inputmode="numeric" autocomplete="off" placeholder="11999999999" value="${escapeHtml(authorWhatsapp)}" />
              </label>
            </div>

            <div class="upload-pair-grid">
              <label class="upload-file-field" for="boFile-${escapedBoNumber}">
                <span class="detail-label">BO</span>
                <input class="upload-file-input" id="boFile-${escapedBoNumber}" type="file" name="bo" accept="application/pdf" required />
                <span class="upload-file-shell">
                  <span class="upload-file-placeholder">Selecionar PDF</span>
                  <span class="upload-file-name" data-empty-label="Nenhum arquivo">Nenhum arquivo</span>
                </span>
              </label>

              <label class="upload-file-field" for="extratoFile-${escapedBoNumber}">
                <span class="detail-label">Extrato</span>
                <input class="upload-file-input" id="extratoFile-${escapedBoNumber}" type="file" name="extrato" accept="application/pdf" required />
                <span class="upload-file-shell">
                  <span class="upload-file-placeholder">Selecionar PDF</span>
                  <span class="upload-file-name" data-empty-label="Nenhum arquivo">Nenhum arquivo</span>
                </span>
              </label>
            </div>

            <div class="upload-pair-actions">
              <button type="submit" class="upload-pair-btn">Enviar documentos</button>
              <button type="button" class="upload-pair-btn upload-pair-btn-secondary pending-indict-btn" ${canIndict ? '' : 'disabled'}>Indiciar</button>
              <span class="upload-pair-status muted" aria-live="polite"></span>
            </div>
          </form>
        </article>
      `;
    })
    .join('');
}

function applyPendingFilter() {
  const input = document.getElementById('pendingSearchInput');
  const query = input ? input.value : '';
  
  let allItems = pendingState.pendingItems;
  if (pendingState.activeStatusFilterKey === 'processing') {
    allItems = pendingState.processingItems;
  }
  
  const queryFilteredItems = filterPendingItems(allItems, query);
  const matchers = buildPendingStatusMatchers(pendingState.total);
  const activeMatcher = pendingState.activeStatusFilterKey && pendingState.activeStatusFilterKey !== 'processing'
    ? matchers[pendingState.activeStatusFilterKey]
    : null;

  const filteredItems = typeof activeMatcher === 'function'
    ? queryFilteredItems.filter((item) => activeMatcher(item))
    : queryFilteredItems;

  document.getElementById('pendingVisibleCount').textContent = String(filteredItems.length);
  renderPendingItems(filteredItems, pendingState.total, query);
}

function handleStatusCardClick(cardKey) {
  if (!cardKey) {
    return;
  }

  pendingState.activeStatusFilterKey = pendingState.activeStatusFilterKey === cardKey
    ? null
    : cardKey;

  renderPendingStatusCards(buildPendingStatusCounts(pendingState.pendingItems, pendingState.processingItems, pendingState.total));
  applyPendingFilter();
}

async function loadPendingCases() {
  const token = localStorage.getItem('adminAccessToken');
  if (!token) {
    window.location.href = '/admin';
    return;
  }

  try {
    const pendingResponse = await fetch('/api/admin/dashboard/pending-cases', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (pendingResponse.status === 401 || pendingResponse.status === 403) {
      localStorage.removeItem('adminAccessToken');
      window.location.href = '/admin';
      return;
    }

    if (!pendingResponse.ok) {
      throw new Error('Falha ao carregar BOs pendentes.');
    }

    const processingResponse = await fetch('/api/admin/dashboard/processing-cases', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    let pendingItems = [];
    let processingItems = [];
    let total = 0;

    const pendingData = await pendingResponse.json();
    pendingItems = Array.isArray(pendingData && pendingData.items) ? pendingData.items : [];

    if (processingResponse.ok) {
      const processingData = await processingResponse.json();
      processingItems = Array.isArray(processingData && processingData.items) ? processingData.items : [];
    }

    total = pendingItems.length + processingItems.length;

    if (pendingData && pendingData.mocked && !pendingItems.length) {
      const devBos = readDevPendingBos();
      pendingItems = devBos;
      total = readDevPendingCases() || pendingItems.length;
    }

    pendingState.pendingItems = pendingItems;
    pendingState.processingItems = processingItems;
    pendingState.total = total;
    document.getElementById('pendingCount').textContent = String(total);
    renderPendingStatusCards(buildPendingStatusCounts(pendingItems, processingItems, total));
    applyPendingFilter();
  } catch (error) {
    console.error('Erro ao carregar casos:', error);
    throw error;
  }
}

async function submitPairUpload(form) {
  const token = localStorage.getItem('adminAccessToken');
  if (!token) {
    window.location.href = '/admin';
    return;
  }

  const boInput = form.querySelector('input[name="bo"]');
  const extratoInput = form.querySelector('input[name="extrato"]');
  const victimWhatsappInput = form.querySelector('input[name="victimWhatsapp"]');
  const authorWhatsappInput = form.querySelector('input[name="authorWhatsapp"]');
  const statusElement = form.querySelector('.upload-pair-status');
  const submitButton = form.querySelector('button[type="submit"]');
  const boNumber = form.dataset.boNumber || 'este BO';

  if (!boInput || !boInput.files || !boInput.files.length || !extratoInput || !extratoInput.files || !extratoInput.files.length) {
    throw new Error('Selecione os dois PDFs antes de enviar.');
  }

  const formData = new FormData();
  formData.append('bo', boInput.files[0]);
  formData.append('extrato', extratoInput.files[0]);

  const victimWhatsapp = victimWhatsappInput ? String(victimWhatsappInput.value || '').trim() : '';
  const authorWhatsapp = authorWhatsappInput ? String(authorWhatsappInput.value || '').trim() : '';

  if (victimWhatsapp) {
    formData.append('victimWhatsapp', victimWhatsapp);
  }

  if (authorWhatsapp) {
    formData.append('authorWhatsapp', authorWhatsapp);
  }

  setPendingActionState(form, true);
  statusElement.textContent = `Enviando documentos do BO ${boNumber}...`;

  try {
    const response = await fetch('/api/pdfs/import-pair', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('adminAccessToken');
      window.location.href = '/admin';
      return;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Falha ao enviar os documentos do BO.');
    }

    statusElement.textContent = `Documentos do BO ${boNumber} enviados com sucesso.`;
    form.reset();
    await loadPendingCases();
  } finally {
    if (form.isConnected) {
      setPendingActionState(form, false);
    }
  }
}

function setPendingActionState(form, disabled) {
  form.querySelectorAll('button').forEach((button) => {
    button.disabled = disabled;
  });
}

async function submitIndictAction(form) {
  const token = localStorage.getItem('adminAccessToken');
  if (!token) {
    window.location.href = '/admin';
    return;
  }

  const expectedCaseId = Number(form.dataset.expectedCaseId);
  const statusElement = form.querySelector('.upload-pair-status');
  const boNumber = form.dataset.boNumber || 'este BO';
  const authorWhatsappInput = form.querySelector('input[name="authorWhatsapp"]');
  const pendingItem = findPendingItemById(expectedCaseId);
  const fallbackAuthorWhatsapp = valueOrEmpty(pendingItem && pendingItem.authorPhone);
  const authorWhatsapp = valueOrEmpty(authorWhatsappInput && authorWhatsappInput.value) || fallbackAuthorWhatsapp;
  const messageTemplate = readWhatsappIndictMessage();

  if (!Number.isInteger(expectedCaseId) || expectedCaseId <= 0) {
    throw new Error('Este BO ainda nao pode ser indiciado.');
  }

  if (!messageTemplate) {
    throw new Error('Salve primeiro a mensagem na aba Mensagens antes de indiciar.');
  }

  if (!authorWhatsapp) {
    throw new Error('Informe o WhatsApp do indiciado antes de indiciar.');
  }

  setPendingActionState(form, true);
  statusElement.textContent = `Enviando mensagem e encaminhando BO ${boNumber} para indiciamento...`;

  try {
    const response = await fetch(`/api/admin/dashboard/pending-cases/${expectedCaseId}/indict`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        authorWhatsapp,
        messageTemplate,
        publicBaseUrl: window.location.origin
      })
    });

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('adminAccessToken');
      window.location.href = '/admin';
      return;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Falha ao indiciar o BO.');
    }

    statusElement.textContent = data.message || `BO ${boNumber} encaminhado para indiciamento.`;
    await loadPendingCases();
  } finally {
    if (form.isConnected) {
      setPendingActionState(form, false);
    }
  }
}

document.getElementById('refreshBtn').addEventListener('click', () => {
  loadPendingCases().catch((error) => {
    alert(error.message);
  });
});

document.getElementById('pendingSearchInput').addEventListener('input', () => {
  applyPendingFilter();
});

document.getElementById('pendingStatusCards').addEventListener('click', (event) => {
  const card = event.target.closest('.pending-status-card');
  if (!card || !card.dataset.cardKey) {
    return;
  }

  handleStatusCardClick(card.dataset.cardKey);
});

document.getElementById('pendingStatusCards').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }

  const card = event.target.closest('.pending-status-card');
  if (!card || !card.dataset.cardKey) {
    return;
  }

  event.preventDefault();
  handleStatusCardClick(card.dataset.cardKey);
});

document.getElementById('pendingList').addEventListener('change', (event) => {
  const input = event.target.closest('.upload-file-input');
  if (!input) {
    return;
  }

  const field = input.closest('.upload-file-field');
  const fileNameElement = field ? field.querySelector('.upload-file-name') : null;
  if (!fileNameElement) {
    return;
  }

  const file = input.files && input.files[0];
  fileNameElement.textContent = file ? file.name : (fileNameElement.dataset.emptyLabel || 'Nenhum arquivo');
});

document.getElementById('pendingList').addEventListener('submit', (event) => {
  const form = event.target.closest('.upload-pair-form');
  if (!form) {
    return;
  }

  event.preventDefault();
  submitPairUpload(form).catch((error) => {
    const statusElement = form.querySelector('.upload-pair-status');
    if (form.isConnected) {
      setPendingActionState(form, false);
    }
    if (statusElement) {
      statusElement.textContent = error.message || 'Falha ao enviar os documentos.';
    } else {
      alert(error.message);
    }
  });
});

document.getElementById('pendingList').addEventListener('click', (event) => {
  const button = event.target.closest('.pending-indict-btn');
  if (!button) {
    return;
  }

  const form = button.closest('.upload-pair-form');
  if (!form) {
    return;
  }

  const boNumber = form.dataset.boNumber || 'este BO';
  const shouldProceed = window.confirm(`Deseja enviar a mensagem do WhatsApp e encaminhar o BO ${boNumber} para indiciamento?`);
  if (!shouldProceed) {
    return;
  }

  submitIndictAction(form).catch((error) => {
    if (form.isConnected) {
      setPendingActionState(form, false);
    }

    const statusElement = form.querySelector('.upload-pair-status');
    if (statusElement) {
      statusElement.textContent = error.message || 'Falha ao indiciar o BO.';
    } else {
      alert(error.message);
    }
  });
});

loadPendingCases().catch((error) => {
  alert(error.message);
});
