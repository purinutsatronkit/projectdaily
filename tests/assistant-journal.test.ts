import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../apps/api/src/app.ts';
import { openDatabase } from '../apps/api/src/db.ts';

test('journal AI suggests editable text from the supplied work only and never saves it', async t => {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  let sent = '';
  const gemini: typeof fetch = async (_url, init) => {
    sent = JSON.parse(String(init?.body)).contents[0].parts[0].text;
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ suggestion: 'ได้ฝึกตรวจโค้ดและบันทึกสิ่งที่ต้องแก้ไข' }) }] } }] });
  };
  const app = createApp(db, { secret: 'taskflow-assistant-test-secret-at-least-32-chars', origins: ['http://localhost:5173'], silent: true, assistant: { key: 'test-key', fetch: gemini } });
  const post = (path: string, body: object, cookie?: string) => app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  const registration = await post('/api/auth/register', { name: 'Tester', email: 'assistant-journal@example.com', password: 'Password12' });
  assert.equal(registration.status, 201);
  const cookie = registration.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  assert.equal((await post('/api/assistant/journal-suggestion', { assignment: 'ตรวจโค้ด' })).status, 401);
  const response = await post('/api/assistant/journal-suggestion', { assignment: 'ตรวจโค้ดและจดจุดที่ต้องแก้' }, cookie);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).suggestion, 'ได้ฝึกตรวจโค้ดและบันทึกสิ่งที่ต้องแก้ไข');
  assert.match(sent, /ตรวจโค้ดและจดจุดที่ต้องแก้/);
  assert.doesNotMatch(sent, /assistant-journal@example\.com|Tester/);
  const journal = await app.request('/api/journal?from=2026-10-30&to=2026-10-30', { headers: { cookie } });
  assert.deepEqual((await journal.json()).entries, []);
});

test('journal AI rejects missing work and reports an exhausted quota', async t => {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const app = createApp(db, { secret: 'taskflow-assistant-test-secret-at-least-32-chars', origins: ['http://localhost:5173'], silent: true, assistant: { key: 'test-key', fetch: async () => new Response('', { status: 429 }) } });
  const register = await app.request('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Tester', email: 'quota@example.com', password: 'Password12' }) });
  const cookie = register.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  const post = (assignment: string) => app.request('/api/assistant/journal-suggestion', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ assignment }) });
  assert.equal((await post('')).status, 400);
  const quota = await post('เขียนและตรวจรายงาน');
  assert.equal(quota.status, 503);
  assert.equal((await quota.json()).error.code, 'AI_QUOTA');
});
