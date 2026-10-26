import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { SignJWT, decodeJwt } from 'jose';
import { createApp } from '../apps/api/src/app.ts';
import { openDatabase } from '../apps/api/src/db.ts';
import { bangkokDate, type Config } from '../apps/api/src/context.ts';
import { checkPassword, hashApiKey } from '../apps/api/src/security.ts';
import { readNotifications } from '../apps/api/src/notifications.ts';

const SECRET = 'taskflow-test-secret-with-at-least-32-characters';
const PASSWORD = 'Demo-pass-42!';
const ORIGIN = 'http://localhost:5173';
interface Identity { cookie: string; user: { id: string; name: string; email: string } }
interface Task { id: string; title: string; description: string; priority: string; status: string; due_date: string | null }

function fixture(t: TestContext, overrides: Partial<Config> = {}) {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const app = createApp(db, { secret: SECRET, origins: [ORIGIN], silent: true, authLimit: 100, ...overrides });
  function request(path: string, options: {
    method?: string; cookie?: string; body?: unknown; raw?: string; headers?: Record<string, string>;
  } = {}) {
    const headers: Record<string, string> = { ...options.headers };
    if (options.cookie) headers.cookie = options.cookie;
    if (options.body !== undefined && !Object.keys(headers).some(name => name.toLowerCase() === 'content-type')) headers['content-type'] = 'application/json';
    return app.request(path, {
      method: options.method ?? 'GET', headers,
      body: options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
    });
  }
  async function register(email = 'owner@example.com', name = 'Owner') {
    const response = await request('/api/auth/register', { method: 'POST', body: { name, email, password: PASSWORD } });
    assert.equal(response.status, 201, 'Registration must succeed');
    const { user } = await response.json() as { user: Identity['user'] };
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie, 'Registration must establish a session');
    return { cookie, user };
  }
  async function task(identity: Identity, body: Partial<Task> = {}) {
    const response = await request('/api/tasks', { method: 'POST', cookie: identity.cookie, body: { title: 'Write report', ...body } });
    assert.equal(response.status, 201, 'Task creation must succeed');
    return (await response.json() as { task: Task }).task;
  }
  async function key(identity: Identity) {
    const response = await request('/api/keys', { method: 'POST', cookie: identity.cookie, body: { name: 'Daily reminders' } });
    assert.equal(response.status, 201);
    return await response.json() as { key: { id: string }; secret: string };
  }
  return { db, app, request, register, task, key };
}

async function expectError(response: Response, status: number, code?: string) {
  assert.equal(response.status, status);
  const payload = await response.json() as { error: { code: string; message: string; request_id: string } };
  if (code) assert.equal(payload.error.code, code);
  assert.ok(payload.error.request_id);
  assert.ok(payload.error.message);
  assert.equal(response.headers.get('x-request-id'), payload.error.request_id);
  return payload;
}
const shiftedDate = (days: number) => {
  const date = new Date(`${bangkokDate()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

test('production rejects the shared demo account, existing sessions and integration keys',async t=>{
  const f=fixture(t),demo=await f.register('demo@taskflow.local'),key=await f.key(demo);
  const production=createApp(f.db,{secret:SECRET,origins:[ORIGIN],production:true,silent:true});
  const credentials={name:'Demo',email:'demo@taskflow.local',password:PASSWORD};
  for(const [path,status] of [['login',401],['register',400]] as const) {
    assert.equal((await production.request(`/api/auth/${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(credentials)})).status,status);
  }
  assert.equal((await production.request('/api/sk09/draft',{headers:{cookie:demo.cookie}})).status,401);
  assert.equal((await production.request('/api/integrations/due-tasks',{headers:{'x-api-key':key.secret}})).status,401);
  assert.equal((await f.request('/api/auth/me',{cookie:demo.cookie})).status,200);
});

test('registration accepts 8 and 16 characters and rejects passwords outside that range', async t => {
  const f = fixture(t);
  for (const length of [7, 8, 16, 17]) {
    const response = await f.request('/api/auth/register', { method: 'POST', body: {
      name: 'Boundary tester', email: `length${length}@example.com`, password: 'a'.repeat(length),
    } });
    assert.equal(response.status, length === 8 || length === 16 ? 201 : 400);
  }
});

