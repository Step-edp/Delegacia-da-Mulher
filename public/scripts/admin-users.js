function formatDateTime(isoDate) {
  if (!isoDate) {
    return '-';
  }

  return new Date(isoDate).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function valueOrDash(value) {
  const text = value == null ? '' : String(value).trim();
  return text || '-';
}

function syncUsersCountCache(total) {
  try {
    const raw = localStorage.getItem('adminDashboardSummary');
    const cached = raw ? JSON.parse(raw) : {};
    cached.activeUsers = Number(total) || 0;
    localStorage.setItem('adminDashboardSummary', JSON.stringify(cached));
  } catch (error) {
    // Ignore cache sync failures.
  }
}

function renderUsers(items) {
  const container = document.getElementById('usersList');

  if (!items.length) {
    container.innerHTML = `
      <article class="item user-card empty-state-card">
        <strong>Nenhum usuario ativo</strong>
        <div class="meta">Ainda nao ha usuarios aprovados para acesso.</div>
      </article>
    `;
    return;
  }

  container.innerHTML = items
    .map((item) => `
      <article class="item user-card">
        <div class="user-card-header">
          <div>
            <div class="eyebrow">Usuario</div>
            <strong>${valueOrDash(item.fullName)}</strong>
          </div>
          <span class="role-badge">${valueOrDash(item.role)}</span>
        </div>

        <div class="user-detail-grid">
          <div class="detail-block">
            <span class="detail-label">CPF</span>
            <span>${valueOrDash(item.cpf)}</span>
          </div>
          <div class="detail-block">
            <span class="detail-label">Telefone</span>
            <span>${valueOrDash(item.phone)}</span>
          </div>
          <div class="detail-block detail-block-wide">
            <span class="detail-label">E-mail</span>
            <span>${valueOrDash(item.email)}</span>
          </div>
        </div>

        <div class="user-card-footer">
          <div class="meta">Liberado em ${formatDateTime(item.updatedAt || item.createdAt)}</div>
          <span class="status-badge">Ativo</span>
        </div>
      </article>
    `)
    .join('');
}

async function loadUsers() {
  const token = localStorage.getItem('adminAccessToken');
  if (!token) {
    window.location.href = '/admin';
    return;
  }

  const response = await fetch('/api/admin/dashboard/users', {
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
    throw new Error('Falha ao carregar usuarios.');
  }

  const data = await response.json();
  const items = Array.isArray(data && data.items) ? data.items : [];
  const total = Number.isFinite(Number(data && data.total)) ? Number(data.total) : items.length;

  document.getElementById('usersCount').textContent = String(total);
  syncUsersCountCache(total);
  renderUsers(items);
}

document.getElementById('refreshBtn').addEventListener('click', () => {
  loadUsers().catch((error) => {
    alert(error.message);
  });
});

loadUsers().catch((error) => {
  alert(error.message);
});