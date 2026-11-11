import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('../scripts/setup-email.mjs', import.meta.url));

test('email setup preserves existing settings, quoted origins, and is idempotent', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'taskflow-email-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const source = ' # SMTP_FROM=comment@example.test\r\n  APP_ORIGIN = "https://tasks.example.test"\r\nSMTP_USER=owner@example.test\r\nSMTP_PASS=\r\nAPP_ORIGIN=https://ignored.example.test\r\n';
  writeFileSync(join(cwd, '.env'), source);
  const run = () => spawnSync(process.execPath, [script], { cwd, encoding: 'utf8', timeout: 5_000 });
  assert.equal(run().status, 0);
  const updated = readFileSync(join(cwd, '.env'), 'utf8');
  assert.ok(updated.startsWith(source));
  assert.ok(updated.includes('APP_PUBLIC_URL=https://tasks.example.test\n'));
  assert.ok(updated.includes('\nSMTP_FROM=\n'));
  assert.equal(updated.split('\n').filter(line => line.startsWith('SMTP_USER=')).length, 1);
  assert.equal(run().status, 0);
  assert.equal(readFileSync(join(cwd, '.env'), 'utf8'), updated);
});

test('email setup handles long whitespace and malformed lines within a bounded time', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'taskflow-email-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  writeFileSync(join(cwd, '.env'), ' '.repeat(500_000) + '\n' + 'A'.repeat(500_000) + '!\nAPP_ORIGIN=\n');
  const result = spawnSync(process.execPath, [script], { cwd, encoding: 'utf8', timeout: 5_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.ok(readFileSync(join(cwd, '.env'), 'utf8').includes('APP_PUBLIC_URL=http://localhost:5174\n'));
});
