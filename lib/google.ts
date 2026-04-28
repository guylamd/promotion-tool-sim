import { startOAuthState } from "@/lib/auth";
import { getUserById, updateUserTokens, type DbUser } from "@/lib/db";
import { getAppUrl, getRequiredEnv } from "@/lib/env";

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
};

type GoogleUserProfile = {
  sub: string;
  email: string;
  name: string;
  picture?: string;
};

export function extractSpreadsheetId(input: string) {
  const trimmed = input.trim();
  const directIdPattern = /^[a-zA-Z0-9-_]{20,}$/;

  if (directIdPattern.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) {
    return match[1];
  }

  throw new Error("Enter a valid Google Sheets URL or spreadsheet ID.");
}

export function buildSpreadsheetUrl(spreadsheetId: string) {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

export async function buildGoogleAuthUrl() {
  const state = await startOAuthState();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", getRequiredEnv("GOOGLE_CLIENT_ID"));
  url.searchParams.set("redirect_uri", `${getAppUrl()}/api/auth/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/spreadsheets.readonly",
    ].join(" "),
  );
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

async function postForm<T>(url: string, body: URLSearchParams) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function exchangeCodeForTokens(code: string) {
  return postForm<GoogleTokenResponse>(
    "https://oauth2.googleapis.com/token",
    new URLSearchParams({
      code,
      client_id: getRequiredEnv("GOOGLE_CLIENT_ID"),
      client_secret: getRequiredEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: `${getAppUrl()}/api/auth/callback`,
      grant_type: "authorization_code",
    }),
  );
}

export async function refreshAccessToken(user: DbUser) {
  if (!user.refreshToken) {
    if (!user.accessToken) {
      throw new Error("This Google session is missing a refresh token. Sign in again.");
    }

    return user.accessToken;
  }

  if (user.accessToken && user.accessTokenExpiresAt && user.accessTokenExpiresAt > Date.now() + 60_000) {
    return user.accessToken;
  }

  const tokens = await postForm<GoogleTokenResponse>(
    "https://oauth2.googleapis.com/token",
    new URLSearchParams({
      client_id: getRequiredEnv("GOOGLE_CLIENT_ID"),
      client_secret: getRequiredEnv("GOOGLE_CLIENT_SECRET"),
      refresh_token: user.refreshToken,
      grant_type: "refresh_token",
    }),
  );

  updateUserTokens(user.id, {
    accessToken: tokens.access_token,
    accessTokenExpiresAt: Date.now() + tokens.expires_in * 1000,
  });

  const refreshedUser = getUserById(user.id);
  return refreshedUser?.accessToken ?? tokens.access_token;
}

export async function fetchGoogleProfile(accessToken: string) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Google profile (${response.status})`);
  }

  return (await response.json()) as GoogleUserProfile;
}

type GoogleSheetValueRange = {
  range: string;
  majorDimension?: "ROWS" | "COLUMNS";
  values?: string[][];
};

type GoogleSheetMetadataResponse = {
  properties: { title: string };
  sheets: { properties: { title: string; index: number; sheetId: number } }[];
};

type GoogleSheetBatchResponse = {
  valueRanges?: GoogleSheetValueRange[];
};

export type SpreadsheetSnapshot = {
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle: string;
  fetchedAt: string;
  tabs: Record<string, string[][]>;
};

export async function loadSpreadsheetSnapshot(user: DbUser, spreadsheetId: string) {
  const accessToken = await refreshAccessToken(user);
  const metadata = await fetchSpreadsheetMetadata(accessToken, spreadsheetId);
  const ranges = metadata.sheets.map((sheet) => `${quoteTabTitle(sheet.properties.title)}!A:AZ`);
  const tabs = await fetchSpreadsheetRanges(accessToken, spreadsheetId, ranges);

  const snapshot: SpreadsheetSnapshot = {
    spreadsheetId,
    spreadsheetUrl: buildSpreadsheetUrl(spreadsheetId),
    spreadsheetTitle: metadata.properties.title,
    fetchedAt: new Date().toISOString(),
    tabs,
  };

  return snapshot;
}

async function fetchSpreadsheetMetadata(accessToken: string, spreadsheetId: string) {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties(title),sheets(properties(title,index,sheetId))`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to load spreadsheet metadata (${response.status})`);
  }

  return (await response.json()) as GoogleSheetMetadataResponse;
}

async function fetchSpreadsheetRanges(
  accessToken: string,
  spreadsheetId: string,
  ranges: string[],
) {
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet`,
  );
  url.searchParams.set("majorDimension", "ROWS");

  for (const range of ranges) {
    url.searchParams.append("ranges", range);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load spreadsheet values (${response.status})`);
  }

  const data = (await response.json()) as GoogleSheetBatchResponse;
  const tabs: Record<string, string[][]> = {};

  for (const valueRange of data.valueRanges ?? []) {
    const actualTitle = valueRange.range.split("!")[0].replace(/^'/, "").replace(/'$/, "").replace(/''/g, "'");
    tabs[actualTitle] = valueRange.values ?? [];
  }

  return tabs;
}

function quoteTabTitle(title: string) {
  return `'${title.replace(/'/g, "''")}'`;
}
