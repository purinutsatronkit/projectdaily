import { existsSync, readFileSync, appendFileSync } from 'node:fs';

if (!existsSync('.env')) {
  console.error('Run npm run setup first to create .env.');
  process.exitCode = 1;
} else {
  const source = readFileSync('.env', 'utf8');
  const keys = new Set([...source.matchAll(/^\s*([A-Z_]+)\s*=/gm)].map(match => match[1]));
  const originLine = source.match(/^\s*APP_ORIGIN\s*=\s*([^\r\n]*)/m)?.[1]?.trim();
  const origin = originLine?.replace(/^(['"])(.*)\1$/, '$2') || 'http://localhost:5173';
  const defaults = {
    APP_PUBLIC_URL: origin, SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_SECURE: 'true',
    SMTP_USER: '', SMTP_PASS: '', SMTP_FROM: '', SMTP_FROM_NAME: 'TaskFlow',
  };
  const missing = Object.entries(defaults).filter(([key]) => !keys.has(key));
  if (missing.length) {
    appendFileSync('.env', '\n# Gmail password reset email (see docs/password-reset-gmail.md)\n' + missing.map(([key, value]) => `${key}=${value}`).join('\n') + '\n');
    console.log('Added missing email settings to .env. Existing values were preserved.');
  } else console.log('Email setting names are already present; existing values were preserved.');
  console.log('Set SMTP_USER and SMTP_PASS locally, then run npm run mail:check and restart the backend. Never paste credentials into chat.');
}