test('tasks sort unfinished work by due date then priority with undated and completed work last',async t=>{
  const f=fixture(t), owner=await f.register();
  const specs: Partial<Task>[]=[
    {title:'No date low',priority:'low'},
    {title:'Tomorrow high',due_date:shiftedDate(1),priority:'high'},
    {title:'Today low',due_date:shiftedDate(0),priority:'low'},
    {title:'Today medium',due_date:shiftedDate(0),priority:'medium'},
    {title:'Today high',due_date:shiftedDate(0),priority:'high'},
    {title:'Overdue low',due_date:shiftedDate(-2),priority:'low'},
    {title:'Completed old',due_date:shiftedDate(-5),status:'completed',priority:'high'},
    {title:'No date high',priority:'high'},
  ];
  for(const spec of specs) await f.task(owner,spec);
  const data=await (await f.request('/api/tasks',{cookie:owner.cookie})).json();
  assert.deepEqual(data.tasks.map((task:Task)=>task.title),['Overdue low','Today high','Today medium','Today low','Tomorrow high','No date high','No date low','Completed old']);
});

test('in-app notifications include overdue and the next three Bangkok days, scoped to owner and independent of email receipts',async t=>{
  const f=fixture(t), owner=await f.register(), other=await f.register('other@example.com');
  const overdue=await f.task(owner,{title:'Overdue task',due_date:shiftedDate(-1),priority:'low'});
  await f.task(owner,{title:'Today high',due_date:shiftedDate(0),priority:'high'});
  await f.task(owner,{title:'Three days',due_date:shiftedDate(3)});
  await f.task(owner,{title:'Four days',due_date:shiftedDate(4)});
  await f.task(owner,{title:'No deadline'});
  await f.task(owner,{title:'Done today',due_date:shiftedDate(0),status:'completed'});
  await f.task(other,{title:'Private other task',due_date:shiftedDate(0)});
  f.db.prepare('INSERT INTO reminder_deliveries(id,user_id,task_id,notification_date,channel,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),owner.user.id,overdue.id,shiftedDate(0),'email',new Date().toISOString());
  assert.equal((await f.request('/api/notifications')).status,401);
  readNotifications(f.db,owner.user.id,new Date(`${shiftedDate(0)}T07:00:00+07:00`));
  const data=await (await f.request('/api/notifications',{cookie:owner.cookie})).json();
  assert.equal(data.today,shiftedDate(0)); assert.equal(data.through,shiftedDate(3)); assert.equal(data.count,3);
  assert.deepEqual(data.tasks.map((task:Task)=>task.title),['Overdue task','Today high','Three days']);
  await f.request(`/api/tasks/${overdue.id}`,{method:'PATCH',cookie:owner.cookie,body:{status:'completed'}});
  assert.equal((await (await f.request('/api/notifications',{cookie:owner.cookie})).json()).count,2);
  await f.request(`/api/tasks/${overdue.id}`,{method:'PATCH',cookie:owner.cookie,body:{status:'pending',due_date:shiftedDate(5)}});
  assert.equal((await (await f.request('/api/notifications',{cookie:owner.cookie})).json()).count,2);
});

test('registration normalizes email, trims name, hashes password, and returns only public fields', async t => {
  const f = fixture(t);
  const identity = await f.register('  OWNER@Example.COM  ', '  Owner  ');
  assert.deepEqual(Object.keys(identity.user).sort(), ['avatar_url', 'email', 'email_verified_at', 'id', 'name', 'nickname', 'phone']);
  assert.equal(identity.user.email, 'owner@example.com');
  assert.equal(identity.user.name, 'Owner');
  const stored = f.db.prepare('SELECT email,password_hash FROM users WHERE id=?').get(identity.user.id) as { email: string; password_hash: string };
  assert.equal(stored.email, 'owner@example.com');
  assert.ok(stored.password_hash !== PASSWORD, 'Stored value must not be the submitted password');
  assert.match(stored.password_hash, /^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
  assert.equal(await checkPassword(PASSWORD, stored.password_hash), true);
  assert.equal(await checkPassword('incorrect-password', stored.password_hash), false);
  await expectError(await f.request('/api/auth/register', { method: 'POST', body: { name: 'Duplicate', email: 'OWNER@example.com', password: PASSWORD } }), 409, 'EMAIL_EXISTS');
});

test('password salts differ for users with the same password', async t => {
  const f = fixture(t);
  await f.register('first@example.com');
  await f.register('second@example.com');
  const hashes = f.db.prepare('SELECT password_hash FROM users').all() as { password_hash: string }[];
  assert.equal(hashes.length, 2);
  assert.ok(hashes[0].password_hash !== hashes[1].password_hash, 'Each password requires an independent salt');
});

test('login uses HttpOnly SameSite session, serves public identity, and never returns a token in JSON', async t => {
  const f = fixture(t);
  await f.register();
  const response = await f.request('/api/auth/login', { method: 'POST', body: { email: ' OWNER@EXAMPLE.COM ', password: PASSWORD } });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie')!;
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Max-Age=18000/i);
  const claims = decodeJwt(cookie.split(';')[0].split('=')[1]);
  assert.equal(claims.exp! - claims.iat!, 5 * 60 * 60);
  const session = f.db.prepare('SELECT created_at,expires_at FROM auth_sessions WHERE id=?').get(String(claims.sid)) as { created_at: string; expires_at: string };
  assert.ok(Math.abs(Date.parse(session.expires_at) - Date.parse(session.created_at) - 5 * 60 * 60_000) < 1000);
  assert.match(cookie, /Path=\//i);
  assert.deepEqual(Object.keys(await response.json()), ['user']);
  const me = await f.request('/api/auth/me', { cookie: cookie.split(';')[0] });
  assert.equal(me.status, 200);
  assert.deepEqual(Object.keys((await me.json()).user).sort(), ['avatar_url', 'email', 'email_verified_at', 'id', 'name', 'nickname', 'phone']);
  assert.equal(me.headers.get('cache-control'), 'no-store');
});

test('production session cookie is Secure', async t => {
  const f = fixture(t, { production: true });
  const response = await f.request('/api/auth/register', { method: 'POST', body: { name: 'Owner', email: 'owner@example.com', password: PASSWORD } });
  assert.equal(response.status, 201);
  assert.match(response.headers.get('set-cookie')!, /Secure/i);
});

test('unknown account and wrong password have the same public error', async t => {
  const f = fixture(t);
  await f.register();
  const wrong = await expectError(await f.request('/api/auth/login', { method: 'POST', body: { email: 'owner@example.com', password: 'wrong' } }), 401, 'INVALID_CREDENTIALS');
  const unknown = await expectError(await f.request('/api/auth/login', { method: 'POST', body: { email: 'unknown@example.com', password: 'wrong' } }), 401, 'INVALID_CREDENTIALS');
  assert.equal(wrong.error.message, unknown.error.message);
});

test('expired JWT and expired server session are rejected even when otherwise valid', async t => {
  const f = fixture(t);
  const owner = await f.register();
  const token = owner.cookie.slice(owner.cookie.indexOf('=') + 1);
  const claims = decodeJwt(token);
  const expired = await new SignJWT({ sid: claims.sid }).setProtectedHeader({ alg: 'HS256' }).setSubject(owner.user.id)
    .setIssuer('taskflow').setAudience('taskflow-web').setIssuedAt(1).setExpirationTime(2).sign(new TextEncoder().encode(SECRET));
  await expectError(await f.request('/api/tasks', { cookie: `taskflow_session=${expired}` }), 401, 'SESSION_EXPIRED');
  f.db.prepare('UPDATE auth_sessions SET expires_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z', String(claims.sid));
  await expectError(await f.request('/api/tasks', { cookie: owner.cookie }), 401, 'SESSION_EXPIRED');
});

test('tampered JWT, wrong issuer/audience/algorithm, and missing claims are rejected', async t => {
  const f = fixture(t);
  const owner = await f.register();
  const token = owner.cookie.slice(owner.cookie.indexOf('=') + 1);
  const claims = decodeJwt(token);
  const parts = token.split('.');
  parts[1] = Buffer.from(JSON.stringify({ ...claims, sub: randomUUID() })).toString('base64url');
  await expectError(await f.request('/api/tasks', { cookie: `taskflow_session=${parts.join('.')}` }), 401);
  for (const variant of [
    { alg: 'HS256', issuer: 'other-app', audience: 'taskflow-web', payload: { sid: claims.sid } },
    { alg: 'HS256', issuer: 'taskflow', audience: 'other-client', payload: { sid: claims.sid } },
    { alg: 'HS384', issuer: 'taskflow', audience: 'taskflow-web', payload: { sid: claims.sid } },
    { alg: 'HS256', issuer: 'taskflow', audience: 'taskflow-web', payload: {} },
  ]) {
    const invalid = await new SignJWT(variant.payload).setProtectedHeader({ alg: variant.alg }).setSubject(owner.user.id)
      .setIssuer(variant.issuer).setAudience(variant.audience).setIssuedAt().setExpirationTime('30m').sign(new TextEncoder().encode(SECRET));
    await expectError(await f.request('/api/tasks', { cookie: `taskflow_session=${invalid}` }), 401);
  }
});

test('logout revokes the stored session, clears cookie, and rejects replay of the old JWT', async t => {
  const f = fixture(t);
  const owner = await f.register();
  const response = await f.request('/api/auth/logout', { method: 'POST', cookie: owner.cookie });
  assert.equal(response.status, 204);
  assert.match(response.headers.get('set-cookie')!, /Max-Age=0/i);
  assert.equal((f.db.prepare('SELECT COUNT(*) count FROM auth_sessions WHERE revoked_at IS NOT NULL').get() as { count: number }).count, 1);
  await expectError(await f.request('/api/auth/me', { cookie: owner.cookie }), 401);
  assert.equal((await f.request('/api/auth/logout', { method: 'POST', cookie: owner.cookie })).status, 204);
});

test('anonymous access is denied across protected root and child paths', async t => {
  const f = fixture(t);
  for (const path of ['/api/tasks', '/api/tasks/', '/api/tasks/missing', '/api/keys', '/api/keys/missing', '/api/summary', '/api/reminders']) {
    await expectError(await f.request(path), 401);
  }
});

test('protected POST and PATCH handlers run once despite root/wildcard middleware patterns', async t => {
  const f = fixture(t);
  const owner = await f.register();
  const prepare = f.db.prepare.bind(f.db);
  let sessionReads = 0;
  f.db.prepare = sql => {
    if (sql.includes('JOIN auth_sessions')) sessionReads++;
    return prepare(sql);
  };
  const task = await f.task(owner);
  assert.equal(sessionReads, 1, 'POST /api/tasks must authenticate once');
  assert.equal((f.db.prepare('SELECT COUNT(*) count FROM tasks').get() as { count: number }).count, 1);
  sessionReads = 0;
  const response = await f.request(`/api/tasks/${task.id}`, { method: 'PATCH', cookie: owner.cookie, body: { status: 'in_progress' } });
  assert.equal(response.status, 200);
  assert.equal(sessionReads, 1, 'PATCH /api/tasks/:id must authenticate once');
  assert.equal((await response.json()).task.status, 'in_progress');
  assert.equal((f.db.prepare('SELECT COUNT(*) count FROM tasks').get() as { count: number }).count, 1);
  for (const path of ['/api/tasks', '/api/keys']) {
    sessionReads = 0;
    const list = await f.request(path, { cookie: owner.cookie });
    assert.equal(list.status, 200);
    assert.equal(sessionReads, 1, `${path} must authenticate once`);
  }
});

test('task GET/PATCH/DELETE hide other owners with 404 and preserve their records', async t => {
  const f = fixture(t);
  const first = await f.register('first@example.com');
  const second = await f.register('second@example.com');
  const task = await f.task(first);
  for (const method of ['GET', 'PATCH', 'DELETE']) {
    await expectError(await f.request(`/api/tasks/${task.id}`, { method, cookie: second.cookie, ...(method === 'PATCH' ? { body: { title: 'Stolen task' } } : {}) }), 404, 'NOT_FOUND');
  }
  assert.equal((await f.request(`/api/tasks/${task.id}`, { cookie: first.cookie })).status, 200);
  assert.equal((f.db.prepare('SELECT title FROM tasks WHERE id=?').get(task.id) as { title: string }).title, 'Write report');
});

test('task list, summary, filters and reminder history are scoped to the authenticated user', async t => {
  const f = fixture(t);
  const first = await f.register('first@example.com');
  const second = await f.register('second@example.com');
  const pending = await f.task(first, { title: 'First overdue report', due_date: shiftedDate(-1), priority: 'high' });
  await f.task(first, { title: 'First complete report', status: 'completed', due_date: shiftedDate(-2) });
  await f.task(second, { title: 'Second private task', due_date: shiftedDate(-1), status: 'in_progress' });
  const list = await f.request('/api/tasks', { cookie: first.cookie });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).tasks.length, 2);
  const filtered = await f.request('/api/tasks?status=pending&priority=high&search=overdue', { cookie: first.cookie });
  assert.deepEqual((await filtered.json()).tasks.map((task: Task) => task.id), [pending.id]);
  const summary = await f.request('/api/summary', { cookie: first.cookie });
  assert.deepEqual((await summary.json()).summary, { total: 2, pending: 1, in_progress: 0, completed: 1, overdue: 1 });
  const emptySummary = await f.request('/api/summary', { cookie: second.cookie });
  assert.equal((await emptySummary.json()).summary.total, 1);
  const reminders = await f.request('/api/reminders', { cookie: second.cookie });
  assert.deepEqual((await reminders.json()).reminders, []);
});

