PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL, created_at TEXT NOT NULL,
 nickname TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
 avatar BLOB, avatar_type TEXT, avatar_version TEXT
);
CREATE TABLE IF NOT EXISTS auth_sessions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at TEXT NOT NULL, revoked_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON auth_sessions(user_id);
CREATE TABLE IF NOT EXISTS password_reset_tokens (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_password_reset_user_created ON password_reset_tokens(user_id,created_at);
CREATE TABLE IF NOT EXISTS tasks (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 3 AND 120), description TEXT NOT NULL DEFAULT '',
 priority TEXT NOT NULL CHECK(priority IN ('low','medium','high')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed')),
 due_date TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id,status);
CREATE INDEX IF NOT EXISTS idx_tasks_user_due ON tasks(user_id,due_date);
CREATE TABLE IF NOT EXISTS api_keys (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL,
 prefix TEXT NOT NULL, secret_hash TEXT NOT NULL UNIQUE, scope TEXT NOT NULL CHECK(scope = 'reminders'),
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT, last_used_at TEXT
);
CREATE TABLE IF NOT EXISTS reminder_deliveries (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 notification_date TEXT NOT NULL, channel TEXT NOT NULL CHECK(channel = 'email'), created_at TEXT NOT NULL,
 UNIQUE(user_id,task_id,notification_date,channel)
);
CREATE TABLE IF NOT EXISTS email_reminder_batches (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 reminder_date TEXT NOT NULL, sent_at TEXT NOT NULL,
 PRIMARY KEY(user_id,reminder_date)
);
CREATE TABLE IF NOT EXISTS notification_batches (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 notification_date TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(user_id,notification_date)
);
CREATE TABLE IF NOT EXISTS task_notifications (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 notification_date TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT,
 UNIQUE(user_id,task_id,notification_date)
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON task_notifications(user_id,read_at);
CREATE TABLE IF NOT EXISTS sk09_drafts (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 data TEXT NOT NULL, version INTEGER NOT NULL CHECK(version > 0), updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS connected_accounts (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 provider TEXT NOT NULL CHECK(provider IN ('google','github')),
 subject TEXT NOT NULL, login TEXT NOT NULL,
 token_cipher TEXT, updated_at TEXT NOT NULL,
 PRIMARY KEY(user_id,provider), UNIQUE(provider,subject)
);
CREATE TABLE IF NOT EXISTS oauth_states (
 state_hash TEXT PRIMARY KEY, provider TEXT NOT NULL, browser_hash TEXT NOT NULL,
 user_id TEXT REFERENCES users(id) ON DELETE CASCADE, session_id TEXT,
 verifier TEXT NOT NULL, nonce TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pipeline_actions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 repository TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 80), description TEXT NOT NULL DEFAULT '',
 github_repo TEXT, notify_pipeline INTEGER NOT NULL DEFAULT 1 CHECK(notify_pipeline IN (0,1)),
 follow_workflow_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 create_failure_tasks INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id,created_at);
CREATE TABLE IF NOT EXISTS project_members (
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('viewer','editor')),
 created_at TEXT NOT NULL,PRIMARY KEY(project_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id,project_id);
CREATE TABLE IF NOT EXISTS task_github_links (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('issue','pull')),
 repository TEXT NOT NULL, number INTEGER NOT NULL CHECK(number>0),
 created_at TEXT NOT NULL, UNIQUE(task_id,kind,repository,number)
);
CREATE INDEX IF NOT EXISTS idx_task_links_owner ON task_github_links(user_id,task_id);
CREATE TABLE IF NOT EXISTS pipeline_observations (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 repository TEXT NOT NULL, run_id TEXT NOT NULL, state TEXT NOT NULL,
 PRIMARY KEY(user_id,repository,run_id)
);
CREATE TABLE IF NOT EXISTS pipeline_notifications (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
 repository TEXT NOT NULL, run_id TEXT NOT NULL, title TEXT NOT NULL,
 created_at TEXT NOT NULL, read_at TEXT, UNIQUE(user_id,repository,run_id)
);
CREATE INDEX IF NOT EXISTS idx_pipeline_notifications_unread ON pipeline_notifications(user_id,read_at);
CREATE TABLE IF NOT EXISTS email_verifications (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 email TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
 expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_verifications_user ON email_verifications(user_id,created_at);
CREATE TABLE IF NOT EXISTS work_journal (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 work_date TEXT NOT NULL, project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
 assignment TEXT NOT NULL DEFAULT '', result TEXT NOT NULL DEFAULT '', evidence_url TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_work_journal_user_date ON work_journal(user_id,work_date);
CREATE TABLE IF NOT EXISTS task_schedule (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 plan_date TEXT NOT NULL,start_time TEXT NOT NULL,end_time TEXT NOT NULL,
 created_at TEXT NOT NULL,UNIQUE(user_id,task_id,plan_date)
);
CREATE INDEX IF NOT EXISTS idx_task_schedule_day ON task_schedule(user_id,plan_date,start_time);
CREATE TABLE IF NOT EXISTS task_activity (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL,
 owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
 actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 actor_type TEXT NOT NULL DEFAULT 'user' CHECK(actor_type IN ('user','system')),
 task_title TEXT NOT NULL,
 event TEXT NOT NULL CHECK(event IN ('created','updated','deleted')),
 changes TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_activity_task ON task_activity(task_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_activity_project ON task_activity(project_id,created_at DESC);
CREATE TABLE IF NOT EXISTS task_comments (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000), created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id,created_at,id);
CREATE TABLE IF NOT EXISTS task_comment_mentions (
 comment_id TEXT NOT NULL REFERENCES task_comments(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY(comment_id,user_id)
);
CREATE TABLE IF NOT EXISTS mention_notifications (
 id TEXT PRIMARY KEY, comment_id TEXT NOT NULL REFERENCES task_comments(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL, read_at TEXT, UNIQUE(comment_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_mention_unread ON mention_notifications(user_id,read_at,created_at);
CREATE TABLE IF NOT EXISTS direct_conversations (
 id TEXT PRIMARY KEY, user_low TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 user_high TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 CHECK(user_low<user_high),UNIQUE(user_low,user_high)
);
CREATE INDEX IF NOT EXISTS idx_conversations_low ON direct_conversations(user_low,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_high ON direct_conversations(user_high,updated_at DESC);
CREATE TABLE IF NOT EXISTS direct_messages (
 id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,
 sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 body TEXT NOT NULL DEFAULT '' CHECK(length(body)<=4000),
 created_at TEXT NOT NULL, read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON direct_messages(conversation_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON direct_messages(conversation_id,sender_id,read_at);
CREATE TABLE IF NOT EXISTS direct_attachments (
 id TEXT PRIMARY KEY, message_id TEXT NOT NULL UNIQUE REFERENCES direct_messages(id) ON DELETE CASCADE,
 uploader_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 filename TEXT NOT NULL, media_type TEXT NOT NULL,
 size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 5242880), data BLOB NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attachments_uploader ON direct_attachments(uploader_id);
PRAGMA user_version = 12;
