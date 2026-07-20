import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_url TEXT NOT NULL,
  deployment TEXT NOT NULL DEFAULT 'cloud',
  auth_type TEXT NOT NULL DEFAULT 'basic',
  account_id TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  encrypted_token TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jira_id TEXT NOT NULL,
  key TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL,
  status_category TEXT NOT NULL DEFAULT '',
  project_key TEXT NOT NULL,
  project_name TEXT NOT NULL,
  issue_type TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT '',
  time_estimate_seconds INTEGER,
  time_spent_seconds INTEGER,
  due_date TEXT,
  jira_updated TEXT,
  url TEXT NOT NULL,
  synced_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_issues_user_key ON issues(user_id, key);
CREATE INDEX IF NOT EXISTS idx_issues_user_status ON issues(user_id, status);
CREATE INDEX IF NOT EXISTS idx_issues_user_project ON issues(user_id, project_key);
CREATE TABLE IF NOT EXISTS worklogs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issue_key TEXT NOT NULL,
  jira_worklog_id TEXT NOT NULL,
  time_spent_seconds INTEGER NOT NULL,
  started INTEGER NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  author_account_id TEXT NOT NULL DEFAULT '',
  jira_created TEXT,
  jira_updated TEXT,
  synced_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_worklogs_user_issue_jira ON worklogs(user_id, issue_key, jira_worklog_id);
CREATE INDEX IF NOT EXISTS idx_worklogs_user_started ON worklogs(user_id, started);
`;

let instance: ReturnType<typeof createDb> | undefined;

function createDb() {
  const url = env.databaseUrl || "./data/app.db";
  if (url !== ":memory:") {
    mkdirSync(dirname(url), { recursive: true });
  }
  const sqlite = new Database(url);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(BOOTSTRAP_SQL);
  // Lightweight migrations for databases created by older versions
  const userCols = sqlite
    .prepare("SELECT name FROM pragma_table_info('users')")
    .all() as { name: string }[];
  const colNames = new Set(userCols.map((c) => c.name));
  if (!colNames.has("deployment")) {
    sqlite.exec("ALTER TABLE users ADD COLUMN deployment TEXT NOT NULL DEFAULT 'cloud'");
  }
  if (!colNames.has("auth_type")) {
    sqlite.exec("ALTER TABLE users ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'basic'");
  }
  return drizzle(sqlite, { schema: fullSchema });
}

export function getDb() {
  if (!instance) {
    instance = createDb();
  }
  return instance;
}

/** Test helper: reset the singleton (used with DATABASE_URL=":memory:"). */
export function resetDbForTests() {
  instance = undefined;
}
