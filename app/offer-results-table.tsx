"use client";

import { useMemo, useState } from "react";

type OfferResultsRow = {
  offerId: number;
  paymentType: string;
  rollsIntoOfferId: number | null;
  approximateDollarCost: number;
  cumulativeCost: number;
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
      rows.filter((row) => row.rollsIntoOfferId === null).map((row) => row.offerId),
    );
  }, [rows]);

  const childRowsByAnchor = useMemo(() => {
    const grouped = new Map<number, OfferResultsRow[]>();
    for (const row of rows) {
      if (row.rollsIntoOfferId === null) {
        continue;
      }
      grouped.set(row.rollsIntoOfferId, [...(grouped.get(row.rollsIntoOfferId) ?? []), row]);
    }
    return grouped;
  }, [rows]);

  const [expandedAnchors, setExpandedAnchors] = useState<Set<number>>(new Set());

  const visibleRows = useMemo(() => {
    const flattened: Array<OfferResultsRow & { isRolledChild: boolean }> = [];

    for (const row of rows) {
      if (row.rollsIntoOfferId !== null && anchorIds.has(row.rollsIntoOfferId)) {
        continue;
      }

      const isAnchor = row.rollsIntoOfferId === null;
      flattened.push({ ...row, isRolledChild: !isAnchor });

      if (!isAnchor) {
        continue;
      }

      if (!expandedAnchors.has(row.offerId)) {
        continue;
      }

      for (const childRow of childRowsByAnchor.get(row.offerId) ?? []) {
        flattened.push({ ...childRow, isRolledChild: true });
      }
    }

    return flattened;
  }, [anchorIds, childRowsByAnchor, expandedAnchors, rows]);

  function toggleAnchor(anchorOfferId: number) {
    setExpandedAnchors((current) => {
      const next = new Set(current);
      if (next.has(anchorOfferId)) {
        next.delete(anchorOfferId);
      } else {
        next.add(anchorOfferId);
      }
      return next;
    });
  }

  return (
    <table className="resultsTable">
      <thead>
        <tr>
          <th>Offer</th>
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
          const childCount = childRowsByAnchor.get(row.offerId)?.length ?? 0;
          const isAnchor = row.rollsIntoOfferId === null;
          const canToggle = isAnchor && childCount > 0;
          const isExpanded = expandedAnchors.has(row.offerId);

          return (
            <tr
              key={row.offerId}
              className={row.isRolledChild ? "rolledOfferRow" : undefined}
            >
              <td>
                <div className="offerCell">
                  {canToggle ? (
                    <button
                      type="button"
                      className="offerToggle"
                      onClick={() => toggleAnchor(row.offerId)}
                      aria-expanded={isExpanded}
                      aria-label={
                        isExpanded
                          ? `Hide rolled offers for anchor ${row.offerId}`
                          : `Show rolled offers for anchor ${row.offerId}`
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
                    {row.offerId}
                  </span>
                  {canToggle ? (
                    <span className="offerToggleCount muted">{childCount}</span>
                  ) : null}
                </div>
              </td>
              <td>{row.paymentType}</td>
              <td>
                {row.rollsIntoOfferId ? (
                  <span className="muted">Rolls into {row.rollsIntoOfferId}</span>
                ) : (
                  <span className="pill">Anchor</span>
                )}
              </td>
              <td>${row.approximateDollarCost.toFixed(2)}</td>
              <td>${row.cumulativeCost.toFixed(2)}</td>
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

function formatRatio(value: number | null) {
  return value === null ? "-" : value.toFixed(2);
}
