import { resetEmailFromEnvironment } from '../apps/api/src/mail.ts';

try {
  const mail = resetEmailFromEnvironment();
  if (!mail) {
    console.error('Email is not configured. Run npm run setup:email, fill SMTP_USER and SMTP_PASS in .env, then retry.');
    process.exitCode = 1;
  } else {
    await mail.verify();
    console.log('SMTP connection and authentication passed. No email was sent. Restart the backend after changing .env.');
  }
} catch (error) {
  const code = (error && typeof error === 'object' && 'code' in error) ? String(error.code) : '';
  const reason = code === 'EAUTH' ? 'Gmail rejected authentication. Check the sender account and Google App Password.'
    : ['ECONNECTION', 'ETIMEDOUT', 'EDNS', 'ESOCKET'].includes(code) ? 'Cannot establish a secure SMTP connection. Check the network, SMTP host and port.'
    : 'Check SMTP settings and APP_PUBLIC_URL; production needs HTTPS.';
  console.error(`SMTP check failed. ${reason} See docs/password-reset-gmail.md`);
  // Do not print raw SMTP errors: providers may echo credentials or email addresses.
  process.exitCode = 1;
}
