import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../apps/api/src/app.ts';
import { openDatabase } from '../apps/api/src/db.ts';
import type { Config } from '../apps/api/src/context.ts';
import { checkPassword, hashPassword } from '../apps/api/src/security.ts';

const SECRET = 'password-reset-test-secret-with-at-least-32-characters';
const OLD_PASSWORD = 'Original-password-2026!';
const NEW_PASSWORD = 'Replacement-password-2026!';
const ORIGIN = 'http://localhost:5173';
interface Mail { to: string; resetUrl: string; expiresMinutes: number }
interface Identity { cookie: string; user: { id: string; name: string; email: string } }
interface ResetRow { id: string; user_id: string; token_hash: string; expires_at: string; used_at: string | null; created_at: string }

function fixture(t: TestContext, options: { config?: Partial<Config>; configured?: boolean; failSend?: boolean } = {}) {
  const db = openDatabase(':memory:');
  const mails: Mail[] = [];
  let sends = 0;
  const config: Config = {
    secret: SECRET, origins: [ORIGIN], silent: true, authLimit: 100,
    resetRequestLimit: 100, resetSubmitLimit: 100,
    ...(options.configured === false ? {} : {
      passwordReset: {
        publicUrl: ORIGIN,
        send: async (mail: Mail) => {
          sends++;
          if (options.failSend) throw new Error('Synthetic SMTP failure; not a real delivery');
          mails.push(mail);
        },
      },
    }),
    ...options.config,
  };
  const app = createApp(db, config);
  t.after(async () => {
    // Allow queued local mail callbacks to finish before closing this fixture's DB.
    await delay(20);
    db.close();
  });
  function request(path: string, options: {
    method?: string; cookie?: string; body?: unknown; headers?: Record<string, string>;
  } = {}) {
    const headers: Record<string, string> = { ...options.headers };
    if (options.cookie) headers.cookie = options.cookie;
    if (options.body !== undefined) headers['content-type'] ??= 'application/json';
    return app.request(path, {
      method: options.method ?? 'GET', headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  }
  async function register(email = 'owner@example.com'): Promise<Identity> {
    const response = await request('/api/auth/register', { method: 'POST', body: { name: 'Reset tester', email, password: OLD_PASSWORD } });
    assert.equal(response.status, 201);
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie);
    return { cookie, user: (await response.json()).user };
  }
  const forgot = (email: string, headers?: Record<string, string>) => request('/api/auth/forgot-password', { method: 'POST', body: { email }, headers });
  const reset = (token: string, password = NEW_PASSWORD, headers?: Record<string, string>) => request('/api/auth/reset-password', { method: 'POST', body: { token, password }, headers });
  const login = (email: string, password: string) => request('/api/auth/login', { method: 'POST', body: { email, password } });
  return { db, app, request, register, forgot, reset, login, mails, sends: () => sends };
}

async function waitFor(check: () => boolean, message: string) {
  const deadline = Date.now() + 1500;
  while (!check() && Date.now() < deadline) await delay(5);
  assert.ok(check(), message);
}

function tokenFrom(mail: Mail) {
  const url = new URL(mail.resetUrl);
  assert.equal(url.origin, ORIGIN);
  assert.equal(url.pathname, '/reset-password');
  assert.equal(url.search, '', 'Secret belongs in URL fragment, not query parameters');
  const token = new URLSearchParams(url.hash.slice(1)).get('token');
  assert.ok(token && /^[a-f0-9]{64}$/.test(token), 'Reset link must carry a 64-character hex token in its fragment');
  return token;
}

async function expectError(response: Response, status: number, code: string) {
  assert.equal(response.status, status);
  const payload = await response.json();
  assert.equal(payload.error.code, code);
  assert.equal(typeof payload.error.message, 'string');
  assert.ok(payload.error.request_id);
  return payload;
}

async function expectAccepted(response: Response) {
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ['message']);
  assert.equal(typeof body.message, 'string');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return body;
}

