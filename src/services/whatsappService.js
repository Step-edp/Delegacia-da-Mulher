const whatsappClient = require('../clients/whatsappClient');
const summonsRepository = require('../repositories/summonsRepository');
const summonsEventsService = require('./summonsEventsService');
const env = require('../config/env');

const TEMPLATE_BY_PERSON_TYPE = {
  VITIMA: 'intimacao_vitima',
  AUTOR: 'intimacao_autor',
  TESTEMUNHA: 'intimacao_testemunha',
  RESPONSAVEL: 'intimacao_responsavel'
};

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function isWhatsappConfigError(error) {
  const message = String(error && error.message ? error.message : '');
  return message.includes('WHATSAPP_API_URL nao configurado')
    || message.includes('WHATSAPP_PHONE_NUMBER_ID nao configurado');
}

function isWhatsappUnavailableError(error) {
  const code = String(error && error.code ? error.code : '').toUpperCase();
  const message = String(error && error.message ? error.message : '').toLowerCase();

  return code === 'ENOTFOUND'
    || code === 'ECONNREFUSED'
    || code === 'ETIMEDOUT'
    || code === 'EAI_AGAIN'
    || message.includes('getaddrinfo enotfound')
    || message.includes('timeout')
    || message.includes('connect econnrefused');
}

function isPlaceholderConfigValue(value) {
  const normalized = String(value || '').trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  return normalized.includes('seu-provedor.com')
    || normalized.includes('troque-por-token')
    || normalized.includes('troque-por');
}

function hasUsableWhatsappConfig() {
  if (env.whatsapp.provider === 'meta-cloud') {
    const token = String(env.whatsapp.apiToken || '').trim();
    const phoneNumberId = String(env.whatsapp.phoneNumberId || '').trim();
    const apiUrl = String(env.whatsapp.apiUrl || '').trim();

    if (apiUrl && !isPlaceholderConfigValue(apiUrl)) {
      return !isPlaceholderConfigValue(token);
    }

    return !isPlaceholderConfigValue(token) && !isPlaceholderConfigValue(phoneNumberId);
  }

  const apiUrl = String(env.whatsapp.apiUrl || '').trim();
  const apiToken = String(env.whatsapp.apiToken || '').trim();

  return !isPlaceholderConfigValue(apiUrl) && !isPlaceholderConfigValue(apiToken);
}

function canUseMockWhatsappFallback() {
  return env.auth.devMode && (!env.auth.devSendRealWhatsapp || !hasUsableWhatsappConfig());
}

function resolvePublicBaseUrl(publicBaseUrl) {
  const rawValue = String(publicBaseUrl || env.whatsapp.publicBaseUrl || '').trim();

  if (!rawValue) {
    const error = new Error('Base publica do site nao informada para gerar o link de atendimento.');
    error.statusCode = 400;
    throw error;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawValue);
  } catch (parseError) {
    const error = new Error('Base publica do site invalida para gerar o link de atendimento.');
    error.statusCode = 400;
    throw error;
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    const error = new Error('Base publica do site deve usar http ou https.');
    error.statusCode = 400;
    throw error;
  }

  return parsedUrl.origin;
}

function resolveTemplateName(personType) {
  const mapped = TEMPLATE_BY_PERSON_TYPE[personType];
  return mapped || env.whatsapp.defaultTemplateName;
}

function buildSummonsLink(token) {
  const baseUrl = resolvePublicBaseUrl(env.whatsapp.publicBaseUrl).replace(/\/$/, '');
  return `${baseUrl}/intimacao?token=${encodeURIComponent(token)}`;
}

function buildVictimAttendanceLink({ publicBaseUrl, boNumber, personName, phone, caseId, token, summonsId }) {
  const linkUrl = new URL('/atendimento-vitima', `${resolvePublicBaseUrl(publicBaseUrl || env.whatsapp.publicBaseUrl)}/`);

  linkUrl.searchParams.set('tipo', 'vitima');

  if (boNumber) {
    linkUrl.searchParams.set('bo', String(boNumber).trim());
  }

  if (personName) {
    linkUrl.searchParams.set('nome', String(personName).trim());
  }

  if (phone) {
    linkUrl.searchParams.set('telefone', String(phone).trim());
  }

  if (caseId) {
    linkUrl.searchParams.set('caseId', String(caseId).trim());
  }

  if (token) {
    linkUrl.searchParams.set('token', String(token).trim());
  }

  if (summonsId) {
    linkUrl.searchParams.set('summonsId', String(summonsId).trim());
  }

  return linkUrl.toString();
}

function buildIndictmentLink({ publicBaseUrl, boNumber }) {
  return buildVictimAttendanceLink({
    publicBaseUrl,
    boNumber
  });
}

function buildIndictmentMessage({ messageTemplate, link, authorName, boNumber }) {
  const template = String(messageTemplate || '').trim();

  if (!template) {
    const error = new Error('Salve primeiro a mensagem na aba Mensagens antes de indiciar.');
    error.statusCode = 400;
    throw error;
  }

  const replacements = {
    nome: String(authorName || '').trim(),
    indiciado: String(authorName || '').trim(),
    bo: String(boNumber || '').trim(),
    link
  };

  const renderedMessage = template.replace(/\{\{\s*(nome|indiciado|bo|link)\s*\}\}/gi, (match, key) => {
    const replacement = replacements[String(key || '').toLowerCase()];
    return replacement == null ? '' : replacement;
  }).trim();

  if (!renderedMessage) {
    const error = new Error('A mensagem configurada na aba Mensagens esta vazia.');
    error.statusCode = 400;
    throw error;
  }

  return renderedMessage.includes(link)
    ? renderedMessage
    : `${renderedMessage}\n\nAcesse: ${link}`;
}

