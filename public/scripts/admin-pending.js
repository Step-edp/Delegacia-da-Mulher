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

function renderPendingItems(items, total) {
  const container = document.getElementById('pendingList');

  if (!items.length) {
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

  const valueOrDash = (value) => {
    const text = value == null ? '' : String(value).trim();
    return text || '-';
  };

  container.innerHTML = items
    .map((item) => {
      const boNumber = valueOrDash(item && item.boNumber);
      const flagrante = valueOrDash(item && item.flagrante);
      const natureza = valueOrDash(item && item.natureza);
      const victim = valueOrDash(item && (item.victim || item.victimName));
      const author = valueOrDash(item && (item.author || item.authorName));
      const local = valueOrDash(item && item.local);
      const flagranteLabel = flagrante === '-' ? 'Sem flagrante informado' : `Flagrante ${flagrante}`;

      return `
        <article class="item bo-card">
          <div class="item-main">
            <div>
              <div class="eyebrow">BO</div>
              <strong>${boNumber}</strong>
            </div>
            <span class="flag-chip">${flagranteLabel}</span>
          </div>
          <div class="natureza">${natureza}</div>
          <div class="detail-grid">
            <div class="detail-block">
              <span class="detail-label">Vitima</span>
              <span>${victim}</span>
            </div>
            <div class="detail-block">
              <span class="detail-label">Indiciado</span>
              <span>${author}</span>
            </div>
            <div class="detail-block detail-block-wide">
              <span class="detail-label">Local</span>
              <span>${local}</span>
            </div>
          </div>
        </article>
      `;
    })
    .join('');
}

async function loadPendingCases() {
  const token = localStorage.getItem('adminAccessToken');
  if (!token) {
    window.location.href = '/admin';
    return;
  }

  const response = await fetch('/api/admin/dashboard/pending-cases', {
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
    throw new Error('Falha ao carregar BOs pendentes.');
  }

  const data = await response.json();
  let items = Array.isArray(data && data.items) ? data.items : [];
  const responseTotal = Number(data && data.total);
  let total = Number.isFinite(responseTotal) ? responseTotal : items.length;

  if (data && data.mocked && !items.length && !Number.isFinite(responseTotal)) {
    const devBos = readDevPendingBos();
    items = devBos;
    total = readDevPendingCases() || items.length;
  }

  document.getElementById('pendingCount').textContent = String(total);
  renderPendingItems(items, total);
}

document.getElementById('refreshBtn').addEventListener('click', () => {
  loadPendingCases().catch((error) => {
    alert(error.message);
  });
});

loadPendingCases().catch((error) => {
  alert(error.message);
});
