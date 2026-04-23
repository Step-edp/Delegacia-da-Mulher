function valueOrDash(value) {
  const text = value == null ? '' : String(value).trim();
  return text || '-';
}

function padNumber(value) {
  return String(value).padStart(2, '0');
}

function buildDateKey(date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function buildMonthKey(date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}`;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function parseDateKey(dateKey) {
  const match = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function toDateKeyFromIso(isoDate) {
  if (!isoDate) {
    return null;
  }

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return buildDateKey(date);
}

function formatDateLabel(date) {
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function formatTime(isoDate) {
  if (!isoDate) {
    return '-';
  }

  return new Date(isoDate).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatTimeRange(startIso, endIso) {
  return `${formatTime(startIso)} às ${formatTime(endIso)}`;
}

function formatMonthLabel(date) {
  return date.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric'
  });
}

function buildStatusClass(status) {
  const normalized = String(status || '').trim().toUpperCase();

  if (normalized === 'CONFIRMADO') {
    return 'status-chip-confirmed';
  }

  if (normalized === 'CANCELADO') {
    return 'status-chip-cancelled';
  }

  return 'status-chip-scheduled';
}

const agendaState = {
  monthDate: startOfMonth(new Date()),
  selectedDateKey: null,
  items: []
};

const availabilityState = {
  slots: []
};

const agendaSettingsState = {
  victimAuthorGapHours: 0,
  authorSummonsMaxDays: 3,
  summonsMaxAttempts: 3,
  summonsIntervalHours: 12
};

function groupAgendaItemsByDate(items) {
  return (Array.isArray(items) ? items : []).reduce((map, item) => {
    const dateKey = item && item.dateKey ? item.dateKey : toDateKeyFromIso(item && item.startsAt);
    if (!dateKey) {
      return map;
    }

    if (!map.has(dateKey)) {
      map.set(dateKey, []);
    }

    map.get(dateKey).push(item);
    return map;
  }, new Map());
}

function buildSelectedDayLabel(items) {
  const count = Array.isArray(items) ? items.length : 0;
  return `${count} ${count === 1 ? 'agendamento' : 'agendamentos'}`;
}

function formatGapRuleLabel(hours) {
  const value = Number(hours) || 0;
  return `${value} ${value === 1 ? 'hora' : 'horas'}`;
}

function formatSummonsMaxDaysLabel(days) {
  const value = Number(days) || 0;
  return `${value} ${value === 1 ? 'dia' : 'dias'}`;
}

function formatHoursLabel(hours) {
  const value = Number(hours) || 0;
  return `${value} ${value === 1 ? 'hora' : 'horas'}`;
}

function renderAgendaList(items) {
  const container = document.getElementById('agendaList');

  if (!Array.isArray(items) || !items.length) {
    container.innerHTML = '<p class="muted">Nenhum agendamento para o dia selecionado.</p>';
    return;
  }

  container.innerHTML = items
    .map((item) => `
      <article class="item agenda-card">
        <div class="agenda-card-header">
          <div>
            <div class="eyebrow">Agendamento</div>
            <strong>${valueOrDash(item.personName)}</strong>
          </div>
          <span class="status-chip ${buildStatusClass(item.status)}">${valueOrDash(item.status)}</span>
        </div>
        <div class="agenda-chip-row">
          <span class="agenda-chip">${valueOrDash(item.appointmentType)}</span>
          <span class="agenda-chip">${valueOrDash(item.personRole)}</span>
        </div>
        <div class="agenda-meta"><strong>Horário:</strong> ${formatTimeRange(item.startsAt, item.endsAt)}</div>
      </article>
    `)
    .join('');
}

function renderAvailabilityList(slots) {
  const container = document.getElementById('availabilityList');

  if (!Array.isArray(slots) || !slots.length) {
    container.innerHTML = '<p class="muted">Nenhum horário disponível para a data selecionada.</p>';
    return;
  }

  container.innerHTML = slots
    .map((slot) => `
      <article class="item availability-card">
        <div class="availability-card-header">
          <strong>${formatTimeRange(slot.startsAt, slot.endsAt)}</strong>
          <span class="status-chip ${buildStatusClass(slot.status)}">${valueOrDash(slot.status)}</span>
        </div>
      </article>
    `)
    .join('');
}

function updateAgendaSummary(groupedItems) {
  const selectedDate = parseDateKey(agendaState.selectedDateKey);
  const selectedItems = groupedItems.get(agendaState.selectedDateKey) || [];

  document.getElementById('agendaMonthCount').textContent = String(agendaState.items.length);
  document.getElementById('agendaDaysCount').textContent = String(groupedItems.size);
  document.getElementById('agendaSelectedCount').textContent = String(selectedItems.length);
  document.getElementById('agendaMonthLabel').textContent = formatMonthLabel(agendaState.monthDate);
  document.getElementById('agendaSelectedDateLabel').textContent = selectedDate ? formatDateLabel(selectedDate) : '-';
  document.getElementById('agendaDayTitle').textContent = selectedDate ? formatDateLabel(selectedDate) : '-';
  document.getElementById('agendaDayBadge').textContent = buildSelectedDayLabel(selectedItems);
}

function resolveDefaultSelectedDate(items) {
  const groupedItems = groupAgendaItemsByDate(items);
  const monthKey = buildMonthKey(agendaState.monthDate);
  const today = new Date();
  const todayKey = buildDateKey(today);

  if (buildMonthKey(today) === monthKey) {
    return todayKey;
  }

  const firstDateWithAppointments = [...groupedItems.keys()].sort()[0];
  if (firstDateWithAppointments) {
    return firstDateWithAppointments;
  }

  return `${monthKey}-01`;
}

function renderCalendarGrid(groupedItems) {
  const container = document.getElementById('agendaCalendarGrid');
  const year = agendaState.monthDate.getFullYear();
  const monthIndex = agendaState.monthDate.getMonth();
  const firstDayOfMonth = new Date(year, monthIndex, 1);
  const firstWeekday = firstDayOfMonth.getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const daysInPreviousMonth = new Date(year, monthIndex, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const todayKey = buildDateKey(new Date());

  const cells = [];
  for (let index = 0; index < totalCells; index += 1) {
    const dayNumber = index - firstWeekday + 1;
    const isCurrentMonth = dayNumber >= 1 && dayNumber <= daysInMonth;
    const date = isCurrentMonth
      ? new Date(year, monthIndex, dayNumber)
      : dayNumber < 1
        ? new Date(year, monthIndex - 1, daysInPreviousMonth + dayNumber)
        : new Date(year, monthIndex + 1, dayNumber - daysInMonth);
    const dateKey = buildDateKey(date);
    const items = groupedItems.get(dateKey) || [];
    const isSelected = dateKey === agendaState.selectedDateKey;
    const isToday = dateKey === todayKey;

    cells.push(`
      <button
        type="button"
        class="agenda-day-cell ${isCurrentMonth ? '' : 'agenda-day-cell-outside'} ${items.length ? 'agenda-day-cell-has-items' : ''} ${isSelected ? 'agenda-day-cell-selected' : ''} ${isToday ? 'agenda-day-cell-today' : ''}"
        data-date-key="${dateKey}"
        ${isCurrentMonth ? '' : 'data-outside-month="true"'}
      >
        <span class="agenda-day-number">${date.getDate()}</span>
        <span class="agenda-day-count">${items.length ? `${items.length} ag.` : ''}</span>
      </button>
    `);
  }

  container.innerHTML = cells.join('');
}

function renderAgendaPage() {
  const groupedItems = groupAgendaItemsByDate(agendaState.items);
  const selectedItems = groupedItems.get(agendaState.selectedDateKey) || [];

  updateAgendaSummary(groupedItems);
  renderCalendarGrid(groupedItems);
  renderAgendaList(selectedItems);
}

function updateAvailabilitySummary() {
  const input = document.getElementById('availabilityDateInput');
  const selectedDate = parseDateKey(input.value || agendaState.selectedDateKey);
  document.getElementById('availabilityDateLabel').textContent = selectedDate ? formatDateLabel(selectedDate) : '-';
  document.getElementById('availabilityCount').textContent = String(availabilityState.slots.length);
}

function renderGapRuleSettings() {
  document.getElementById('gapRuleHoursInput').value = String(agendaSettingsState.victimAuthorGapHours);
  document.getElementById('authorSummonsMaxDaysInput').value = String(agendaSettingsState.authorSummonsMaxDays);
  document.getElementById('summonsMaxAttemptsInput').value = String(agendaSettingsState.summonsMaxAttempts);
  document.getElementById('summonsIntervalHoursInput').value = String(agendaSettingsState.summonsIntervalHours);
  document.getElementById('gapRuleSummary').textContent = formatGapRuleLabel(agendaSettingsState.victimAuthorGapHours);
  document.getElementById('authorSummonsMaxDaysSummary').textContent = formatSummonsMaxDaysLabel(agendaSettingsState.authorSummonsMaxDays);
  document.getElementById('summonsMaxAttemptsSummary').textContent = String(agendaSettingsState.summonsMaxAttempts);
  document.getElementById('summonsIntervalHoursSummary').textContent = formatHoursLabel(agendaSettingsState.summonsIntervalHours);
}

function syncAvailabilityDateInput(dateKey) {
  const input = document.getElementById('availabilityDateInput');
  if (input && dateKey) {
    input.value = dateKey;
  }

  updateAvailabilitySummary();
}

async function fetchAvailabilityForDate(dateKey) {
  const token = localStorage.getItem('adminAccessToken');
  if (!token) {
    window.location.href = '/admin';
    return null;
  }

  const response = await fetch(`/api/admin/dashboard/agenda-availability?date=${encodeURIComponent(dateKey)}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem('adminAccessToken');
    window.location.href = '/admin';
    return null;
  }

  if (!response.ok) {
    throw new Error('Falha ao carregar disponibilidade de agendamento.');
  }

  return response.json();
}