test('PATCH changes only supplied fields and permits explicitly clearing due_date', async t => {
  const f = fixture(t);
  const owner = await f.register();
  const original = await f.task(owner, { title: 'Original title', description: 'Keep this description', priority: 'high', status: 'in_progress', due_date: shiftedDate(3) });
  const response = await f.request(`/api/tasks/${original.id}`, { method: 'PATCH', cookie: owner.cookie, body: { title: 'Updated title' } });
  assert.equal(response.status, 200);
  const updated = (await response.json()).task as Task;
  assert.equal(updated.title, 'Updated title');
  for (const field of ['description', 'priority', 'status', 'due_date'] as const) assert.equal(updated[field], original[field], `PATCH must preserve ${field}`);
  const cleared = await f.request(`/api/tasks/${original.id}`, { method: 'PATCH', cookie: owner.cookie, body: { due_date: null } });
  assert.equal(cleared.status, 200);
  assert.equal((await cleared.json()).task.due_date, null);
});

test('task creation ignores supplied user_id and associates the record with the session', async t => {
  const f = fixture(t);
  const first = await f.register('first@example.com');
  const second = await f.register('second@example.com');
  const response = await f.request('/api/tasks', { method: 'POST', cookie: first.cookie, body: { title: 'My own task', user_id: second.user.id } });
  assert.equal(response.status, 201);
  const id = (await response.json()).task.id;
  assert.equal((f.db.prepare('SELECT user_id FROM tasks WHERE id=?').get(id) as { user_id: string }).user_id, first.user.id);
});

