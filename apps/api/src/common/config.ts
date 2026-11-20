const isProduction = process.env.NODE_ENV === 'production';
const defaultJwtSecret = 'cambiar-este-secreto';
const jwtSecret = process.env.JWT_SECRET || defaultJwtSecret;

if (isProduction && jwtSecret === defaultJwtSecret) {
  throw new Error('JWT_SECRET debe configurarse explícitamente en producción');
}

function splitFrom(from: string): { email: string; name: string } {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { name: 'ERP Centro', email: from.trim() };
}

const smtpFrom = process.env.SMTP_FROM || 'ERP Centro <no-reply@localhost>';
const from = splitFrom(smtpFrom);
const mailProvider = (process.env.MAIL_PROVIDER || (process.env.BREVO_API_KEY ? 'brevo' : 'smtp')).toLowerCase();
const brevoApiKey = process.env.BREVO_API_KEY || '';
const brevoUrl = process.env.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email';
const mailFromEmail = process.env.MAIL_FROM_EMAIL || from.email;
const mailFromName = process.env.MAIL_FROM_NAME || from.name;

export const config = {
  jwtSecret,
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  corsOrigins: (process.env.CORS_ORIGINS || process.env.APP_URL || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  // Render inyecta `PORT`; localmente se usa `API_PORT`.
  apiPort: Number(process.env.PORT || process.env.API_PORT || 3000),
  timezone: process.env.TIMEZONE || 'America/La_Paz',
  currency: process.env.CURRENCY || 'BOB',
  closeTime: process.env.CLOSE_TIME || '22:30',
  closeGraceMinutes: Number(process.env.CLOSE_GRACE_MINUTES || 60),
  openingAmountDefault: process.env.OPENING_AMOUNT_DEFAULT || '0',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@localhost',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFrom,
  mailProvider,
  brevoApiKey,
  brevoUrl,
  mailFromEmail,
  mailFromName,
  mailConfigured: mailProvider === 'brevo' ? Boolean(brevoApiKey && mailFromEmail) : Boolean(process.env.SMTP_HOST),
  isProduction,
};
