"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";

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

type OfferResultsColumn = {
  key: string;
  header: string;
  className?: string;
  render: (row: OfferResultsRow & { isRolledChild: boolean }) => ReactNode;
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

  const [frozenColumns, setFrozenColumns] = useState(2);

  const columns: OfferResultsColumn[] = [
    {
      key: "purchase",
      header: "Purchase",
      className: "colPurchase",
      render: (row) => {
        const childCount = childRowsByAnchor.get(row.purchaseIndex)?.length ?? 0;
        const isAnchor = row.rollsIntoPurchaseIndex === null;
        const canToggle = isAnchor && childCount > 0;
        const isExpanded = expandedAnchors.has(row.purchaseIndex);

        return (
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
            <span className={`mono ${row.isRolledChild ? "rolledOfferLabel" : ""}`}>
              {row.purchaseIndex}
            </span>
            {canToggle ? <span className="offerToggleCount muted">{childCount}</span> : null}
          </div>
        );
      },
    },
    {
      key: "offerId",
      header: "Offer ID",
      className: "colOfferId",
      render: (row) => <span className="mono">{row.offerId}</span>,
    },
    {
      key: "payment",
      header: "Payment",
      className: "colPayment",
      render: (row) => row.paymentType,
    },
    {
      key: "rollup",
      header: "Rollup",
      className: "colRollup",
      render: (row) =>
        row.rollsIntoOfferId ? (
          <span className="muted">Rolls into {row.rollsIntoOfferId}</span>
        ) : (
          <span className="pill">Anchor</span>
        ),
    },
    {
      key: "cost",
      header: "Cost",
      className: "colCost",
      render: (row) => formatCost(row.costAmount, row.costUnit),
    },
    {
      key: "cumulativeCost",
      header: "Cumulative cost",
      className: "colCumulativeCost",
      render: (row) => formatCost(row.cumulativeCostAmount, row.costUnit),
    },
    {
      key: "mainValue",
      header: "Main Rewards Value",
      render: (row) => formatNumber(row.mainValue),
    },
    {
      key: "bundleValue",
      header: "Bundle Rewards Value",
      render: (row) => formatNumber(row.bundleValue),
    },
    {
      key: "barValue",
      header: "Progress Bar Rewards Value",
      render: (row) => formatNumber(row.barValue),
    },
    {
      key: "directValue",
      header: "Direct Energy Spins Value",
      render: (row) => formatNumber(row.currentDirect),
    },
    {
      key: "otherValue",
      header: "Other Rewards Spins Value",
      render: (row) => formatNumber(row.currentOther),
    },
    {
      key: "cumulativeDirect",
      header: "Cumulative Direct Energy Spins Value",
      render: (row) => formatNumber(row.cumulativeDirect),
    },
    {
      key: "cumulativeOther",
      header: "Cumulative Other Rewards Spins Value",
      render: (row) => formatNumber(row.cumulativeOther),
    },
    {
      key: "cumulativeTotal",
      header: "Cumulative Total Spins Value",
      render: (row) => formatNumber(row.cumulativeTotalSpinsValue),
    },
    {
      key: "slopeNoBar",
      header: "Slope no bar",
      render: (row) => formatRatio(row.incrementalSlopeWithoutBar),
    },
    {
      key: "slopeWithBar",
      header: "Slope with bar",
      render: (row) => formatRatio(row.incrementalSlopeWithBar),
    },
    {
      key: "cumulativeNoBar",
      header: "Cumulative no bar",
      render: (row) => formatRatio(row.cumulativeSlopeWithoutBar),
    },
    {
      key: "cumulativeWithBar",
      header: "Cumulative with bar",
      render: (row) => formatRatio(row.cumulativeSlopeWithBar),
    },
    {
      key: "averageMilestones",
      header: "Avg milestones",
      render: (row) => row.averageBarMilestonesCompleted.toFixed(2),
    },
  ];

  return (
    <div className="offerResultsShell">
      <div className="tableToolbar">
        <label className="compactField">
          <span>Freeze columns</span>
          <select
            className="compactSelect"
            value={frozenColumns}
            onChange={(event) => setFrozenColumns(Number(event.target.value))}
          >
            <option value={0}>None</option>
            <option value={1}>Purchase</option>
            <option value={2}>Purchase + Offer ID</option>
            <option value={3}>Through Payment</option>
            <option value={4}>Through Rollup</option>
            <option value={5}>Through Cost</option>
            <option value={6}>Through Cumulative Cost</option>
          </select>
        </label>
      </div>
      <div className="tableWrap offerResultsScroll">
        <table className="resultsTable offerResultsTable">
          <thead>
            <tr>
              {columns.map((column, columnIndex) => (
                <th
                  key={column.key}
                  className={cellClassName(column, columnIndex, frozenColumns)}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr
                key={row.purchaseIndex}
                className={row.isRolledChild ? "rolledOfferRow" : undefined}
              >
                {columns.map((column, columnIndex) => (
                  <td
                    key={`${row.purchaseIndex}-${column.key}`}
                    className={cellClassName(column, columnIndex, frozenColumns)}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function cellClassName(column: OfferResultsColumn, columnIndex: number, frozenColumns: number) {
  const classes = [column.className];
  if (columnIndex < frozenColumns) {
    classes.push("frozenColumn", `frozenColumn${columnIndex}`);
  }
  return classes.filter(Boolean).join(" ");
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
