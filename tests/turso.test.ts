import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from '../apps/api/src/app.ts';
import { openTursoDatabase } from '../apps/api/src/turso-db.ts';
import { transaction } from '../apps/api/src/context.ts';

test('libSQL persists accounts, tasks and journal entries across reopening', async t => {
  const testRoot = join(process.cwd(), 'data');
  mkdirSync(testRoot, { recursive: true });
  const dir = mkdtempSync(join(testRoot, 'taskflow-libsql-'));
  t.after(() => { try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Windows may retain a native libSQL lock briefly. */ } });
  const url = `file:${join(dir, 'taskflow.sqlite').replaceAll('\\', '/')}`;
  const db = await openTursoDatabase(url, '');
  const app = createApp(db, { secret: 'taskflow-libsql-test-secret-at-least-32-chars', origins: ['http://localhost:5173'], silent: true });
  const request = (path: string, method = 'GET', body?: object, cookie?: string) => app.request(path, {
    method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const registration = await request('/api/auth/register', 'POST', { name: 'Turso User', email: 'turso@example.com', password: 'Password12' });
  assert.equal(registration.status, 201);
  const cookie = registration.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  assert.equal((await request('/api/tasks', 'POST', { title: 'Persistent task' }, cookie)).status, 201);
  assert.equal((await request('/api/journal', 'POST', { work_date: '2026-10-30', assignment: 'Test work', result: 'Done' }, cookie)).status, 201);
  await db.close();
  const reopened = await openTursoDatabase(url, '');
  t.after(() => reopened.close());
  const second = createApp(reopened, { secret: 'taskflow-libsql-test-secret-at-least-32-chars', origins: ['http://localhost:5173'], silent: true });
  const tasks = await second.request('/api/tasks', { headers: { cookie } });
  assert.equal(tasks.status, 200);
  assert.equal((await tasks.json()).tasks[0].title, 'Persistent task');
  const journal = await second.request('/api/journal?from=2026-10-30&to=2026-10-30', { headers: { cookie } });
  assert.equal(journal.status, 200);
  assert.equal((await journal.json()).entries[0].assignment, 'Test work');
  await assert.rejects(transaction(reopened, async () => {
    await reopened.prepare('INSERT INTO tasks(id,user_id,title,description,priority,status,created_at,updated_at) SELECT ?,id,?,?,?,?,?,? FROM users WHERE email=?').run('rolled-back-task', 'Rolled back', '', 'medium', 'pending', new Date().toISOString(), new Date().toISOString(), 'turso@example.com');
    throw new Error('rollback');
  }));
  assert.equal(await reopened.prepare('SELECT id FROM tasks WHERE id=?').get('rolled-back-task'), undefined);
});