test('forgot-password does not enumerate accounts and normalizes the submitted email', async t => {
  const f = fixture(t);
  const owner = await f.register();
  const known = await expectAccepted(await f.forgot('  OWNER@EXAMPLE.COM  '));
  const unknown = await expectAccepted(await f.forgot('unknown@example.com'));
  assert.deepEqual(known, unknown);
  await waitFor(() => f.mails.length === 1, 'Expected one asynchronous mail for the existing account');
  assert.equal(f.mails[0].to, owner.user.email);
  assert.equal((f.db.prepare('SELECT COUNT(*) count FROM password_reset_tokens').get() as { count: number }).count, 1);
});

test('reset token is random, stored only as SHA-256 digest, and expires after fifteen minutes', async t => {
  const f = fixture(t);
  const owner = await f.register();
  await expectAccepted(await f.forgot(owner.user.email));
  await waitFor(() => f.mails.length === 1, 'Expected reset email');
  const token = tokenFrom(f.mails[0]);
  assert.equal(f.mails[0].expiresMinutes, 15);
  const row = f.db.prepare('SELECT * FROM password_reset_tokens WHERE user_id=?').get(owner.user.id) as ResetRow;
  assert.ok(row);
  assert.ok(row.token_hash === createHash('sha256').update(token).digest('hex'), 'Only the token digest may be stored');
  assert.ok(!Object.values(row).includes(token), 'Raw reset token must not appear in any database column');
  assert.equal(row.used_at, null);
  const duration = new Date(row.expires_at).getTime() - new Date(row.created_at).getTime();
  assert.ok(duration >= 15 * 60_000 - 1000 && duration <= 15 * 60_000 + 1000, 'Token TTL must be fifteen minutes');
});

test('requesting a reset does not change password or revoke the current session', async t => {
  const f = fixture(t);
  const owner = await f.register();
  const before = (f.db.prepare('SELECT password_hash FROM users WHERE id=?').get(owner.user.id) as { password_hash: string }).password_hash;
  await expectAccepted(await f.forgot(owner.user.email));
  await waitFor(() => f.mails.length === 1, 'Expected reset email');
  assert.equal((await f.request('/api/auth/me', { cookie: owner.cookie })).status, 200);
  const after = (f.db.prepare('SELECT password_hash FROM users WHERE id=?').get(owner.user.id) as { password_hash: string }).password_hash;
  assert.ok(before === after, 'Requesting a link must not alter the password');
  assert.equal((await f.login(owner.user.email, OLD_PASSWORD)).status, 200);
});

test('successful reset replaces password, revokes all owner sessions, clears cookie, and does not log in automatically', async t => {
  const f = fixture(t);
  const owner = await f.register();
  const secondLogin = await f.login(owner.user.email, OLD_PASSWORD);
  const secondCookie = secondLogin.headers.get('set-cookie')!.split(';')[0];
  const other = await f.register('other@example.com');
  await expectAccepted(await f.forgot(owner.user.email));
  await waitFor(() => f.mails.length === 1, 'Expected reset email');
  const response = await f.reset(tokenFrom(f.mails[0]));
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(await response.json()), ['message']);
  assert.match(response.headers.get('set-cookie') ?? '', /Max-Age=0/i);
  await expectError(await f.request('/api/auth/me', { cookie: owner.cookie }), 401, 'SESSION_EXPIRED');
  await expectError(await f.request('/api/auth/me', { cookie: secondCookie }), 401, 'SESSION_EXPIRED');
  await expectError(await f.request('/api/auth/me'), 401, 'UNAUTHORIZED');
  await expectError(await f.login(owner.user.email, OLD_PASSWORD), 401, 'INVALID_CREDENTIALS');
  assert.equal((await f.login(owner.user.email, NEW_PASSWORD)).status, 200);
  const stored = (f.db.prepare('SELECT password_hash FROM users WHERE id=?').get(owner.user.id) as { password_hash: string }).password_hash;
  assert.ok(stored !== NEW_PASSWORD);
  assert.equal(await checkPassword(NEW_PASSWORD, stored), true);
  assert.equal((await f.request('/api/auth/me', { cookie: other.cookie })).status, 200);
  assert.equal((await f.login(other.user.email, OLD_PASSWORD)).status, 200);
});