async function dispatchWhatsappMessage({ phone, message, imageUrl, context, templateName, variables }) {
  if (templateName) {
    try {
      return await whatsappClient.sendTemplateMessage({
        to: phone,
        phone,
        channel: 'whatsapp',
        template: templateName,
        variables: variables || {},
        message,
        imageUrl
      });
    } catch (error) {
      // Alguns provedores/template endpoints rejeitam campos extras como imageUrl.
      // Nesse caso, tentamos novamente sem imagem para manter o envio da mensagem.
      if (imageUrl) {
        try {
          return await whatsappClient.sendTemplateMessage({
            to: phone,
            phone,
            channel: 'whatsapp',
            template: templateName,
            variables: variables || {},
            message
          });
        } catch (retryError) {
          error = retryError;
        }
      }

      if (canUseMockWhatsappFallback() && (isWhatsappConfigError(error) || isWhatsappUnavailableError(error))) {
        return {
          mocked: true,
          channel: 'whatsapp',
          context,
          to: phone,
          template: templateName,
          variables: variables || {},
          message
        };
      }

      if (env.whatsapp.provider === 'meta-cloud') {
        throw error;
      }
    }
  }

  try {
    return await whatsappClient.sendTemplateMessage({
      to: phone,
      phone,
      channel: 'whatsapp',
      message,
      imageUrl
    });
  } catch (error) {
    if (imageUrl) {
      try {
        return await whatsappClient.sendTemplateMessage({
          to: phone,
          phone,
          channel: 'whatsapp',
          message
        });
      } catch (retryError) {
        error = retryError;
      }
    }

    if (canUseMockWhatsappFallback() && (isWhatsappConfigError(error) || isWhatsappUnavailableError(error))) {
      return {
        mocked: true,
        channel: 'whatsapp',
        context,
        to: phone,
        message,
        imageUrl
      };
    }

    throw error;
  }
}

function validateSendInput(payload) {
  const summonsId = Number(payload.summonsId);
  const token = String(payload.token || '').trim();

  if (!Number.isInteger(summonsId) || summonsId <= 0) {
    const error = new Error('summonsId invalido.');
    error.statusCode = 400;
    throw error;
  }

  if (!token) {
    const error = new Error('token da intimacao e obrigatorio para envio no link.');
    error.statusCode = 400;
    throw error;
  }

  return {
    summonsId,
    token,
    phoneOverride: payload.phone || null,
    boNumber: payload.boNumber || null
  };
}

async function sendSummonsMessage(payload) {
  const input = validateSendInput(payload);
  const summons = await summonsRepository.findByIdWithPerson(input.summonsId);

  if (!summons) {
    const error = new Error('Intimacao nao encontrada.');
    error.statusCode = 404;
    throw error;
  }

  const phone = normalizePhone(input.phoneOverride || summons.personPhone);
  if (!phone) {
    const error = new Error('Telefone da pessoa nao encontrado para envio de WhatsApp.');
    error.statusCode = 422;
    throw error;
  }

  const templateName = resolveTemplateName(summons.personType);
  const link = summons.personType === 'VITIMA'
    ? buildVictimAttendanceLink({
        boNumber: input.boNumber,
        personName: summons.personName,
        phone,
        caseId: summons.caseId,
        token: input.token,
        summonsId: summons.id
      })
    : buildSummonsLink(input.token);

  const body = {
    to: phone,
    channel: 'whatsapp',
    template: templateName,
    variables: {
      nome: summons.personName,
      tipo: summons.personType,
      texto: summons.summonsText,
      link
    },
	phone,
    message: `${summons.summonsText} Acesse: ${link}`
  };

  const providerResponse = await whatsappClient.sendTemplateMessage(body);

  await summonsRepository.markAsSent(input.summonsId, 'whatsapp');
  await summonsEventsService.recordAttemptSent({
    summonsId: input.summonsId,
    attemptNumber: Number(summons.attemptNumber) || 1
  });

  return {
    summonsId: summons.id,
    person: {
      id: summons.personId,
      name: summons.personName,
      phone
    },
    template: templateName,
    link,
    providerResponse
  };
}

async function sendIndictmentMessage(payload) {
  const phone = normalizePhone(payload && payload.phone);

  if (!phone) {
    const error = new Error('Informe o WhatsApp do indiciado antes de indiciar.');
    error.statusCode = 422;
    throw error;
  }

  const link = buildIndictmentLink({
    publicBaseUrl: payload && payload.publicBaseUrl,
    boNumber: payload && payload.boNumber
  });

  const message = buildIndictmentMessage({
    messageTemplate: payload && payload.messageTemplate,
    link,
    authorName: payload && payload.authorName,
    boNumber: payload && payload.boNumber
  });

  const providerResponse = await dispatchWhatsappMessage({
    phone,
    message,
    imageUrl: payload && payload.imageUrl,
    context: 'indiciamento',
    templateName: resolveTemplateName('AUTOR'),
    variables: {
      nome: String(payload && payload.authorName || '').trim(),
      tipo: 'AUTOR',
      texto: message,
      link
    }
  });

  return {
    phone,
    link,
    message,
    providerResponse,
    mocked: Boolean(providerResponse && providerResponse.mocked)
  };
}

module.exports = {
  sendSummonsMessage,
  sendIndictmentMessage
};