async function loadAvailabilityForDate(dateKey) {
  if (!dateKey) {
    availabilityState.slots = [];
    syncAvailabilityDateInput(null);
    renderAvailabilityList([]);
    return;
  }

  syncAvailabilityDateInput(dateKey);
  const data = await fetchAvailabilityForDate(dateKey);
  if (!data) {
    return;
  }

  availabilityState.slots = Array.isArray(data && data.slots) ? data.slots : [];
  updateAvailabilitySummary();
  renderAvailabilityList(availabilityState.slots);
}

async function createAvailability(payload) {
  const token = localStorage.getItem('adminAccessToken');
  if (!token) {
    window.location.href = '/admin';
    return null;
  }

  const response = await fetch('/api/admin/dashboard/agenda-availability', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem('adminAccessToken');
    window.location.href = '/admin';
    return null;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Falha ao salvar disponibilidade.');
  }

  return data;
}

async function fetchAgendaSettings() {
  const token = localStorage.getItem('adminAccessToken');
  if (!token) {
    window.location.href = '/admin';
    return null;
  }

  const response = await fetch('/api/admin/dashboard/agenda-settings', {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem('adminAccessToken');
    window.location.href = '/admin';
    return null;
  }

  if (!response.ok) {
    throw new Error('Falha ao carregar regra de agendamento.');
  }

  return response.json();
}

async function saveAgendaSettings(payload) {
  const token = localStorage.getItem('adminAccessToken');
  if (!token) {
    window.location.href = '/admin';
    return null;
  }

  const response = await fetch('/api/admin/dashboard/agenda-settings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem('adminAccessToken');
    window.location.href = '/admin';
    return null;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Falha ao salvar regra de agendamento.');
  }

  return data;
}

async function fetchAgendaMonth() {
  const token = localStorage.getItem('adminAccessToken');
  if (!token) {
    window.location.href = '/admin';
    return null;
  }

  const monthKey = buildMonthKey(agendaState.monthDate);
  const response = await fetch(`/api/admin/dashboard/agenda-calendar?month=${encodeURIComponent(monthKey)}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem('adminAccessToken');
    window.location.href = '/admin';
    return null;
  }

  if (!response.ok) {
    throw new Error('Falha ao carregar agenda.');
  }

  return response.json();
}

async function loadAgendaPage(preferredDateKey) {
  const data = await fetchAgendaMonth();
  if (!data) {
    return;
  }

  agendaState.items = Array.isArray(data && data.items) ? data.items : [];
  agendaState.selectedDateKey = preferredDateKey || resolveDefaultSelectedDate(agendaState.items);
  renderAgendaPage();
  await loadAvailabilityForDate(agendaState.selectedDateKey);
}

async function loadAgendaSettings() {
  const data = await fetchAgendaSettings();
  if (!data) {
    return;
  }

  agendaSettingsState.victimAuthorGapHours = Number(data && data.victimAuthorGapHours) || 0;
  agendaSettingsState.authorSummonsMaxDays = Number(data && data.authorSummonsMaxDays);
  agendaSettingsState.summonsMaxAttempts = Number(data && data.summonsMaxAttempts);
  agendaSettingsState.summonsIntervalHours = Number(data && data.summonsIntervalHours);
  if (!Number.isInteger(agendaSettingsState.authorSummonsMaxDays) || agendaSettingsState.authorSummonsMaxDays < 0) {
    agendaSettingsState.authorSummonsMaxDays = 3;
  }
  if (!Number.isInteger(agendaSettingsState.summonsMaxAttempts) || agendaSettingsState.summonsMaxAttempts < 1) {
    agendaSettingsState.summonsMaxAttempts = 3;
  }
  if (!Number.isInteger(agendaSettingsState.summonsIntervalHours) || agendaSettingsState.summonsIntervalHours < 1) {
    agendaSettingsState.summonsIntervalHours = 12;
  }
  renderGapRuleSettings();
}

document.getElementById('refreshBtn').addEventListener('click', () => {
  Promise.all([loadAgendaPage(), loadAgendaSettings()]).catch((error) => {
    alert(error.message);
  });
});

document.getElementById('prevMonthBtn').addEventListener('click', () => {
  agendaState.monthDate = startOfMonth(addMonths(agendaState.monthDate, -1));
  loadAgendaPage().catch((error) => {
    alert(error.message);
  });
});

document.getElementById('nextMonthBtn').addEventListener('click', () => {
  agendaState.monthDate = startOfMonth(addMonths(agendaState.monthDate, 1));
  loadAgendaPage().catch((error) => {
    alert(error.message);
  });
});

document.getElementById('agendaCalendarGrid').addEventListener('click', (event) => {
  const button = event.target.closest('.agenda-day-cell[data-date-key]');
  if (!button) {
    return;
  }

  const dateKey = button.dataset.dateKey;
  const targetDate = parseDateKey(dateKey);
  if (!targetDate) {
    return;
  }

  if (button.dataset.outsideMonth === 'true') {
    agendaState.monthDate = startOfMonth(targetDate);
    agendaState.selectedDateKey = buildDateKey(targetDate);
    loadAgendaPage(buildDateKey(targetDate)).catch((error) => {
      alert(error.message);
    });
    return;
  }

  agendaState.selectedDateKey = dateKey;
  renderAgendaPage();
  loadAvailabilityForDate(dateKey).catch((error) => {
    alert(error.message);
  });
});

document.getElementById('availabilityDateInput').addEventListener('change', (event) => {
  const dateKey = String(event.target.value || '').trim();
  if (!dateKey) {
    return;
  }

  const selectedDate = parseDateKey(dateKey);
  if (!selectedDate) {
    return;
  }

  agendaState.selectedDateKey = dateKey;
  if (buildMonthKey(selectedDate) !== buildMonthKey(agendaState.monthDate)) {
    agendaState.monthDate = startOfMonth(selectedDate);
    loadAgendaPage(dateKey).catch((error) => {
      alert(error.message);
    });
    return;
  }

  renderAgendaPage();
  loadAvailabilityForDate(dateKey).catch((error) => {
    alert(error.message);
  });
});

document.getElementById('availabilityForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  const submitButton = document.getElementById('availabilitySubmitBtn');
  const statusElement = document.getElementById('availabilityStatus');
  const payload = {
    date: document.getElementById('availabilityDateInput').value,
    startTime: document.getElementById('availabilityStartTimeInput').value,
    endTime: document.getElementById('availabilityEndTimeInput').value,
    intervalMinutes: Number(document.getElementById('availabilityIntervalInput').value || 30)
  };

  submitButton.disabled = true;
  statusElement.textContent = 'Salvando disponibilidade...';

  try {
    const result = await createAvailability(payload);
    if (!result) {
      return;
    }

    const createdCount = Number(result.createdCount);
    statusElement.textContent = Number.isFinite(createdCount) && createdCount > 0
      ? `${createdCount} horário(s) liberado(s) para ${payload.date}.`
      : `Nenhum novo horário foi criado para ${payload.date}.`;

    agendaState.selectedDateKey = payload.date;
    if (buildMonthKey(parseDateKey(payload.date)) !== buildMonthKey(agendaState.monthDate)) {
      agendaState.monthDate = startOfMonth(parseDateKey(payload.date));
      await loadAgendaPage(payload.date);
      return;
    }

    renderAgendaPage();
    await loadAvailabilityForDate(payload.date);
  } catch (error) {
    statusElement.textContent = error.message || 'Falha ao salvar disponibilidade.';
  } finally {
    submitButton.disabled = false;
  }
});

document.getElementById('gapRuleForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  const submitButton = document.getElementById('gapRuleSubmitBtn');
  const statusElement = document.getElementById('gapRuleStatus');
  const payload = {
    victimAuthorGapHours: Number(document.getElementById('gapRuleHoursInput').value || 0),
    authorSummonsMaxDays: Number(document.getElementById('authorSummonsMaxDaysInput').value || 0),
    summonsMaxAttempts: Number(document.getElementById('summonsMaxAttemptsInput').value || 3),
    summonsIntervalHours: Number(document.getElementById('summonsIntervalHoursInput').value || 12)
  };

  submitButton.disabled = true;
  statusElement.textContent = 'Salvando regra...';

  try {
    const result = await saveAgendaSettings(payload);
    if (!result) {
      return;
    }

    agendaSettingsState.victimAuthorGapHours = Number(result.victimAuthorGapHours) || 0;
    agendaSettingsState.authorSummonsMaxDays = Number(result.authorSummonsMaxDays);
    agendaSettingsState.summonsMaxAttempts = Number(result.summonsMaxAttempts);
    agendaSettingsState.summonsIntervalHours = Number(result.summonsIntervalHours);
    if (!Number.isInteger(agendaSettingsState.authorSummonsMaxDays) || agendaSettingsState.authorSummonsMaxDays < 0) {
      agendaSettingsState.authorSummonsMaxDays = 3;
    }
    if (!Number.isInteger(agendaSettingsState.summonsMaxAttempts) || agendaSettingsState.summonsMaxAttempts < 1) {
      agendaSettingsState.summonsMaxAttempts = 3;
    }
    if (!Number.isInteger(agendaSettingsState.summonsIntervalHours) || agendaSettingsState.summonsIntervalHours < 1) {
      agendaSettingsState.summonsIntervalHours = 12;
    }
    renderGapRuleSettings();
    statusElement.textContent = `Regras atualizadas: ${formatGapRuleLabel(agendaSettingsState.victimAuthorGapHours)} entre vítima e infrator, ${formatSummonsMaxDaysLabel(agendaSettingsState.authorSummonsMaxDays)} de prazo do infrator, ${agendaSettingsState.summonsMaxAttempts} tentativa(s) e intervalo de ${formatHoursLabel(agendaSettingsState.summonsIntervalHours)}.`;
  } catch (error) {
    statusElement.textContent = error.message || 'Falha ao salvar regra de agendamento.';
  } finally {
    submitButton.disabled = false;
  }
});

Promise.all([loadAgendaPage(), loadAgendaSettings()]).catch((error) => {
  alert(error.message);
});