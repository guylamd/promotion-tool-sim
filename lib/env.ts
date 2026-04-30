const DEFAULT_APP_URL = "http://localhost:3000";
const DEFAULT_ALLOWED_EMAIL_DOMAIN = "whalo.com";

export function getAppUrl() {
  const raw = process.env.APP_URL?.trim() || DEFAULT_APP_URL;
  return raw.replace(/\/+$/, "");
}

export function getDataDir() {
  return (
    process.env.DATA_DIR?.trim() ||
    process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim() ||
    ""
  );
}

export function shouldUseSecureCookies() {
  const appUrl = getAppUrl();
  return appUrl.startsWith("https://");
}

export function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function hasGoogleOAuthConfig() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}

export function isDevPreviewEnabled() {
  const value = process.env.DEV_PREVIEW?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function isAllowedEmail(email: string) {
  const domain =
    process.env.ALLOWED_EMAIL_DOMAIN?.trim().toLowerCase() ||
    DEFAULT_ALLOWED_EMAIL_DOMAIN;
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith(`@${domain}`);
}
