import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import nodemailer from 'nodemailer';
import { SMTPServer } from 'smtp-server';
import { createResetEmailService, resetEmailFromEnvironment, trustedPublicUrl } from '../apps/api/src/mail.ts';
import { createApp } from '../apps/api/src/app.ts';
import { openDatabase } from '../apps/api/src/db.ts';

test('email configuration stays disabled until credentials exist and rejects unsafe public origins', () => {
  assert.equal(resetEmailFromEnvironment({}), undefined);
  assert.equal(resetEmailFromEnvironment({ SMTP_USER: 'sender@example.com' }), undefined);
  assert.equal(trustedPublicUrl('http://localhost:5173/'), 'http://localhost:5173');
  assert.equal(trustedPublicUrl('https://tasks.example.com', true), 'https://tasks.example.com');
  for (const url of ['javascript:alert(1)', 'https://user:secret@example.com', 'https://example.com/path', 'https://example.com?x=1', 'https://example.com#token=secret']) {
    assert.throws(() => trustedPublicUrl(url));
  }
  assert.throws(() => trustedPublicUrl('http://example.com', true), /HTTPS/);
  assert.throws(() => resetEmailFromEnvironment({ SMTP_USER: 'sender@example.com', SMTP_PASS: 'not-real', SMTP_SECURE: 'bad' }));
  assert.throws(() => resetEmailFromEnvironment({ SMTP_USER: 'bad-address', SMTP_PASS: 'not-real' }));
});

test('password recovery sends a real message through local SMTP, then the received link resets the password', async t => {
  const received: { raw: string; to: string[] }[] = [];
  const server = new SMTPServer({
    // This receiver is loopback-only, test-only, and has no real account or TLS credentials.
    disabledCommands: ['STARTTLS', 'AUTH'],
    onRcptTo(address, _session, callback) {
      if (address.address === 'reject@example.test') return callback(Object.assign(new Error('Rejected in SMTP test'), { responseCode: 550 }));
      callback();
    },
    onData(stream, session, callback) {
      const chunks: Buffer[] = [];
      stream.on('data', chunk => chunks.push(Buffer.from(chunk)));
      stream.on('end', () => { received.push({ raw: Buffer.concat(chunks).toString('utf8'), to: session.envelope.rcptTo.map(value => value.address) }); callback(); });
      stream.on('error', callback);
    },
  });
  server.listen(0, '127.0.0.1');
  await once(server.server, 'listening');
  const address = server.server.address();
  assert.ok(address && typeof address !== 'string');
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const transport = nodemailer.createTransport({ host: '127.0.0.1', port: address.port, secure: false, ignoreTLS: true });
  const email = createResetEmailService(transport, 'http://localhost:5173', { name: 'TaskFlow', address: 'sender@example.test' });
  await email.verify();
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const app = createApp(db, { secret: 'local-smtp-test-secret-with-more-than-32-characters', origins: ['http://localhost:5173'], silent: true, passwordReset: email });
  const post = (path: string, body: object) => app.request(`/api/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post('register', { name: 'SMTP test', email: 'owner@example.test', password: 'Original-2026!' })).status, 201);
  const response = await post('forgot-password', { email: 'owner@example.test' });
  assert.equal(response.status, 202);
  for (let retry = 0; received.length < 2 && retry < 100; retry++) await delay(20);
  assert.equal(received.length, 2, 'The SMTP receiver must accept verification and reset messages');
  assert.ok(received.every(item=>item.to[0]==='owner@example.test'));
  const resetMessage=received.find(item=>item.raw.includes('reset-password'));assert.ok(resetMessage);
  const decoded = resetMessage.raw.replace(/=\r?\n/g, '').replace(/=3D/gi, '=');
  const resetUrl = decoded.match(/http:\/\/localhost:5173\/reset-password#token=[0-9a-f]{64}/)?.[0];
  assert.ok(resetUrl, 'The transmitted email must contain a complete usable reset link');
  const token = new URLSearchParams(new URL(resetUrl).hash.slice(1)).get('token')!;
  assert.equal((await post('reset-password', { token, password: 'New-SMTP-2026!' })).status, 200);
  assert.equal((await post('login', { email: 'owner@example.test', password: 'Original-2026!' })).status, 401);
  assert.equal((await post('login', { email: 'owner@example.test', password: 'New-SMTP-2026!' })).status, 200);
  assert.equal((await post('reset-password', { token, password: 'Another-2026!' })).status, 400);
  await assert.rejects(() => email.send({ to: 'reject@example.test', resetUrl, expiresMinutes: 15 }));
});