test('used token cannot reset the password again', async t => {
  const f = fixture(t);
  const owner = await f.register();
  await expectAccepted(await f.forgot(owner.user.email));
  await waitFor(() => f.mails.length === 1, 'Expected reset email');
  const token = tokenFrom(f.mails[0]);
  assert.equal((await f.reset(token)).status, 200);
  await expectError(await f.reset(token, 'Another-long-password-2026!'), 400, 'INVALID_RESET_TOKEN');
  assert.equal((await f.login(owner.user.email, NEW_PASSWORD)).status, 200);
});

test('expired, tampered, and unknown well-formed tokens fail without changing password or session', async t => {
  const f = fixture(t);
  const owner = await f.register();
  await expectAccepted(await f.forgot(owner.user.email));
  await waitFor(() => f.mails.length === 1, 'Expected reset email');
  const token = tokenFrom(f.mails[0]);
  const tampered = (token[0] === 'a' ? 'b' : 'a') + token.slice(1);
  await expectError(await f.reset(tampered), 400, 'INVALID_RESET_TOKEN');
  await expectError(await f.reset('f'.repeat(64)), 400, 'INVALID_RESET_TOKEN');
  f.db.prepare('UPDATE password_reset_tokens SET expires_at=? WHERE user_id=?').run('2000-01-01T00:00:00.000Z', owner.user.id);
  await expectError(await f.reset(token), 400, 'INVALID_RESET_TOKEN');
  assert.equal((await f.login(owner.user.email, OLD_PASSWORD)).status, 200);
  assert.equal((await f.request('/api/auth/me', { cookie: owner.cookie })).status, 200);
});

test('malformed token or weak replacement password fails validation without consuming a valid token', async t => {
  const f = fixture(t);
  const owner = await f.register();
  await expectAccepted(await f.forgot(owner.user.email));
  await waitFor(() => f.mails.length === 1, 'Expected reset email');
  const token = tokenFrom(f.mails[0]);
  for (const malformed of ['', 'short', 'z'.repeat(64), 'a'.repeat(63), 'a'.repeat(65)]) {
    await expectError(await f.reset(malformed), 400, 'VALIDATION_ERROR');
  }
  await expectError(await f.reset(token, 'short'), 400, 'VALIDATION_ERROR');
  assert.equal((await f.reset(token)).status, 200, 'Validation failure must not consume the valid link');
});

test('successful reset invalidates all other outstanding reset links for this user but not another user', async t => {
  const f = fixture(t);
  const owner = await f.register();
  const other = await f.register('other@example.com');
  await expectAccepted(await f.forgot(owner.user.email));
  await expectAccepted(await f.forgot(other.user.email));
  await waitFor(() => f.mails.length === 2, 'Expected one mail per registered account');
  const ownerMail = f.mails.find(mail => mail.to === owner.user.email)!;
  const otherMail = f.mails.find(mail => mail.to === other.user.email)!;
  const extraToken = 'b'.repeat(64);
  f.db.prepare('INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at,used_at,created_at) VALUES(?,?,?,?,?,?)')
    .run(randomUUID(), owner.user.id, createHash('sha256').update(extraToken).digest('hex'), new Date(Date.now() + 15 * 60_000).toISOString(), null, new Date().toISOString());
  assert.equal((await f.reset(tokenFrom(ownerMail))).status, 200);
  await expectError(await f.reset(extraToken), 400, 'INVALID_RESET_TOKEN');
  assert.equal((await f.reset(tokenFrom(otherMail))).status, 200, 'One account must not invalidate another account links');
});

test('two concurrent submissions of one reset link have exactly one successful password change', async t => {
  const f = fixture(t);
  const owner = await f.register();
  await expectAccepted(await f.forgot(owner.user.email));
  await waitFor(() => f.mails.length === 1, 'Expected reset email');
  const token = tokenFrom(f.mails[0]);
  const passwords = [NEW_PASSWORD, 'Other-competing-password-2026!'];
  const results = await Promise.all(passwords.map(password => f.reset(token, password)));
  assert.deepEqual(results.map(response => response.status).sort(), [200, 400]);
  const winner = results.findIndex(response => response.status === 200);
  const loser = 1 - winner;
  await expectError(results[loser], 400, 'INVALID_RESET_TOKEN');
  assert.equal((await f.login(owner.user.email, passwords[winner])).status, 200);
  await expectError(await f.login(owner.user.email, passwords[loser]), 401, 'INVALID_CREDENTIALS');
});

