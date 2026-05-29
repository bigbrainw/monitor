import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import path from 'path'
import * as schema from './schema'

const dbPath = path.join(process.cwd(), 'monitor.db')
const sqlite = new Database(dbPath)

sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })

// Create tables if they don't exist (simple migration-less setup)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    color TEXT DEFAULT '#6366f1',
    status TEXT DEFAULT 'active' NOT NULL,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')) NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'claude' NOT NULL,
    status TEXT DEFAULT 'idle' NOT NULL,
    notes TEXT DEFAULT '',
    pid INTEGER,
    auto_detected INTEGER DEFAULT 0 NOT NULL,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')) NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER REFERENCES agents(id) ON DELETE CASCADE,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'todo' NOT NULL,
    priority TEXT DEFAULT 'med' NOT NULL,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')) NOT NULL
  );

  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'todo' NOT NULL,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')) NOT NULL
  );

  CREATE TABLE IF NOT EXISTS memory_sync (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL UNIQUE,
    last_line_count INTEGER DEFAULT 0 NOT NULL,
    last_ingested_at TEXT
  );
`)

// Additive migrations for existing DBs
for (const sql of [
  'ALTER TABLE agents ADD COLUMN pid INTEGER',
  'ALTER TABLE agents ADD COLUMN auto_detected INTEGER DEFAULT 0 NOT NULL',
  "ALTER TABLE agents ADD COLUMN plan TEXT DEFAULT ''",
  "ALTER TABLE agents ADD COLUMN stage TEXT DEFAULT ''",
  "ALTER TABLE agents ADD COLUMN risks TEXT DEFAULT ''",
]) {
  try { sqlite.exec(sql) } catch { /* column already exists */ }
}