test('task invalid title, calendar date, priority, status, or empty PATCH returns 400 without mutations', async t => {
  const f = fixture(t);
  const owner = await f.register();
  for (const body of [
    { title: ' ' }, { title: 'Valid title', due_date: '2026-02-30' },
    { title: 'Valid title', due_date: '13/10/2026' }, { title: 'Valid title', due_date: '2026-00-01' },
    { title: 'Valid title', priority: 'urgent' }, { title: 'Valid title', status: 'deleted' },
  ]) await expectError(await f.request('/api/tasks', { method: 'POST', cookie: owner.cookie, body }), 400, 'VALIDATION_ERROR');
  const task = await f.task(owner);
  for (const body of [{}, { unexpected: 'value' }]) await expectError(await f.request(`/api/tasks/${task.id}`, { method: 'PATCH', cookie: owner.cookie, body }), 400, 'VALIDATION_ERROR');
  assert.equal((f.db.prepare('SELECT COUNT(*) count FROM tasks').get() as { count: number }).count, 1);
});

test('invalid list filters are rejected with 400', async t => {
  const f = fixture(t);
  const owner = await f.register();
  for (const suffix of ['status=deleted', 'priority=urgent', `search=${'x'.repeat(121)}`]) {
    await expectError(await f.request(`/api/tasks?${suffix}`, { cookie: owner.cookie }), 400, 'INVALID_FILTER');
  }
});

