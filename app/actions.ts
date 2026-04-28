"use server";

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { saveRecentSheet } from "@/lib/db";
import { buildSpreadsheetUrl, extractSpreadsheetId } from "@/lib/google";

export async function connectSheetAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }

  const input = String(formData.get("sheetUrl") ?? "");
  const spreadsheetId = extractSpreadsheetId(input);

  saveRecentSheet({
    userId: user.id,
    spreadsheetId,
    spreadsheetUrl: buildSpreadsheetUrl(spreadsheetId),
  });

  redirect(`/?sheet=${encodeURIComponent(spreadsheetId)}&refreshed=${Date.now()}`);
}

export async function refreshSheetAction(formData: FormData) {
  return connectSheetAction(formData);
}
