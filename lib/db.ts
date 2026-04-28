import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { getDataDir } from "@/lib/env";

export type DbUser = {
  id: number;
  googleId: string;
  email: string;
  name: string;
  picture: string | null;
  accessToken: string | null;
  accessTokenExpiresAt: number | null;
  refreshToken: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DbSession = {
  id: number;
  userId: number;
  token: string;
  expiresAt: string;
};

export type RecentSheet = {
  id: number;
  userId: number;
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle: string | null;
  lastSnapshotHash: string | null;
  updatedAt: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __promotionSimulatorDb: DatabaseSync | undefined;
}

function getDbPath() {
  const configuredDataDir = getDataDir();
  const dataDir = configuredDataDir || path.join(process.cwd(), ".data");
  fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, "promotion-simulator.sqlite");
}

function initDb(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      google_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      picture TEXT,
      access_token TEXT,
      access_token_expires_at INTEGER,
      refresh_token TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_recent_sheets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      spreadsheet_id TEXT NOT NULL,
      spreadsheet_url TEXT NOT NULL,
      spreadsheet_title TEXT,
      last_snapshot_hash TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, spreadsheet_id)
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      preference_key TEXT NOT NULL,
      preference_value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, preference_key)
    );
  `);
}

export function getDb() {
  if (!global.__promotionSimulatorDb) {
    global.__promotionSimulatorDb = new DatabaseSync(getDbPath());
    initDb(global.__promotionSimulatorDb);
  }

  return global.__promotionSimulatorDb;
}

function mapUser(row: Record<string, unknown>): DbUser {
  return {
    id: Number(row.id),
    googleId: String(row.google_id),
    email: String(row.email),
    name: String(row.name),
    picture: row.picture ? String(row.picture) : null,
    accessToken: row.access_token ? String(row.access_token) : null,
    accessTokenExpiresAt: row.access_token_expires_at
      ? Number(row.access_token_expires_at)
      : null,
    refreshToken: row.refresh_token ? String(row.refresh_token) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapRecentSheet(row: Record<string, unknown>): RecentSheet {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    spreadsheetId: String(row.spreadsheet_id),
    spreadsheetUrl: String(row.spreadsheet_url),
    spreadsheetTitle: row.spreadsheet_title
      ? String(row.spreadsheet_title)
      : null,
    lastSnapshotHash: row.last_snapshot_hash
      ? String(row.last_snapshot_hash)
      : null,
    updatedAt: String(row.updated_at),
  };
}

export function upsertUser(input: {
  googleId: string;
  email: string;
  name: string;
  picture?: string | null;
  accessToken?: string | null;
  accessTokenExpiresAt?: number | null;
  refreshToken?: string | null;
}) {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM users WHERE google_id = ?")
    .get(input.googleId) as Record<string, unknown> | undefined;

  if (existing) {
    db.prepare(`
      UPDATE users
      SET email = ?,
          name = ?,
          picture = ?,
          access_token = COALESCE(?, access_token),
          access_token_expires_at = COALESCE(?, access_token_expires_at),
          refresh_token = COALESCE(?, refresh_token),
          updated_at = CURRENT_TIMESTAMP
      WHERE google_id = ?
    `).run(
      input.email,
      input.name,
      input.picture ?? null,
      input.accessToken ?? null,
      input.accessTokenExpiresAt ?? null,
      input.refreshToken ?? null,
      input.googleId,
    );

    return mapUser(
      db.prepare("SELECT * FROM users WHERE google_id = ?").get(input.googleId) as Record<
        string,
        unknown
      >,
    );
  }

  db.prepare(`
    INSERT INTO users (
      google_id,
      email,
      name,
      picture,
      access_token,
      access_token_expires_at,
      refresh_token
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.googleId,
    input.email,
    input.name,
    input.picture ?? null,
    input.accessToken ?? null,
    input.accessTokenExpiresAt ?? null,
    input.refreshToken ?? null,
  );

  return mapUser(
    db.prepare("SELECT * FROM users WHERE google_id = ?").get(input.googleId) as Record<
      string,
      unknown
    >,
  );
}

export function getUserById(id: number) {
  const row = getDb()
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;

  return row ? mapUser(row) : null;
}

export function updateUserTokens(
  userId: number,
  input: {
    accessToken?: string | null;
    accessTokenExpiresAt?: number | null;
    refreshToken?: string | null;
  },
) {
  getDb()
    .prepare(`
      UPDATE users
      SET access_token = COALESCE(?, access_token),
          access_token_expires_at = COALESCE(?, access_token_expires_at),
          refresh_token = COALESCE(?, refresh_token),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .run(
      input.accessToken ?? null,
      input.accessTokenExpiresAt ?? null,
      input.refreshToken ?? null,
      userId,
    );
}

export function createSession(userId: number, token: string, expiresAt: Date) {
  getDb()
    .prepare("INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)")
    .run(userId, token, expiresAt.toISOString());
}

export function getSession(token: string) {
  const row = getDb()
    .prepare("SELECT * FROM sessions WHERE token = ?")
    .get(token) as Record<string, unknown> | undefined;

  if (!row) {
    return null;
  }

  const session: DbSession = {
    id: Number(row.id),
    userId: Number(row.user_id),
    token: String(row.token),
    expiresAt: String(row.expires_at),
  };

  if (Date.parse(session.expiresAt) <= Date.now()) {
    deleteSession(token);
    return null;
  }

  return session;
}

export function deleteSession(token: string) {
  getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function saveRecentSheet(input: {
  userId: number;
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle?: string | null;
  lastSnapshotHash?: string | null;
}) {
  getDb()
    .prepare(`
      INSERT INTO user_recent_sheets (
        user_id,
        spreadsheet_id,
        spreadsheet_url,
        spreadsheet_title,
        last_snapshot_hash,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, spreadsheet_id)
      DO UPDATE SET
        spreadsheet_url = excluded.spreadsheet_url,
        spreadsheet_title = COALESCE(excluded.spreadsheet_title, user_recent_sheets.spreadsheet_title),
        last_snapshot_hash = COALESCE(excluded.last_snapshot_hash, user_recent_sheets.last_snapshot_hash),
        updated_at = CURRENT_TIMESTAMP
    `)
    .run(
      input.userId,
      input.spreadsheetId,
      input.spreadsheetUrl,
      input.spreadsheetTitle ?? null,
      input.lastSnapshotHash ?? null,
    );
}

export function listRecentSheets(userId: number) {
  const rows = getDb()
    .prepare(`
      SELECT *
      FROM user_recent_sheets
      WHERE user_id = ?
      ORDER BY updated_at DESC
      LIMIT 8
    `)
    .all(userId) as Record<string, unknown>[];

  return rows.map(mapRecentSheet);
}