test('malformed JSON returns 400 and unsupported media type returns 415', async t => {
  const f = fixture(t);
  const owner = await f.register();
  await expectError(await f.request('/api/tasks', { method: 'POST', cookie: owner.cookie, raw: '{invalid', headers: { 'content-type': 'application/json' } }), 400, 'INVALID_JSON');
  await expectError(await f.request('/api/tasks', { method: 'POST', cookie: owner.cookie, body: { title: 'Valid task' }, headers: { 'content-type': 'text/plain' } }), 415, 'JSON_REQUIRED');
});

test('media types sharing the JSON prefix are rejected rather than parsed as application/json', async t => {
  const f = fixture(t);
  const owner = await f.register();
  await expectError(await f.request('/api/tasks', { method: 'POST', cookie: owner.cookie, body: { title: 'Valid task' }, headers: { 'content-type': 'application/jsonp' } }), 415, 'JSON_REQUIRED');
  assert.equal((f.db.prepare('SELECT COUNT(*) count FROM tasks').get() as { count: number }).count, 0);
});

test('JSON media type parameters remain supported', async t => {
  const f = fixture(t);
  const owner = await f.register();
  const response = await f.request('/api/tasks', { method: 'POST', cookie: owner.cookie, body: { title: 'Valid task' }, headers: { 'content-type': 'application/json; charset=utf-8' } });
  assert.equal(response.status, 201);
});

test('oversized body returns 413 and does not insert a task', async t => {
  const f = fixture(t);
  const owner = await f.register();
  await expectError(await f.request('/api/tasks', { method: 'POST', cookie: owner.cookie, body: { title: 'Valid task', description: 'x'.repeat(17 * 1024) } }), 413, 'BODY_TOO_LARGE');
  assert.equal((f.db.prepare('SELECT COUNT(*) count FROM tasks').get() as { count: number }).count, 0);
});

