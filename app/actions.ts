"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { isDevPreviewEnabled } from "@/lib/env";
import { deleteRecentSheet, saveRecentSheet } from "@/lib/db";
import {
  buildSpreadsheetUrl,
  extractSpreadsheetId,
  loadSpreadsheetSnapshot,
  writeSheetValues,
} from "@/lib/google";
import { buildPromotionModel, runSimulation, validatePromotionSheet } from "@/lib/promotion";

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

  const autoExport = isAutoExportEnabled(formData);
  if (user && autoExport) {
    await exportSimulationResults(user, spreadsheetId);
  }

  const autoExportQuery = autoExport ? "&autoExport=1" : "";
  redirect(
    `/?sheet=${encodeURIComponent(spreadsheetId)}&refreshed=${Date.now()}${autoExportQuery}`,
  );
}

export async function refreshSheetAction(formData: FormData) {
  return connectSheetAction(formData);
}

export async function removeRecentSheetAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }

  const spreadsheetId = String(formData.get("spreadsheetId") ?? "").trim();
  if (spreadsheetId) {
    await deleteRecentSheet(user.id, spreadsheetId);
  }

  const currentSheet = String(formData.get("currentSheet") ?? "").trim();
  const autoExportEnabled = String(formData.get("autoExport") ?? "").trim() === "1";
  const query = new URLSearchParams();
  if (currentSheet) {
    query.set("sheet", currentSheet);
  }
  if (autoExportEnabled) {
    query.set("autoExport", "1");
  }

  const suffix = query.toString();
  redirect(suffix ? `/?${suffix}` : "/");
}

export async function exportResultsAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }

  const input = String(formData.get("sheetUrl") ?? "");
  const spreadsheetId = extractSpreadsheetId(input);
  try {
    await exportSimulationResults(user, spreadsheetId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to export results.";
    const hint = message.includes("insufficient")
      ? "Google permission is missing for sheet write. Please sign out and sign in again, then retry export."
      : message;
    redirect(
      `/?sheet=${encodeURIComponent(spreadsheetId)}&error=${encodeURIComponent(hint)}`,
    );
  }

  redirect(`/?sheet=${encodeURIComponent(spreadsheetId)}&refreshed=${Date.now()}`);
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

function buildExportRows(
  snapshotTitle: string,
  result: ReturnType<typeof runSimulation>,
): Array<Array<string | number>> {
  const rows: Array<Array<string | number>> = [];
  const now = new Date().toISOString();

  rows.push(["Promotion Simulator Export"]);
  rows.push(["Promotion", snapshotTitle]);
  rows.push(["Generated at", now]);
  rows.push([]);

  rows.push(["Summary"]);
  rows.push([
    "Run count",
    "Total cost ($)",
    "Total spins direct (no bar)",
    "Total spins all (no bar)",
    "Total spins all (with bar)",
    "Slope no bar",
    "Slope with bar",
  ]);
  rows.push([
    result.runCount,
    round(result.summary.totalApproximateDollarCost),
    round(result.summary.totalDirectEnergySpinsWithoutBar),
    round(result.summary.totalVfmWithoutBar),
    round(result.summary.totalVfmWithBar),
    safeRatio(result.summary.cumulativeSlopeWithoutBar),
    safeRatio(result.summary.cumulativeSlopeWithBar),
  ]);
  rows.push([]);

  rows.push(["Offer ID results"]);
  rows.push([
    "Purchase",
    "Offer ID",
    "Payment",
    "Cost",
    "Cumulative Cost",
    "Main Rewards Value",
    "Bundle Rewards Value",
    "Progress Bar Rewards Value",
    "Direct Energy Spins Value",
    "Other Rewards Spins Value",
    "Cumulative Direct Energy Spins Value",
    "Cumulative Other Rewards Spins Value",
    "Cumulative Total Spins Value",
    "Slope No Bar",
    "Slope With Bar",
    "Cumulative No Bar",
    "Cumulative With Bar",
    "Avg Milestones",
  ]);

  const cumulativeCostByUnit = new Map<string, number>();
  let cumulativeDirect = 0;
  let cumulativeOther = 0;
  for (const row of result.rows) {
    const direct = row.directEnergyMainValue + row.directEnergyBundleValue;
    const other = row.mainValue + row.bundleValue - direct;
    const cumulativeDisplayCost = (cumulativeCostByUnit.get(row.costUnit) ?? 0) + row.costAmount;
    cumulativeCostByUnit.set(row.costUnit, cumulativeDisplayCost);
    cumulativeDirect += direct;
    cumulativeOther += other;
    rows.push([
      row.purchaseIndex,
      row.offerId,
      row.paymentType,
      formatExportCost(row.costAmount, row.costUnit),
      formatExportCost(cumulativeDisplayCost, row.costUnit),
      round(row.mainValue),
      round(row.bundleValue),
      round(row.barValue),
      round(direct),
      round(other),
      round(cumulativeDirect),
      round(cumulativeOther),
      round(cumulativeDirect + cumulativeOther),
      safeRatio(row.incrementalSlopeWithoutBar),
      safeRatio(row.incrementalSlopeWithBar),
      safeRatio(row.cumulativeSlopeWithoutBar),
      safeRatio(row.cumulativeSlopeWithBar),
      round(row.averageBarMilestonesCompleted),
    ]);
  }
  rows.push([]);

  rows.push(["Rewards Distribution per Offer ID"]);
  rows.push([
    "Purchase",
    "Offer ID",
    ...result.rewardIndexDistribution.columns.map((column) => column.label),
  ]);
  for (const distRow of result.rewardIndexDistribution.rows) {
    rows.push([
      distRow.purchaseIndex,
      distRow.offerId,
      ...result.rewardIndexDistribution.columns.map((column) =>
        round((distRow.values[column.key] ?? 0) * 100),
      ),
    ]);
  }

  return rows;
}

function round(value: number) {
  return Number(value.toFixed(4));
}

function formatExportCost(value: number, unit: string) {
  if (unit === "$") {
    return round(value);
  }
  return `${round(value)} ${unit}`;
}

function safeRatio(value: number | null) {
  return value === null ? "" : Number(value.toFixed(4));
}

function isAutoExportEnabled(formData: FormData) {
  return String(formData.get("autoExport") ?? "") === "1";
}

async function exportSimulationResults(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>, spreadsheetId: string) {
  const snapshot = await loadSpreadsheetSnapshot(user, spreadsheetId);
  const validation = validatePromotionSheet(snapshot);
  const built = buildPromotionModel(snapshot, validation);

  if (!built.model) {
    throw new Error("Cannot export results while simulation is blocked by validation errors.");
  }

  const result = runSimulation(built.model);
  const rows = buildExportRows(snapshot.spreadsheetTitle, result);
  await writeSheetValues(user, spreadsheetId, "Simulator Results", rows);
}