test('login cannot issue a new session from an old password snapshot after a reset commits', async t => {
  const f = fixture(t);
  const owner = await f.register();
  const replacementHash = await hashPassword(NEW_PASSWORD);
  const prepare = f.db.prepare.bind(f.db);
  let resetCommitted = false;
  // Place a reset's synchronous DB commit exactly after login reads its hash snapshot.
  // This avoids depending on scrypt thread-pool timing to reproduce the race.
  f.db.prepare = sql => {
    const statement = prepare(sql);
    if (sql.includes('SELECT id,name,email,password_hash FROM users WHERE email=?')) {
      const read = statement.get.bind(statement);
      statement.get = (...args) => {
        const snapshot = read(...args);
        if (!resetCommitted && snapshot?.id === owner.user.id) {
          resetCommitted = true;
          f.db.exec('BEGIN IMMEDIATE');
          prepare('UPDATE users SET password_hash=? WHERE id=?').run(replacementHash, owner.user.id);
          prepare('UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(new Date().toISOString(), owner.user.id);
          f.db.exec('COMMIT');
        }
        return snapshot;
      };
    }
    return statement;
  };
  const staleLogin = await f.login(owner.user.email, OLD_PASSWORD);
  assert.ok(resetCommitted, 'The reset commit must occur after login obtained the old hash');
  await expectError(staleLogin, 401, 'INVALID_CREDENTIALS');
  assert.equal(staleLogin.headers.get('set-cookie'), null, 'Stale credentials must not issue a cookie');
  assert.equal((prepare('SELECT COUNT(*) count FROM auth_sessions WHERE revoked_at IS NULL').get() as { count: number }).count, 0);
  assert.equal((await f.login(owner.user.email, NEW_PASSWORD)).status, 200);
});

test('per-account cooldown suppresses repeated emails for sixty seconds while returning the same accepted response', async t => {
  const f = fixture(t);
  const owner = await f.register();
  const first = await expectAccepted(await f.forgot(owner.user.email));
  await waitFor(() => f.mails.length === 1, 'Expected reset email');
  const second = await expectAccepted(await f.forgot(owner.user.email));
  assert.deepEqual(second, first);
  await delay(20);
  assert.equal(f.mails.length, 1);
  assert.equal((f.db.prepare('SELECT COUNT(*) count FROM password_reset_tokens WHERE user_id=?').get(owner.user.id) as { count: number }).count, 1);
});

test('per-account hourly cap sends at most three mails even after the cooldown expires', async t => {
  const f = fixture(t);
  const owner = await f.register();
  for (let i = 0; i < 3; i++) {
    await expectAccepted(await f.forgot(owner.user.email));
    await waitFor(() => f.mails.length === i + 1, 'Expected eligible reset email');
    // Move only test fixture timestamps beyond cooldown, remaining inside the same hour.
    f.db.prepare('UPDATE password_reset_tokens SET created_at=? WHERE user_id=?').run(new Date(Date.now() - 61_000).toISOString(), owner.user.id);
  }
  await expectAccepted(await f.forgot(owner.user.email));
  await delay(20);
  assert.equal(f.mails.length, 3);
  assert.equal((f.db.prepare('SELECT COUNT(*) count FROM password_reset_tokens WHERE user_id=?').get(owner.user.id) as { count: number }).count, 3);
});

test('missing password-reset SMTP configuration returns the explicit service-unavailable error', async t => {
  const f = fixture(t, { configured: false });
  await f.register();
  const error = await expectError(await f.forgot('owner@example.com'), 503, 'SMTP_NOT_CONFIGURED');
  assert.match(error.error.message, /Gmail/, 'Unconfigured service must give an actionable Gmail setup message');
  assert.equal(f.sends(), 0);
  assert.equal((f.db.prepare('SELECT COUNT(*) count FROM password_reset_tokens').get() as { count: number }).count, 0);
});

test('asynchronous send failure keeps the generic response and removes only the failed token row', async t => {
  const f = fixture(t, { failSend: true });
  const owner = await f.register();
  const other = await f.register('other@example.com');
  const existingToken = 'c'.repeat(64);
  const olderOwnerToken = 'e'.repeat(64);
  f.db.prepare('INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at,used_at,created_at) VALUES(?,?,?,?,?,?)')
    .run(randomUUID(), other.user.id, createHash('sha256').update(existingToken).digest('hex'), new Date(Date.now() + 15 * 60_000).toISOString(), null, new Date().toISOString());
  f.db.prepare('INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at,used_at,created_at) VALUES(?,?,?,?,?,?)')
    .run(randomUUID(), owner.user.id, createHash('sha256').update(olderOwnerToken).digest('hex'), new Date(Date.now() + 15 * 60_000).toISOString(), null, new Date(Date.now() - 120_000).toISOString());
  const generic = await expectAccepted(await f.forgot(owner.user.email));
  assert.ok(!JSON.stringify(generic).includes('SMTP'));
  await waitFor(() => f.sends() === 1, 'Expected the asynchronous mail stub to be called');
  await waitFor(() => (f.db.prepare('SELECT COUNT(*) count FROM password_reset_tokens WHERE user_id=?').get(owner.user.id) as { count: number }).count === 1, 'Only the newly failed delivery token should be removed');
  const preserved = f.db.prepare('SELECT token_hash,used_at FROM password_reset_tokens WHERE user_id=?').get(owner.user.id) as ResetRow;
  assert.ok(preserved.token_hash === createHash('sha256').update(olderOwnerToken).digest('hex'), 'A failed send must preserve the older link of the same account');
  assert.equal(preserved.used_at, null);
  assert.equal((f.db.prepare('SELECT COUNT(*) count FROM password_reset_tokens WHERE user_id=?').get(other.user.id) as { count: number }).count, 1);
  assert.equal((await f.request('/api/auth/me', { cookie: owner.cookie })).status, 200);
});

test('forgot-password rate limit returns Retry-After and remains independent per client', async t => {
  const f = fixture(t, { config: { resetRequestLimit: 2, clientIp: c => c.req.header('x-test-client') ?? 'client-a' } });
  await expectAccepted(await f.forgot('unknown@example.com'));
  await expectAccepted(await f.forgot('unknown@example.com'));
  const blocked = await f.forgot('unknown@example.com');
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  await expectError(blocked, 429, 'RATE_LIMITED');
  await expectAccepted(await f.forgot('unknown@example.com', { 'x-test-client': 'client-b' }));
});

test('reset submission rate limit prevents repeated token guesses and remains independent per client', async t => {
  const f = fixture(t, { config: { resetSubmitLimit: 2, clientIp: c => c.req.header('x-test-client') ?? 'client-a' } });
  for (let i = 0; i < 2; i++) await expectError(await f.reset('d'.repeat(64)), 400, 'INVALID_RESET_TOKEN');
  const blocked = await f.reset('d'.repeat(64));
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  await expectError(blocked, 429, 'RATE_LIMITED');
  await expectError(await f.reset('d'.repeat(64), NEW_PASSWORD, { 'x-test-client': 'client-b' }), 400, 'INVALID_RESET_TOKEN');
});

test('password reset endpoints reject cross-origin mutations before emailing or changing passwords', async t => {
  const f = fixture(t);
  const owner = await f.register();
  await expectError(await f.forgot(owner.user.email, { origin: 'https://evil.example' }), 403, 'ORIGIN_DENIED');
  await expectError(await f.forgot(owner.user.email, { origin: ORIGIN, 'sec-fetch-site': 'cross-site' }), 403, 'ORIGIN_DENIED');
  assert.equal(f.sends(), 0);
  await expectAccepted(await f.forgot(owner.user.email, { origin: ORIGIN }));
  await waitFor(() => f.mails.length === 1, 'Expected reset email for allowed origin');
  const token = tokenFrom(f.mails[0]);
  await expectError(await f.reset(token, NEW_PASSWORD, { origin: 'https://evil.example' }), 403, 'ORIGIN_DENIED');
  assert.equal((await f.login(owner.user.email, OLD_PASSWORD)).status, 200);
  assert.equal((await f.reset(token, NEW_PASSWORD, { origin: ORIGIN })).status, 200);
});