test('unapproved origin or cross-site fetch is rejected; configured origin and server request work', async t => {
  const f = fixture(t);
  const owner = await f.register();
  for (const headers of [{ origin: 'https://evil.example' }, { origin: ORIGIN, 'sec-fetch-site': 'cross-site' }]) {
    await expectError(await f.request('/api/tasks', { method: 'POST', cookie: owner.cookie, body: { title: 'Valid task' }, headers }), 403, 'ORIGIN_DENIED');
  }
  assert.equal((await f.request('/api/tasks', { method: 'POST', cookie: owner.cookie, body: { title: 'Approved task' }, headers: { origin: ORIGIN } })).status, 201);
  assert.equal((await f.request('/api/tasks', { method: 'POST', cookie: owner.cookie, body: { title: 'Server request' } })).status, 201);
});

test('auth rate limit returns 429 with Retry-After independently per client', async t => {
  const f = fixture(t, { authLimit: 2, clientIp: c => c.req.header('x-test-client') ?? 'client-a' });
  const body = { email: 'unknown@example.com', password: 'invalid' };
  for (let i = 0; i < 2; i++) await expectError(await f.request('/api/auth/login', { method: 'POST', body }), 401);
  const blocked = await f.request('/api/auth/login', { method: 'POST', body });
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  await expectError(blocked, 429, 'RATE_LIMITED');
  await expectError(await f.request('/api/auth/login', { method: 'POST', body, headers: { 'x-test-client': 'client-b' } }), 401);
});

test('SQL constraints enforce foreign keys, enums, unique email, and unique receipt independently of API', async t => {
  const f = fixture(t);
  const owner = await f.register();
  const insert = f.db.prepare('INSERT INTO tasks(id,user_id,title,description,priority,status,due_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)');
  const params = [randomUUID(), owner.user.id, 'Valid task', '', 'medium', 'pending', null, '2026-10-13', '2026-10-13'] as const;
  assert.throws(() => insert.run(params[0], 'missing-user', ...params.slice(2)), /FOREIGN KEY/);
  assert.throws(() => insert.run(params[0], owner.user.id, 'Valid task', '', 'urgent', 'pending', null, '2026-10-13', '2026-10-13'), /CHECK/);
  assert.throws(() => insert.run(params[0], owner.user.id, 'Valid task', '', 'medium', 'deleted', null, '2026-10-13', '2026-10-13'), /CHECK/);
  assert.throws(() => f.db.prepare('INSERT INTO users(id,name,email,password_hash,created_at) VALUES(?,?,?,?,?)').run(randomUUID(), 'Other', owner.user.email, 'irrelevant', '2026-10-13'), /UNIQUE/);
  const task = await f.task(owner);
  const receipt = f.db.prepare('INSERT INTO reminder_deliveries(id,user_id,task_id,notification_date,channel,created_at) VALUES(?,?,?,?,?,?)');
  receipt.run(randomUUID(), owner.user.id, task.id, '2026-10-13', 'email', '2026-10-13');
  assert.throws(() => receipt.run(randomUUID(), owner.user.id, task.id, '2026-10-13', 'email', '2026-10-13'), /UNIQUE/);
  assert.throws(() => receipt.run(randomUUID(), owner.user.id, task.id, '2026-10-13', 'sms', '2026-10-13'), /CHECK/);
});

test('SQL injection search cannot leak another user or drop tables; wildcard characters are literal', async t => {
  const f = fixture(t);
  const first = await f.register('first@example.com');
  const second = await f.register('second@example.com');
  const literal = await f.task(first, { title: '100%_literal search' });
  await f.task(second, { title: 'Private task' });
  for (const attack of ["' OR 1=1 --", "'; DROP TABLE tasks; --", "') UNION SELECT * FROM users --"]) {
    const response = await f.request(`/api/tasks?search=${encodeURIComponent(attack)}`, { cookie: first.cookie });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).tasks, []);
  }
  const percent = await f.request('/api/tasks?search=%25_', { cookie: first.cookie });
  assert.deepEqual((await percent.json()).tasks.map((task: Task) => task.id), [literal.id]);
  assert.equal((f.db.prepare('SELECT COUNT(*) count FROM tasks').get() as { count: number }).count, 2);
  assert.equal((f.db.prepare('SELECT COUNT(*) count FROM users').get() as { count: number }).count, 2);
});

test('API key is returned once, stored as a hash, and omitted from list responses', async t => {
  const f = fixture(t);
  const owner = await f.register();
  const issued = await f.key(owner);
  assert.ok(issued.secret.startsWith('tf_'), 'Integration credential must use its known prefix');
  const stored = f.db.prepare('SELECT secret_hash,scope FROM api_keys WHERE id=?').get(issued.key.id) as { secret_hash: string; scope: string };
  assert.ok(stored.secret_hash === hashApiKey(issued.secret), 'Database must store only the secret digest');
  assert.ok(stored.secret_hash !== issued.secret);
  assert.equal(stored.scope, 'reminders');
  const list = await f.request('/api/keys', { cookie: owner.cookie });
  const payload = await list.json();
  assert.equal(payload.keys.length, 1);
  assert.equal(payload.secret, undefined);
  assert.equal(payload.keys[0].secret, undefined);
  assert.equal(payload.keys[0].secret_hash, undefined);
  const data = JSON.stringify(payload);
  assert.ok(!data.includes(issued.secret), 'A later response must not disclose the full secret');
});

