import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  db.exec('PRAGMA busy_timeout=5000;');
  // Additive migration preserves existing accounts, tasks and credentials.
  const columns = new Set((db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map(column => column.name));
  for (const [name, definition] of Object.entries({ nickname: "TEXT NOT NULL DEFAULT ''", phone: "TEXT NOT NULL DEFAULT ''", avatar: 'BLOB', avatar_type: 'TEXT', avatar_version: 'TEXT' })) {
    if (!columns.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
  }
  const taskColumns=new Set((db.prepare('PRAGMA table_info(tasks)').all() as {name:string}[]).map(column=>column.name));
  if(!taskColumns.has('project_id')) db.exec('ALTER TABLE tasks ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(user_id,project_id,due_date)');
  const userColumns=new Set((db.prepare('PRAGMA table_info(users)').all() as {name:string}[]).map(column=>column.name));
  if(!userColumns.has('email_verified_at')) db.exec('ALTER TABLE users ADD COLUMN email_verified_at TEXT');
  const projectColumns=new Set((db.prepare('PRAGMA table_info(projects)').all() as {name:string}[]).map(column=>column.name));
  if(!projectColumns.has('create_failure_tasks'))db.exec('ALTER TABLE projects ADD COLUMN create_failure_tasks INTEGER NOT NULL DEFAULT 0');
  const sharedColumns=new Set((db.prepare('PRAGMA table_info(tasks)').all() as {name:string}[]).map(column=>column.name));
  if(!sharedColumns.has('assigned_to'))db.exec('ALTER TABLE tasks ADD COLUMN assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL');
  db.exec('PRAGMA user_version = 10;');
  return db;
}
export type Database = ReturnType<typeof openDatabase>;
