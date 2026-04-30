"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { isDevPreviewEnabled } from "@/lib/env";
import { saveRecentSheet } from "@/lib/db";
import { buildSpreadsheetUrl, extractSpreadsheetId } from "@/lib/google";

export async function connectSheetAction(formData: FormData) {
  const devPreview = isDevPreviewEnabled();
  const user = await getCurrentUser();
  if (!user && !devPreview) {
    redirect("/");
  }

  const input = String(formData.get("sheetUrl") ?? "");
  let spreadsheetId = "dev-preview";

  if (user) {
    spreadsheetId = extractSpreadsheetId(input);
  } else if (input.trim().length > 0) {
    try {
      spreadsheetId = extractSpreadsheetId(input);
    } catch {
      spreadsheetId = "dev-preview";
    }
  }

  if (user) {
    await saveRecentSheet({
      userId: user.id,
      spreadsheetId,
      spreadsheetUrl: buildSpreadsheetUrl(spreadsheetId),
    });
  }

  redirect(`/?sheet=${encodeURIComponent(spreadsheetId)}&refreshed=${Date.now()}`);
}

export async function refreshSheetAction(formData: FormData) {
  return connectSheetAction(formData);
}

export async function toggleThemeAction(formData: FormData) {
  const current = String(formData.get("currentTheme") ?? "light");
  const next = current === "dark" ? "light" : "dark";
  const cookieStore = await cookies();

  cookieStore.set("theme", next, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });

  const returnTo = String(formData.get("returnTo") ?? "/");
  redirect(returnTo);
}