test('integration key cannot authorize task CRUD or key administration and session alone cannot call integration', async t => {
  const f = fixture(t);
  const owner = await f.register();
  const task = await f.task(owner);
  const issued = await f.key(owner);
  for (const [path, method, body] of [
    ['/api/tasks', 'GET', undefined], ['/api/tasks', 'POST', { title: 'Forbidden task' }],
    [`/api/tasks/${task.id}`, 'PATCH', { status: 'completed' }], [`/api/tasks/${task.id}`, 'DELETE', undefined],
    ['/api/keys', 'GET', undefined],
  ] as const) await expectError(await f.request(path, { method, body, headers: { 'x-api-key': issued.secret } }), 401);
  await expectError(await f.request('/api/integrations/due-tasks', { cookie: owner.cookie }), 401, 'INVALID_API_KEY');
});

test('keys are user-scoped and another user cannot list or revoke them', async t => {
  const f = fixture(t);
  const first = await f.register('first@example.com');
  const second = await f.register('second@example.com');
  const issued = await f.key(first);
  const list = await f.request('/api/keys', { cookie: second.cookie });
  assert.deepEqual((await list.json()).keys, []);
  await expectError(await f.request(`/api/keys/${issued.key.id}`, { method: 'DELETE', cookie: second.cookie }), 404);
  assert.equal((await f.request('/api/integrations/due-tasks', { headers: { 'x-api-key': issued.secret } })).status, 200);
});

test('revoked, expired, malformed and missing integration keys are rejected', async t => {
  const f = fixture(t);
  const owner = await f.register();
  const revoked = await f.key(owner);
  assert.equal((await f.request(`/api/keys/${revoked.key.id}`, { method: 'DELETE', cookie: owner.cookie })).status, 204);
  const expired = await f.key(owner);
  f.db.prepare('UPDATE api_keys SET expires_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z', expired.key.id);
  for (const value of [undefined, 'incorrect-key', 'x'.repeat(101), revoked.secret, expired.secret]) {
    await expectError(await f.request('/api/integrations/due-tasks', { headers: value ? { 'x-api-key': value } : {} }), 401, 'INVALID_API_KEY');
  }
});

test('active key limit is enforced and revocation frees a slot', async t => {
  const f = fixture(t);
  const owner = await f.register();
  const keys = [];
  for (let i = 0; i < 5; i++) keys.push(await f.key(owner));
  await expectError(await f.request('/api/keys', { method: 'POST', cookie: owner.cookie, body: { name: 'Sixth key' } }), 409, 'KEY_LIMIT');
  assert.equal((await f.request(`/api/keys/${keys[0].key.id}`, { method: 'DELETE', cookie: owner.cookie })).status, 204);
  await f.key(owner);
});

test('due integration includes today/overdue unfinished tasks only for its key owner', async t => {
  const f = fixture(t);
  const first = await f.register('first@example.com');
  const second = await f.register('second@example.com');
  const overdue = await f.task(first, { title: 'Overdue task', due_date: shiftedDate(-1) });
  const today = await f.task(first, { title: 'Today task', due_date: bangkokDate(), status: 'in_progress' });
  await f.task(first, { title: 'Future task', due_date: shiftedDate(1) });
  await f.task(first, { title: 'Complete task', due_date: bangkokDate(), status: 'completed' });
  await f.task(first, { title: 'No date task', due_date: null });
  await f.task(second, { title: 'Other user task', due_date: bangkokDate() });
  const issued = await f.key(first);
  const response = await f.request('/api/integrations/due-tasks', { headers: { 'x-api-key': issued.secret } });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.date, bangkokDate());
  assert.deepEqual(payload.user, { id: first.user.id, name: first.user.name, email: first.user.email });
  assert.deepEqual(payload.tasks.map((task: Task) => task.id), [overdue.id, today.id]);
  assert.ok((f.db.prepare('SELECT last_used_at FROM api_keys WHERE id=?').get(issued.key.id) as { last_used_at: string }).last_used_at);
  await expectError(await f.request('/api/integrations/due-tasks?date=2026-02-30', { headers: { 'x-api-key': issued.secret } }), 400, 'INVALID_DATE');
});

