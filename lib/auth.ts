import crypto from "node:crypto";
import { cookies } from "next/headers";

import {
  createSession,
  deleteSession,
  getSession,
  getUserById,
  type DbUser,
} from "@/lib/db";
import { isAllowedEmail, shouldUseSecureCookies } from "@/lib/env";

const SESSION_COOKIE = "promotion_simulator_session";
const IDENTITY_COOKIE = "promotion_simulator_identity";
const OAUTH_STATE_COOKIE = "promotion_simulator_oauth_state";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;

export async function getCurrentUser(): Promise<DbUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    const session = await getSession(token);
    if (session) {
      const user = await getUserById(session.userId);
      if (user) {
        if (!isAllowedEmail(user.email)) {
          await deleteSession(token);
          return null;
        }
        return user;
      }
    }
  }

  const identityToken = cookieStore.get(IDENTITY_COOKIE)?.value;
  if (!identityToken) {
    return null;
  }

  const payload = verifyIdentityToken(identityToken);
  if (!payload) {
    return null;
  }

  const user = await getUserById(payload.userId);
  if (!user) {
    return null;
  }
  return isAllowedEmail(user.email) ? user : null;
}

export async function startOAuthState() {
  const value = crypto.randomBytes(24).toString("hex");
  const cookieStore = await cookies();
  const secure = shouldUseSecureCookies();

  cookieStore.set(OAUTH_STATE_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 10,
  });

  return value;
}

export async function consumeOAuthState(expected: string) {
  const cookieStore = await cookies();
  const actual = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(OAUTH_STATE_COOKIE);

  return actual === expected;
}

export async function createUserSession(userId: number) {
  const cookieStore = await cookies();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const secure = shouldUseSecureCookies();
  const identityToken = createIdentityToken(userId, expiresAt.getTime());

  await createSession(userId, token, expiresAt);
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: expiresAt,
  });
  cookieStore.set(IDENTITY_COOKIE, identityToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: expiresAt,
  });
}

export async function clearUserSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    await deleteSession(token);
  }

  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(IDENTITY_COOKIE);
}

type IdentityPayload = {
  userId: number;
  expiresAtMs: number;
};

function createIdentityToken(userId: number, expiresAtMs: number) {
  const nonce = crypto.randomBytes(8).toString("hex");
  const body = `${userId}.${expiresAtMs}.${nonce}`;
  const signature = signValue(body);
  return `${body}.${signature}`;
}

function verifyIdentityToken(token: string): IdentityPayload | null {
  const parts = token.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const [userIdRaw, expiresRaw, nonce, signature] = parts;
  if (!userIdRaw || !expiresRaw || !nonce || !signature) {
    return null;
  }

  const userId = Number(userIdRaw);
  const expiresAtMs = Number(expiresRaw);
  if (!Number.isFinite(userId) || !Number.isFinite(expiresAtMs)) {
    return null;
  }

  if (expiresAtMs <= Date.now()) {
    return null;
  }

  const body = `${userIdRaw}.${expiresRaw}.${nonce}`;
  const expected = signValue(body);
  if (!timingSafeEqual(expected, signature)) {
    return null;
  }

  return { userId, expiresAtMs };
}

function signValue(value: string) {
  const secret = process.env.GOOGLE_CLIENT_SECRET ?? "local-dev-secret";
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function timingSafeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}
