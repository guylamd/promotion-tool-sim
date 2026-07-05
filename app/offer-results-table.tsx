"use client";

import { useMemo, useState } from "react";

type OfferResultsRow = {
  purchaseIndex: number;
  offerId: number;
  paymentType: string;
  rollsIntoOfferId: number | null;
  rollsIntoPurchaseIndex: number | null;
  approximateDollarCost: number;
  costAmount: number;
  costUnit: string;
  cumulativeCostAmount: number;
  mainValue: number;
  bundleValue: number;
  barValue: number;
  currentDirect: number;
  currentOther: number;
  cumulativeDirect: number;
  cumulativeOther: number;
  cumulativeTotalSpinsValue: number;
  incrementalSlopeWithoutBar: number | null;
  incrementalSlopeWithBar: number | null;
  cumulativeSlopeWithoutBar: number | null;
  cumulativeSlopeWithBar: number | null;
  averageBarMilestonesCompleted: number;
};

export function OfferResultsTable({ rows }: { rows: OfferResultsRow[] }) {
  const anchorIds = useMemo(() => {
    return new Set(
      rows.filter((row) => row.rollsIntoPurchaseIndex === null).map((row) => row.purchaseIndex),
    );
  }, [rows]);

  const childRowsByAnchor = useMemo(() => {
    const grouped = new Map<number, OfferResultsRow[]>();
    for (const row of rows) {
      if (row.rollsIntoPurchaseIndex === null) {
        continue;
      }
      grouped.set(row.rollsIntoPurchaseIndex, [...(grouped.get(row.rollsIntoPurchaseIndex) ?? []), row]);
    }
    return grouped;
  }, [rows]);

  const [expandedAnchors, setExpandedAnchors] = useState<Set<number>>(new Set());

  const visibleRows = useMemo(() => {
    const flattened: Array<OfferResultsRow & { isRolledChild: boolean }> = [];

    for (const row of rows) {
      if (row.rollsIntoPurchaseIndex !== null && anchorIds.has(row.rollsIntoPurchaseIndex)) {
        continue;
      }

      const isAnchor = row.rollsIntoPurchaseIndex === null;
      flattened.push({ ...row, isRolledChild: !isAnchor });

      if (!isAnchor) {
        continue;
      }

      if (!expandedAnchors.has(row.purchaseIndex)) {
        continue;
      }

      for (const childRow of childRowsByAnchor.get(row.purchaseIndex) ?? []) {
        flattened.push({ ...childRow, isRolledChild: true });
      }
    }

    return flattened;
  }, [anchorIds, childRowsByAnchor, expandedAnchors, rows]);

  function toggleAnchor(anchorPurchaseIndex: number) {
    setExpandedAnchors((current) => {
      const next = new Set(current);
      if (next.has(anchorPurchaseIndex)) {
        next.delete(anchorPurchaseIndex);
      } else {
        next.add(anchorPurchaseIndex);
      }
      return next;
    });
  }

  return (
    <table className="resultsTable">
      <thead>
        <tr>
          <th>Purchase</th>
          <th>Offer ID</th>
          <th>Payment</th>
          <th>Rollup</th>
          <th>Cost</th>
          <th>Cumulative cost</th>
          <th>Main Rewards Value</th>
          <th>Bundle Rewards Value</th>
          <th>Progress Bar Rewards Value</th>
          <th>Direct Energy Spins Value</th>
          <th>Other Rewards Spins Value</th>
          <th>Cumulative Direct Energy Spins Value</th>
          <th>Cumulative Other Rewards Spins Value</th>
          <th>Cumulative Total Spins Value</th>
          <th>Slope no bar</th>
          <th>Slope with bar</th>
          <th>Cumulative no bar</th>
          <th>Cumulative with bar</th>
          <th>Avg milestones</th>
        </tr>
      </thead>
      <tbody>
        {visibleRows.map((row) => {
          const childCount = childRowsByAnchor.get(row.purchaseIndex)?.length ?? 0;
          const isAnchor = row.rollsIntoPurchaseIndex === null;
          const canToggle = isAnchor && childCount > 0;
          const isExpanded = expandedAnchors.has(row.purchaseIndex);

          return (
            <tr
              key={row.purchaseIndex}
              className={row.isRolledChild ? "rolledOfferRow" : undefined}
            >
              <td>
                <div className="offerCell">
                  {canToggle ? (
                    <button
                      type="button"
                      className="offerToggle"
                      onClick={() => toggleAnchor(row.purchaseIndex)}
                      aria-expanded={isExpanded}
                      aria-label={
                        isExpanded
                          ? `Hide rolled offers for purchase ${row.purchaseIndex}`
                          : `Show rolled offers for purchase ${row.purchaseIndex}`
                      }
                    >
                      <span className="mono">{isExpanded ? "-" : "+"}</span>
                    </button>
                  ) : (
                    <span className="offerToggleSpacer" aria-hidden="true" />
                  )}
                  <span
                    className={`mono ${row.isRolledChild ? "rolledOfferLabel" : ""}`}
                  >
                    {row.purchaseIndex}
                  </span>
                  {canToggle ? (
                    <span className="offerToggleCount muted">{childCount}</span>
                  ) : null}
                </div>
              </td>
              <td className="mono">{row.offerId}</td>
              <td>{row.paymentType}</td>
              <td>
                {row.rollsIntoOfferId ? (
                  <span className="muted">Rolls into {row.rollsIntoOfferId}</span>
                ) : (
                  <span className="pill">Anchor</span>
                )}
              </td>
              <td>{formatCost(row.costAmount, row.costUnit)}</td>
              <td>{formatCost(row.cumulativeCostAmount, row.costUnit)}</td>
              <td>{formatNumber(row.mainValue)}</td>
              <td>{formatNumber(row.bundleValue)}</td>
              <td>{formatNumber(row.barValue)}</td>
              <td>{formatNumber(row.currentDirect)}</td>
              <td>{formatNumber(row.currentOther)}</td>
              <td>{formatNumber(row.cumulativeDirect)}</td>
              <td>{formatNumber(row.cumulativeOther)}</td>
              <td>{formatNumber(row.cumulativeTotalSpinsValue)}</td>
              <td>{formatRatio(row.incrementalSlopeWithoutBar)}</td>
              <td>{formatRatio(row.incrementalSlopeWithBar)}</td>
              <td>{formatRatio(row.cumulativeSlopeWithoutBar)}</td>
              <td>{formatRatio(row.cumulativeSlopeWithBar)}</td>
              <td>{row.averageBarMilestonesCompleted.toFixed(2)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function formatCost(value: number, unit: string) {
  if (unit === "$") {
    return `$${value.toFixed(2)}`;
  }
  return `${formatNumber(value)} ${unit}`;
}

function formatRatio(value: number | null) {
  return value === null ? "-" : value.toFixed(2);
}