test('reminder receipts are idempotent, omit sent tasks the same day, and return them next day', async t => {
  const f = fixture(t);
  const owner = await f.register();
  const task = await f.task(owner, { due_date: bangkokDate() });
  const issued = await f.key(owner);
  const headers = { 'x-api-key': issued.secret };
  const body = { task_ids: [task.id, task.id], date: bangkokDate(), channel: 'email' };
  const first = await f.request('/api/integrations/reminders', { method: 'POST', headers, body });
  assert.equal(first.status, 200);
  assert.equal((await first.json()).recorded, 1);
  const repeat = await f.request('/api/integrations/reminders', { method: 'POST', headers, body });
  assert.equal(repeat.status, 200);
  assert.equal((await repeat.json()).recorded, 0);
  const due = await f.request('/api/integrations/due-tasks', { headers });
  assert.deepEqual((await due.json()).tasks, []);
  const next = await f.request(`/api/integrations/due-tasks?date=${shiftedDate(1)}`, { headers });
  assert.deepEqual((await next.json()).tasks.map((task: Task) => task.id), [task.id]);
  const history = await f.request('/api/reminders', { cookie: owner.cookie });
  assert.equal((await history.json()).reminders.length, 1);
});

test('receipt containing one unauthorized task rolls back atomically and does not leak history', async t => {
  const f = fixture(t);
  const first = await f.register('first@example.com');
  const second = await f.register('second@example.com');
  const own = await f.task(first, { due_date: bangkokDate() });
  const foreign = await f.task(second, { due_date: bangkokDate() });
  const issued = await f.key(first);
  await expectError(await f.request('/api/integrations/reminders', { method: 'POST', headers: { 'x-api-key': issued.secret }, body: { task_ids: [own.id, foreign.id], date: bangkokDate(), channel: 'email' } }), 404, 'NOT_FOUND');
  assert.equal((f.db.prepare('SELECT COUNT(*) count FROM reminder_deliveries').get() as { count: number }).count, 0);
  const due = await f.request('/api/integrations/due-tasks', { headers: { 'x-api-key': issued.secret } });
  assert.deepEqual((await due.json()).tasks.map((task: Task) => task.id), [own.id]);
  const success = await f.request('/api/integrations/reminders', { method: 'POST', headers: { 'x-api-key': issued.secret }, body: { task_ids: [own.id], date: bangkokDate(), channel: 'email' } });
  assert.equal(success.status, 200, 'Rollback must leave the connection usable');
  const foreignHistory = await f.request('/api/reminders', { cookie: second.cookie });
  assert.deepEqual((await foreignHistory.json()).reminders, []);
});

test('receipt schema rejects empty task list, invalid date, and unsupported channel', async t => {
  const f = fixture(t);
  const owner = await f.register();
  const task = await f.task(owner);
  const issued = await f.key(owner);
  for (const body of [
    { task_ids: [], date: bangkokDate(), channel: 'email' },
    { task_ids: [task.id], date: '2026-02-30', channel: 'email' },
    { task_ids: [task.id], date: bangkokDate(), channel: 'sms' },
  ]) await expectError(await f.request('/api/integrations/reminders', { method: 'POST', headers: { 'x-api-key': issued.secret }, body }), 400, 'VALIDATION_ERROR');
  assert.equal((f.db.prepare('SELECT COUNT(*) count FROM reminder_deliveries').get() as { count: number }).count, 0);
});

test('deleting an owned task returns 204 and removes its reminder history through SQL cascade', async t => {
  const f = fixture(t);
  const owner = await f.register();
  const task = await f.task(owner);
  const issued = await f.key(owner);
  await f.request('/api/integrations/reminders', { method: 'POST', headers: { 'x-api-key': issued.secret }, body: { task_ids: [task.id], date: bangkokDate(), channel: 'email' } });
  assert.equal((await f.request(`/api/tasks/${task.id}`, { method: 'DELETE', cookie: owner.cookie })).status, 204);
  await expectError(await f.request(`/api/tasks/${task.id}`, { cookie: owner.cookie }), 404);
  assert.equal((f.db.prepare('SELECT COUNT(*) count FROM reminder_deliveries').get() as { count: number }).count, 0);
});

test('health, unknown routes, and configuration validation produce predictable behavior', async t => {
  const f = fixture(t);
  const response = await f.request('/api/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', service: 'taskflow-api' });
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  await expectError(await f.request('/api/not-a-route'), 404, 'NOT_FOUND');
  assert.throws(() => createApp(f.db, { secret: 'short', origins: [ORIGIN], silent: true }), /JWT_SECRET/);
});
