import { Pool } from "pg";

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
  var __promotionSimulatorPgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __promotionSimulatorSchemaReady: Promise<void> | undefined;
}

function getDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }
  return value;
}

function getPool() {
  if (!global.__promotionSimulatorPgPool) {
    global.__promotionSimulatorPgPool = new Pool({
      connectionString: getDatabaseUrl(),
      ssl: { rejectUnauthorized: false },
    });
  }
  return global.__promotionSimulatorPgPool;
}

async function ensureSchema() {
  if (!global.__promotionSimulatorSchemaReady) {
    global.__promotionSimulatorSchemaReady = (async () => {
      const pool = getPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id BIGSERIAL PRIMARY KEY,
          google_id TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL,
          name TEXT NOT NULL,
          picture TEXT,
          access_token TEXT,
          access_token_expires_at BIGINT,
          refresh_token TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS user_recent_sheets (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          spreadsheet_id TEXT NOT NULL,
          spreadsheet_url TEXT NOT NULL,
          spreadsheet_title TEXT,
          last_snapshot_hash TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(user_id, spreadsheet_id)
        );

        CREATE TABLE IF NOT EXISTS user_preferences (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          preference_key TEXT NOT NULL,
          preference_value TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(user_id, preference_key)
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
        CREATE INDEX IF NOT EXISTS idx_recent_sheets_user_updated ON user_recent_sheets(user_id, updated_at DESC);
      `);
    })();
  }

  await global.__promotionSimulatorSchemaReady;
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
    spreadsheetTitle: row.spreadsheet_title ? String(row.spreadsheet_title) : null,
    lastSnapshotHash: row.last_snapshot_hash ? String(row.last_snapshot_hash) : null,
    updatedAt: String(row.updated_at),
  };
}

export async function upsertUser(input: {
  googleId: string;
  email: string;
  name: string;
  picture?: string | null;
  accessToken?: string | null;
  accessTokenExpiresAt?: number | null;
  refreshToken?: string | null;
}): Promise<DbUser> {
  await ensureSchema();
  const pool = getPool();

  const result = await pool.query(
    `
      INSERT INTO users (
        google_id,
        email,
        name,
        picture,
        access_token,
        access_token_expires_at,
        refresh_token,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (google_id)
      DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        picture = EXCLUDED.picture,
        access_token = COALESCE(EXCLUDED.access_token, users.access_token),
        access_token_expires_at = COALESCE(EXCLUDED.access_token_expires_at, users.access_token_expires_at),
        refresh_token = COALESCE(EXCLUDED.refresh_token, users.refresh_token),
        updated_at = NOW()
      RETURNING *
    `,
    [
      input.googleId,
      input.email,
      input.name,
      input.picture ?? null,
      input.accessToken ?? null,
      input.accessTokenExpiresAt ?? null,
      input.refreshToken ?? null,
    ],
  );

  return mapUser(result.rows[0] as Record<string, unknown>);
}

export async function getUserById(id: number): Promise<DbUser | null> {
  await ensureSchema();
  const result = await getPool().query("SELECT * FROM users WHERE id = $1", [id]);
  if (result.rows.length === 0) {
    return null;
  }
  return mapUser(result.rows[0] as Record<string, unknown>);
}

export async function updateUserTokens(
  userId: number,
  input: {
    accessToken?: string | null;
    accessTokenExpiresAt?: number | null;
    refreshToken?: string | null;
  },
): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `
      UPDATE users
      SET access_token = COALESCE($1, access_token),
          access_token_expires_at = COALESCE($2, access_token_expires_at),
          refresh_token = COALESCE($3, refresh_token),
          updated_at = NOW()
      WHERE id = $4
    `,
    [
      input.accessToken ?? null,
      input.accessTokenExpiresAt ?? null,
      input.refreshToken ?? null,
      userId,
    ],
  );
}

export async function createSession(userId: number, token: string, expiresAt: Date): Promise<void> {
  await ensureSchema();
  await getPool().query(
    "INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)",
    [userId, token, expiresAt.toISOString()],
  );
}

export async function getSession(token: string): Promise<DbSession | null> {
  await ensureSchema();
  const result = await getPool().query("SELECT * FROM sessions WHERE token = $1", [token]);
  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0] as Record<string, unknown>;
  const session: DbSession = {
    id: Number(row.id),
    userId: Number(row.user_id),
    token: String(row.token),
    expiresAt: String(row.expires_at),
  };

  if (Date.parse(session.expiresAt) <= Date.now()) {
    await deleteSession(token);
    return null;
  }

  return session;
}

export async function deleteSession(token: string): Promise<void> {
  await ensureSchema();
  await getPool().query("DELETE FROM sessions WHERE token = $1", [token]);
}

export async function saveRecentSheet(input: {
  userId: number;
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle?: string | null;
  lastSnapshotHash?: string | null;
}): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `
      INSERT INTO user_recent_sheets (
        user_id,
        spreadsheet_id,
        spreadsheet_url,
        spreadsheet_title,
        last_snapshot_hash,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (user_id, spreadsheet_id)
      DO UPDATE SET
        spreadsheet_url = EXCLUDED.spreadsheet_url,
        spreadsheet_title = COALESCE(EXCLUDED.spreadsheet_title, user_recent_sheets.spreadsheet_title),
        last_snapshot_hash = COALESCE(EXCLUDED.last_snapshot_hash, user_recent_sheets.last_snapshot_hash),
        updated_at = NOW()
    `,
    [
      input.userId,
      input.spreadsheetId,
      input.spreadsheetUrl,
      input.spreadsheetTitle ?? null,
      input.lastSnapshotHash ?? null,
    ],
  );
}

export async function listRecentSheets(userId: number): Promise<RecentSheet[]> {
  await ensureSchema();
  const result = await getPool().query(
    `
      SELECT *
      FROM user_recent_sheets
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT 20
    `,
    [userId],
  );
  return result.rows.map((row: Record<string, unknown>) => mapRecentSheet(row));
}

export async function deleteRecentSheet(userId: number, spreadsheetId: string): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `
      DELETE FROM user_recent_sheets
      WHERE user_id = $1 AND spreadsheet_id = $2
    `,
    [userId, spreadsheetId],
  );
}
