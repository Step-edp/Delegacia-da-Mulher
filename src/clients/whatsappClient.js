const axios = require('axios');
const env = require('../config/env');

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function normalizeMetaCloudPhone(phone) {
  const digits = normalizePhone(phone);

  if (!digits) {
    return '';
  }

  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  return digits;
}

function normalizeZApiPhone(phone) {
  const digits = normalizePhone(phone);

  if (!digits) {
    return '';
  }

  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  return digits;
}

function normalizeZApiBaseUrl(url) {
  return String(url || '').trim().replace(/\/(send-text|send-image)\/?$/i, '').replace(/\/$/, '');
}

function resolveZApiUrl(payload) {
  const baseUrl = normalizeZApiBaseUrl(env.whatsapp.apiUrl);

  if (!baseUrl) {
    const error = new Error('WHATSAPP_API_URL nao configurado para Z-API.');
    error.statusCode = 500;
    throw error;
  }

  const endpoint = payload && payload.imageUrl ? 'send-image' : 'send-text';
  return `${baseUrl}/${endpoint}`;
}

function resolveApiUrl() {
  if (env.whatsapp.provider === 'z-api') {
    return normalizeZApiBaseUrl(env.whatsapp.apiUrl);
  }

  if (env.whatsapp.provider === 'meta-cloud') {
    if (env.whatsapp.apiUrl) {
      return env.whatsapp.apiUrl;
    }

    if (!env.whatsapp.phoneNumberId) {
      const error = new Error('WHATSAPP_PHONE_NUMBER_ID nao configurado para Meta Cloud API.');
      error.statusCode = 500;
      throw error;
    }

    return `https://graph.facebook.com/${env.whatsapp.apiVersion}/${env.whatsapp.phoneNumberId}/messages`;
  }

  if (!env.whatsapp.apiUrl) {
    const error = new Error('WHATSAPP_API_URL nao configurado.');
    error.statusCode = 500;
    throw error;
  }

  return env.whatsapp.apiUrl;
}

function buildHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (env.whatsapp.apiToken) {
    if (env.whatsapp.provider === 'meta-cloud') {
      headers.Authorization = `Bearer ${env.whatsapp.apiToken}`;
    } else {
      headers['Client-Token'] = `${env.whatsapp.apiToken}`;
    }
  }

  return headers;
}

function buildMetaTemplateComponents(variables) {
  const entries = Object.values(variables || {});
  if (!entries.length) {
    return undefined;
  }

  return [
    {
      type: 'body',
      parameters: entries.map((value) => ({
        type: 'text',
        text: String(value == null ? '' : value)
      }))
    }
  ];
}

function buildMetaCloudPayload(payload) {
  const to = normalizeMetaCloudPhone(payload.to);
  if (!to) {
    const error = new Error('Telefone de destino invalido para envio no WhatsApp.');
    error.statusCode = 422;
    throw error;
  }

  if (payload.template) {
    const components = buildMetaTemplateComponents(payload.variables);
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: payload.template,
        language: {
          code: env.whatsapp.languageCode
        },
        ...(components ? { components } : {})
      }
    };
  }

  if (payload.imageUrl) {
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'image',
      image: {
        link: String(payload.imageUrl),
        caption: String(payload.message || '')
      }
    };
  }

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: {
      preview_url: false,
      body: String(payload.message || '')
    }
  };
}

function buildZApiPayload(payload) {
  const phone = normalizeZApiPhone(payload && payload.to ? payload.to : payload && payload.phone);
  if (!phone) {
    const error = new Error('Telefone de destino invalido para envio no WhatsApp.');
    error.statusCode = 422;
    throw error;
  }

  if (payload && payload.imageUrl) {
    return {
      phone,
      image: String(payload.imageUrl),
      caption: String(payload.message || '')
    };
  }

  return {
    phone,
    message: String(payload && payload.message ? payload.message : '')
  };
}

function extractProviderErrorMessage(error) {
  const responseData = error && error.response ? error.response.data : null;

  if (responseData && typeof responseData === 'object') {
    if (responseData.error && responseData.error.message) {
      return String(responseData.error.message).trim();
    }

    if (responseData.message) {
      return String(responseData.message).trim();
    }

    if (responseData.detail) {
      return String(responseData.detail).trim();
    }
  }

  return String(error && error.message ? error.message : '').trim();
}

function buildWhatsappClientError(error) {
  const providerStatus = Number(error && error.response && error.response.status);
  const providerMessage = extractProviderErrorMessage(error);
  const wrappedError = new Error(
    providerMessage
      ? `Falha ao enviar mensagem no WhatsApp: ${providerMessage}`
      : 'Falha ao enviar mensagem no WhatsApp.'
  );

  wrappedError.statusCode = providerStatus >= 400 && providerStatus < 500 ? 422 : 502;
  wrappedError.providerStatus = Number.isInteger(providerStatus) ? providerStatus : null;
  wrappedError.code = error && error.code ? error.code : null;
  wrappedError.cause = error;

  return wrappedError;
}

async function sendTemplateMessage(payload) {
  const apiUrl = env.whatsapp.provider === 'z-api'
    ? resolveZApiUrl(payload)
    : resolveApiUrl();
  const body = env.whatsapp.provider === 'meta-cloud'
    ? buildMetaCloudPayload(payload)
    : env.whatsapp.provider === 'z-api'
      ? buildZApiPayload(payload)
    : payload;

  try {
    const response = await axios.post(apiUrl, body, {
      timeout: 15000,
      headers: buildHeaders()
    });

    return response.data;
  } catch (error) {
    throw buildWhatsappClientError(error);
  }
}

module.exports = {
  sendTemplateMessage
};
