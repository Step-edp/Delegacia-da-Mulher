function getAuthToken() {
  return localStorage.getItem('adminAccessToken');
}

function setStatus(message, isError) {
  const element = document.getElementById('certificateStatus');
  if (!element) {
    return;
  }
  element.textContent = message;
  element.classList.toggle('draft-status-error', Boolean(isError));
}

function readBoNumber() {
  return String(document.getElementById('boNumberInput').value || '').trim();
}

function renderHistory(result) {
  const container = document.getElementById('historyContainer');
  const events = Array.isArray(result && result.events) ? result.events : [];

  if (!events.length) {
    container.innerHTML = '<p class="muted">Nenhum evento registrado para este caso.</p>';
    return;
  }

  container.innerHTML = events.map((event) => {
    const when = event && event.occurredAt
      ? new Date(event.occurredAt).toLocaleString('pt-BR')
      : '-';
    return '<article class="item">'
      + '<strong>' + String(event.label || event.eventType || 'Evento') + '</strong>'
      + '<p class="muted">' + when + '</p>'
      + '</article>';
  }).join('');
}

async function loadHistory() {
  const token = getAuthToken();
  if (!token) {
    window.location.href = '/admin';
    return;
  }

  const boNumber = readBoNumber();
  if (!boNumber) {
    setStatus('Informe um numero de BO valido.', true);
    return;
  }

  setStatus('Carregando histórico...', false);

  try {
    const response = await fetch('/api/summons-events/history/by-bo?bo=' + encodeURIComponent(boNumber), {
      headers: {
        Authorization: 'Bearer ' + token
      }
    });

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('adminAccessToken');
      window.location.href = '/admin';
      return;
    }

    const data = await response.json().catch(function () {
      return {};
    });

    if (!response.ok) {
      throw new Error(data.error || 'Falha ao carregar histórico.');
    }

    renderHistory(data);
    document.getElementById('downloadCertificateBtn').disabled = false;
    setStatus('Histórico carregado.', false);
  } catch (error) {
    setStatus(error.message || 'Falha ao carregar histórico.', true);
  }
}

async function downloadCertificate() {
  const token = getAuthToken();
  if (!token) {
    window.location.href = '/admin';
    return;
  }

  const boNumber = readBoNumber();
  if (!boNumber) {
    setStatus('Informe um numero de BO valido.', true);
    return;
  }

  setStatus('Gerando certificado PDF...', false);

  try {
    const response = await fetch('/api/summons-events/certificate/by-bo?bo=' + encodeURIComponent(boNumber), {
      headers: {
        Authorization: 'Bearer ' + token
      }
    });

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('adminAccessToken');
      window.location.href = '/admin';
      return;
    }

    if (!response.ok) {
      const body = await response.json().catch(function () {
        return {};
      });
      throw new Error(body.error || 'Falha ao gerar certificado.');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeBo = boNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = 'certificado-nao-agendamento-bo-' + safeBo + '.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setStatus('Certificado baixado com sucesso.', false);
  } catch (error) {
    setStatus(error.message || 'Falha ao baixar certificado.', true);
  }
}

document.getElementById('loadHistoryBtn').addEventListener('click', loadHistory);
document.getElementById('downloadCertificateBtn').addEventListener('click', downloadCertificate);
document.getElementById('boNumberInput').addEventListener('keydown', function (event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    loadHistory();
  }
});
