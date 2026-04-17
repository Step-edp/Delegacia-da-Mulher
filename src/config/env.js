const dotenv = require('dotenv');

dotenv.config();

function parseDatabaseUrl(url) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: Number(parsed.port),
      database: parsed.pathname.slice(1), // Remove leading slash
      user: parsed.username,
      password: parsed.password,
      ssl: { rejectUnauthorized: false }, // SSL com rejectUnauthorized: false
      connectionTimeoutMillis: 10000, // 10 segundos timeout
      query_timeout: 10000
    };
  } catch (error) {
    console.warn('Erro ao fazer parse da DATABASE_URL:', error.message);
    return null;
  }
}

const databaseUrlConfig = parseDatabaseUrl(process.env.DATABASE_URL);

const env = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwt: {
    summonsSecret: process.env.JWT_SUMMONS_SECRET || '',
    summonsExpiresIn: process.env.JWT_SUMMONS_EXPIRES_IN || '72h'
  },
  auth: {
    otpExpiresMinutes: Number(process.env.OTP_EXPIRES_MINUTES || 10),
    sessionSecret: process.env.JWT_SESSION_SECRET || '',
    sessionExpiresIn: process.env.JWT_SESSION_EXPIRES_IN || '12h',
    devMode: process.env.AUTH_DEV_MODE === 'true',
    devSendRealOtp: process.env.AUTH_DEV_SEND_REAL_OTP === 'true',
    devAdminCpf: process.env.AUTH_DEV_ADMIN_CPF || '40280221851'
  },
  whatsapp: {
    provider: process.env.WHATSAPP_PROVIDER || 'generic',
    apiUrl: process.env.WHATSAPP_API_URL || '',
    apiToken: process.env.WHATSAPP_API_TOKEN || '',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v22.0',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    languageCode: process.env.WHATSAPP_LANGUAGE_CODE || 'pt_BR',
    defaultTemplateName: process.env.WHATSAPP_TEMPLATE_NAME || 'intimacao_padrao',
    otpTemplateName: process.env.WHATSAPP_OTP_TEMPLATE_NAME || 'otp_login',
    victimNotificationTemplateName: process.env.WHATSAPP_VICTIM_NOTIFICATION_TEMPLATE_NAME || 'notificacao_vitima',
    publicBaseUrl: process.env.WHATSAPP_PUBLIC_BASE_URL || ''
  },
  sms: {
    apiUrl: process.env.SMS_API_URL || '',
    apiToken: process.env.SMS_API_TOKEN || ''
  },
  db: databaseUrlConfig || {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'delegacia_mulher',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_SSL === 'true'
  }
};

module.exports = env;
