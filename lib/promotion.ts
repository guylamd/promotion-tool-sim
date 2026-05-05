import crypto from "node:crypto";

import type { SpreadsheetSnapshot } from "@/lib/google";

export type Severity = "error" | "warning";
export type ValidationCategory = "tab" | "header" | "config";

export type ValidationIssue = {
  severity: Severity;
  category: ValidationCategory;
  tab: string;
  field?: string;
  message: string;
};

type HeaderDefinition = {
  key: string;
  labels: string[];
};

type TabDefinition = {
  key: string;
  label: string;
  headers: HeaderDefinition[];
};

type ResolvedTab = {
  key: string;
  label: string;
  actualTitle: string;
  rows: string[][];
  rawHeaderIndex: Record<string, number>;
  headerIndex: Record<string, number>;
};

export type ValidationResult = {
  issues: ValidationIssue[];
  blockingIssues: ValidationIssue[];
  resolvedTabs: Record<string, ResolvedTab | undefined>;
};

export type RewardSlot = {
  reward: string;
  amount: number;
};

type MainRow = {
  offerId: number;
  rewardIndex: string;
  rewardIndexLabel: string;
  paymentType: string;
  paymentTypeKey: string;
  group: number | null;
  closeGroup: boolean;
  dollarCost: number | null;
  resourceCost: number | null;
  barPoints: number;
  limit: number | null;
  weight: number | null;
  rewards: RewardSlot[];
};

type BundleRow = {
  bundleId: number;
  limit: number | null;
  barPoints: number;
  rewards: RewardSlot[];
};

type BarRow = {
  barId: number;
  accPoints: number;
  barPoints: number;
  rewards: RewardSlot[];
};

type GroupRow = {
  group: number;
  limit: number | null;
};

type PricePoint = {
  price: number;
  totalValue: number;
};

export type PromotionModel = {
  spreadsheetId: string;
  spreadsheetTitle: string;
  snapshotHash: string;
  mainRows: MainRow[];
  bundleRows: BundleRow[];
  barRows: BarRow[];
  paymentTypes: Set<string>;
  rewardValues: Map<string, { name: string; spinsValue: number }>;
  pricePoints: PricePoint[];
  weightedMode: boolean;
  usesGroups: boolean;
  groupLimits: Map<number, number>;
  groupOrder: number[];
  bundleByPurchaseIndex: Map<number, BundleRow>;
  anchorOfferByOfferId: Map<number, number>;
};

export type DistributionEntry = {
  reward: string;
  averageAmount: number;
};

export type OfferResultRow = {
  offerId: number;
  paymentType: string;
  rollsIntoOfferId: number | null;
  approximateDollarCost: number;
  baselineSpinsCost: number;
  mainValue: number;
  bundleValue: number;
  barValue: number;
  directEnergyMainValue: number;
  directEnergyBundleValue: number;
  directEnergyBarValue: number;
  attributedVfmWithoutBar: number;
  attributedVfmWithBar: number;
  incrementalSlopeWithoutBar: number | null;
  incrementalSlopeWithBar: number | null;
  cumulativeSlopeWithoutBar: number | null;
  cumulativeSlopeWithBar: number | null;
  averageBarMilestonesCompleted: number;
  rewardDistribution: {
    main: DistributionEntry[];
    bundle: DistributionEntry[];
    bar: DistributionEntry[];
  };
};

export type SimulationResult = {
  runCount: number;
  weightedMode: boolean;
  durationMs: number;
  snapshotHash: string;
  rows: OfferResultRow[];
  rewardIndexDistribution: {
    columns: { key: string; label: string }[];
    rows: { offerId: number; values: Record<string, number> }[];
  };
  summary: {
    promotionTitle: string;
    totalBaselineSpinsCost: number;
    totalApproximateDollarCost: number;
    totalVfmWithoutBar: number;
    totalVfmWithBar: number;
    totalDirectEnergySpinsWithoutBar: number;
    totalDirectEnergySpinsWithBar: number;
    totalMainValue: number;
    totalBundleValue: number;
    totalBarValue: number;
    cumulativeSlopeWithoutBar: number | null;
    cumulativeSlopeWithBar: number | null;
  };
};

type StepResult = {
  offerId: number;
  rewardIndex: string;
  paymentType: string;
  baselineSpinsCost: number;
  approximateDollarCost: number;
  mainValue: number;
  bundleValue: number;
  barValue: number;
  directEnergyMainValue: number;
  directEnergyBundleValue: number;
  directEnergyBarValue: number;
  milestonesCompleted: number;
  rewards: {
    main: RewardSlot[];
    bundle: RewardSlot[];
    bar: RewardSlot[];
  };
};

type Aggregate = {
  offerId: number;
  paymentType: string;
  baselineSpinsCost: number;
  approximateDollarCost: number;
  mainValue: number;
  bundleValue: number;
  barValue: number;
  directEnergyMainValue: number;
  directEnergyBundleValue: number;
  directEnergyBarValue: number;
  milestonesCompleted: number;
  mainDistribution: Map<string, number>;
  bundleDistribution: Map<string, number>;
  barDistribution: Map<string, number>;
  rewardIndexSelection: Map<string, number>;
};

const REQUIRED_TABS: TabDefinition[] = [
  {
    key: "mainConfig",
    label: "Main Config",
    headers: [
      { key: "offerId", labels: ["Offer ID"] },
      { key: "group", labels: ["Group"] },
      { key: "closeGroup", labels: ["Close Group"] },
      { key: "paymentType", labels: ["Payment Type"] },
      { key: "dollarCost", labels: ["Dollar Cost"] },
      { key: "resourceCost", labels: ["Resource Cost"] },
      { key: "barPoints", labels: ["Bar Points"] },
      { key: "limit", labels: ["Limit"] },
      { key: "weight", labels: ["Weight"] },
      { key: "rewardIndex", labels: ["Reward Index"] },
      { key: "reward1", labels: ["Reward 1"] },
      { key: "reward1Amount", labels: ["Reward 1 Amount"] },
    ],
  },
  {
    key: "groupsConfig",
    label: "Groups Config",
    headers: [
      { key: "group", labels: ["Group"] },
      { key: "limit", labels: ["Limit"] },
    ],
  },
  {
    key: "extraBundleConfig",
    label: "Extra Bundle Config",
    headers: [
      { key: "bundleId", labels: ["Bundle ID"] },
      { key: "barPoints", labels: ["Bar Points"] },
      { key: "limit", labels: ["Limit"] },
      { key: "reward1", labels: ["Reward 1"] },
      { key: "reward1Amount", labels: ["Reward 1 Amount"] },
    ],
  },
  {
    key: "barConfig",
    label: "Bar Config",
    headers: [
      { key: "barId", labels: ["Bar ID"] },
      { key: "barPoints", labels: ["Bar Points", "Points"] },
      { key: "accPoints", labels: ["Acc Points"] },
      { key: "reward1", labels: ["Reward 1"] },
      { key: "reward1Amount", labels: ["Reward 1 Amount"] },
    ],
  },
  {
    key: "paymentTypes",
    label: "Payment Types",
    headers: [{ key: "paymentType", labels: ["Payment Type", "Type"] }],
  },
  {
    key: "priceList",
    label: "Price List",
    headers: [
      { key: "price", labels: ["Price"] },
      { key: "totalValue", labels: ["Total Value", "Total value"] },
    ],
  },
  {
    key: "resourceAndValuation",
    label: "Resource and Valuation",
    headers: [
      { key: "reward", labels: ["Reward", "reward"] },
      { key: "spinsValue", labels: ["Spins Value", "spins value"] },
    ],
  },
];

export function normalizeName(input: string) {
  return input.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

export function validatePromotionSheet(snapshot: SpreadsheetSnapshot): ValidationResult {
  const issues: ValidationIssue[] = [];
  const tabLookup = new Map<string, { actualTitle: string; rows: string[][] }>();

  for (const [title, rows] of Object.entries(snapshot.tabs)) {
    tabLookup.set(normalizeName(title), { actualTitle: title, rows });
  }

  const resolvedTabs: Record<string, ResolvedTab | undefined> = {};

  for (const tab of REQUIRED_TABS) {
    const resolved = tabLookup.get(normalizeName(tab.label));
    if (!resolved) {
      issues.push({
        severity: "error",
        category: "tab",
        tab: tab.label,
        message: `Missing required tab: ${tab.label}.`,
      });
      continue;
    }

    const headerIndex = indexHeaders(resolved.rows[0] ?? []);
    const result: ResolvedTab = {
      key: tab.key,
      label: tab.label,
      actualTitle: resolved.actualTitle,
      rows: resolved.rows,
      rawHeaderIndex: headerIndex,
      headerIndex: {},
    };

    for (const header of tab.headers) {
      const found = resolveHeader(headerIndex, header.labels);
      if (found === undefined) {
        issues.push({
          severity: "error",
          category: "header",
          tab: tab.label,
          field: header.labels[0],
          message: `Missing required header "${header.labels[0]}" in ${tab.label}.`,
        });
      } else {
        result.headerIndex[header.key] = found;
      }
    }

    resolvedTabs[tab.key] = result;
  }

  return {
    issues,
    blockingIssues: issues.filter((issue) => issue.severity === "error"),
    resolvedTabs,
  };
}

export function buildPromotionModel(
  snapshot: SpreadsheetSnapshot,
  validation: ValidationResult,
) {
  const issues = [...validation.issues];

  if (validation.blockingIssues.length > 0) {
    return {
      model: null,
      validation: {
        ...validation,
        issues,
        blockingIssues: issues.filter((issue) => issue.severity === "error"),
      },
    };
  }

  const mainTab = mustTab(validation, "mainConfig");
  const groupsTab = mustTab(validation, "groupsConfig");
  const bundleTab = mustTab(validation, "extraBundleConfig");
  const barTab = mustTab(validation, "barConfig");
  const paymentTypesTab = mustTab(validation, "paymentTypes");
  const priceListTab = mustTab(validation, "priceList");
  const valuationTab = mustTab(validation, "resourceAndValuation");

  const paymentTypes = parsePaymentTypes(paymentTypesTab);
  const rewardValues = parseRewardValues(valuationTab, issues);
  const pricePoints = parsePricePoints(priceListTab, issues);
  const groupRows = parseGroupRows(groupsTab);
  const configuredGroups = new Set(groupRows.map((row) => row.group));

  const mainRows = parseMainRows(mainTab, issues);
  const offersPerGroup = new Map<number, number>();
  for (const row of mainRows) {
    if (row.group === null) {
      continue;
    }
    offersPerGroup.set(row.group, (offersPerGroup.get(row.group) ?? 0) + 1);
  }
  const groupLimits = new Map<number, number>();
  for (const groupRow of groupRows) {
    const fallbackLimit = offersPerGroup.get(groupRow.group) ?? 0;
    groupLimits.set(groupRow.group, groupRow.limit ?? fallbackLimit);
  }
  const bundleRows = parseBundleRows(bundleTab);
  const barRows = parseBarRows(barTab, issues);

  const usesGroups = mainRows.some((row) => row.group !== null);
  const weightedMode = mainRows.some((row) => row.weight !== null);

  if (usesGroups && mainRows.some((row) => row.group === null)) {
    issues.push(configError("Main Config", undefined, "Main Config cannot mix grouped and ungrouped rows."));
  }

  for (const row of mainRows) {
    if (!paymentTypes.has(row.paymentTypeKey)) {
      issues.push(configError("Main Config", `Offer ${row.offerId}`, `Payment type "${row.paymentType}" is not listed in Payment Types.`));
    }
    if (row.group !== null && !configuredGroups.has(row.group)) {
      issues.push(configError("Groups Config", `Group ${row.group}`, `Group ${row.group} is used in Main Config but missing from Groups Config.`));
    }
    if (row.rewards.length === 0) {
      issues.push(configError("Main Config", `Offer ${row.offerId}`, "Every Main Config row needs at least one reward."));
    }
    for (const reward of row.rewards) {
      if (!rewardValues.has(normalizeName(reward.reward))) {
        issues.push(configError("Resource and Valuation", reward.reward, `Reward "${reward.reward}" used in Offer ${row.offerId} is missing from Resource and Valuation.`));
      }
    }
  }

  for (const row of bundleRows) {
    for (const reward of row.rewards) {
      if (!rewardValues.has(normalizeName(reward.reward))) {
        issues.push(configError("Resource and Valuation", reward.reward, `Reward "${reward.reward}" used in Bundle ${row.bundleId} is missing from Resource and Valuation.`));
      }
    }
  }

  for (const row of barRows) {
    for (const reward of row.rewards) {
      if (!rewardValues.has(normalizeName(reward.reward))) {
        issues.push(configError("Resource and Valuation", reward.reward, `Reward "${reward.reward}" used in Bar milestone ${row.barId} is missing from Resource and Valuation.`));
      }
    }
  }

  if (weightedMode) {
    const pools = usesGroups ? groupBy(mainRows, (row) => String(row.group)) : new Map([["promotion", mainRows]]);
    for (const [poolKey, rows] of pools.entries()) {
      if (rows.some((row) => row.weight === null)) {
        issues.push({
          severity: "warning",
          category: "config",
          tab: "Main Config",
          field: poolKey,
          message: "Missing weights are treated as 0 during simulation and should still be corrected.",
        });
      }
      if (!rows.some((row) => (row.weight ?? 0) > 0)) {
        issues.push(configError("Main Config", poolKey, "Weighted mode requires at least one positive weight in each active pool."));
      }
    }
  }

  const finalValidation: ValidationResult = {
    ...validation,
    issues,
    blockingIssues: issues.filter((issue) => issue.severity === "error"),
  };

  if (finalValidation.blockingIssues.length > 0) {
    return { model: null, validation: finalValidation };
  }

  const model: PromotionModel = {
    spreadsheetId: snapshot.spreadsheetId,
    spreadsheetTitle: snapshot.spreadsheetTitle,
    snapshotHash: hashTabs(snapshot.tabs),
    mainRows,
    bundleRows,
    barRows,
    paymentTypes,
    rewardValues,
    pricePoints,
    weightedMode,
    usesGroups,
    groupLimits,
    groupOrder: [...new Set(groupRows.map((row) => row.group))].sort((a, b) => a - b),
    bundleByPurchaseIndex: buildBundleIndex(bundleRows),
    anchorOfferByOfferId: buildAnchorIndex(mainRows),
  };

  return { model, validation: finalValidation };
}

export function runSimulation(model: PromotionModel): SimulationResult {
  const start = performance.now();
  const runCount = model.weightedMode ? 1000 : 1;
  const aggregates = model.mainRows.map<Aggregate>((row) => ({
    offerId: row.offerId,
    paymentType: row.paymentType,
    baselineSpinsCost: 0,
    approximateDollarCost: 0,
    mainValue: 0,
    bundleValue: 0,
    barValue: 0,
    directEnergyMainValue: 0,
    directEnergyBundleValue: 0,
    directEnergyBarValue: 0,
    milestonesCompleted: 0,
    mainDistribution: new Map(),
    bundleDistribution: new Map(),
    barDistribution: new Map(),
    rewardIndexSelection: new Map(),
  }));

  const rng = model.weightedMode ? mulberry32(seedFromHash(model.snapshotHash)) : null;

  for (let run = 0; run < runCount; run += 1) {
    accumulateJourney(aggregates, simulateJourney(model, rng));
  }

  const rows = finalizeRows(model, aggregates, runCount);
  const totalBaselineSpinsCost = rows.reduce((sum, row) => sum + row.baselineSpinsCost, 0);
  const totalApproximateDollarCost = rows.reduce((sum, row) => sum + row.approximateDollarCost, 0);
  const totalVfmWithoutBar = rows.reduce((sum, row) => sum + row.attributedVfmWithoutBar, 0);
  const totalVfmWithBar = rows.reduce((sum, row) => sum + row.attributedVfmWithBar, 0);
  const totalCostBaselinePoint =
    totalApproximateDollarCost > 0
      ? nearestPricePoint(model.pricePoints, totalApproximateDollarCost, "price")?.totalValue ?? 0
      : 0;
  const totalDirectEnergySpinsWithoutBar = rows.reduce(
    (sum, row) => sum + row.directEnergyMainValue + row.directEnergyBundleValue,
    0,
  );
  const totalDirectEnergySpinsWithBar = rows.reduce(
    (sum, row) => sum + row.directEnergyMainValue + row.directEnergyBundleValue + row.directEnergyBarValue,
    0,
  );
  const totalMainValue = rows.reduce((sum, row) => sum + row.mainValue, 0);
  const totalBundleValue = rows.reduce((sum, row) => sum + row.bundleValue, 0);
  const totalBarValue = rows.reduce((sum, row) => sum + row.barValue, 0);
  const rewardIndexDistribution = buildRewardIndexDistribution(model, aggregates, runCount);

  return {
    runCount,
    weightedMode: model.weightedMode,
    durationMs: performance.now() - start,
    snapshotHash: model.snapshotHash,
    rows,
    rewardIndexDistribution,
    summary: {
      promotionTitle: model.spreadsheetTitle,
      totalBaselineSpinsCost,
      totalApproximateDollarCost,
      totalVfmWithoutBar,
      totalVfmWithBar,
      totalDirectEnergySpinsWithoutBar,
      totalDirectEnergySpinsWithBar,
      totalMainValue,
      totalBundleValue,
      totalBarValue,
      cumulativeSlopeWithoutBar:
        totalCostBaselinePoint > 0 ? totalVfmWithoutBar / totalCostBaselinePoint : null,
      cumulativeSlopeWithBar:
        totalCostBaselinePoint > 0 ? totalVfmWithBar / totalCostBaselinePoint : null,
    },
  };
}

function simulateJourney(model: PromotionModel, rng: (() => number) | null) {
  const rowWins = new Map<number, number>();
  const groupWins = new Map<number, number>();
  const closedGroups = new Set<number>();
  const awardedBars = new Set<number>();
  const steps: StepResult[] = [];
  let cumulativeBarPoints = 0;

  for (let purchaseIndex = 0; purchaseIndex < model.mainRows.length; purchaseIndex += 1) {
    const purchaseRow = model.mainRows[purchaseIndex];
    const selected = selectMainReward(model, rowWins, groupWins, closedGroups, rng);
    if (!selected) {
      break;
    }

    rowWins.set(selected.offerId, (rowWins.get(selected.offerId) ?? 0) + 1);
    if (selected.group !== null) {
      const nextGroupWins = (groupWins.get(selected.group) ?? 0) + 1;
      groupWins.set(selected.group, nextGroupWins);
      const groupLimit = model.groupLimits.get(selected.group);
      if (selected.closeGroup || (groupLimit !== undefined && nextGroupWins >= groupLimit)) {
        closedGroups.add(selected.group);
      }
    }

    const bundle = model.bundleByPurchaseIndex.get(purchaseIndex + 1) ?? null;
    cumulativeBarPoints += purchaseRow.barPoints + (bundle?.barPoints ?? 0);

    const newBarRewards: RewardSlot[] = [];
    for (const barRow of model.barRows) {
      if (awardedBars.has(barRow.barId)) {
        continue;
      }
      if (cumulativeBarPoints >= barRow.accPoints) {
        awardedBars.add(barRow.barId);
        newBarRewards.push(...barRow.rewards);
      }
    }

    const cost = resolveCost(purchaseRow, model);
    const selectedMainRewards = selected.rewards;
    const bundleRewards = bundle?.rewards ?? [];
    steps.push({
      offerId: purchaseRow.offerId,
      rewardIndex: selected.rewardIndex,
      paymentType: purchaseRow.paymentType,
      baselineSpinsCost: cost.baselineSpinsCost,
      approximateDollarCost: cost.approximateDollarCost,
      mainValue: rewardValue(selectedMainRewards, model.rewardValues),
      bundleValue: rewardValue(bundleRewards, model.rewardValues),
      barValue: rewardValue(newBarRewards, model.rewardValues),
      directEnergyMainValue: rewardDirectEnergyValue(selectedMainRewards, model.rewardValues),
      directEnergyBundleValue: rewardDirectEnergyValue(bundleRewards, model.rewardValues),
      directEnergyBarValue: rewardDirectEnergyValue(newBarRewards, model.rewardValues),
      milestonesCompleted: awardedBars.size,
      rewards: {
        main: selectedMainRewards,
        bundle: bundleRewards,
        bar: newBarRewards,
      },
    });
  }

  return steps;
}

function selectMainReward(
  model: PromotionModel,
  rowWins: Map<number, number>,
  groupWins: Map<number, number>,
  closedGroups: Set<number>,
  rng: (() => number) | null,
) {
  const pool = model.usesGroups
    ? model.mainRows.filter((row) => row.group === currentGroup(model, rowWins, groupWins, closedGroups) && !rowExhausted(row, rowWins))
    : model.mainRows.filter((row) => !rowExhausted(row, rowWins));

  if (pool.length === 0) {
    return null;
  }

  if (!model.weightedMode) {
    return pool[0];
  }

  const totalWeight = pool.reduce((sum, row) => sum + Math.max(0, row.weight ?? 0), 0);
  if (totalWeight <= 0) {
    return pool[0];
  }

  let cursor = (rng ?? Math.random)() * totalWeight;
  for (const row of pool) {
    cursor -= Math.max(0, row.weight ?? 0);
    if (cursor <= 0) {
      return row;
    }
  }

  return pool[pool.length - 1];
}

function currentGroup(
  model: PromotionModel,
  rowWins: Map<number, number>,
  groupWins: Map<number, number>,
  closedGroups: Set<number>,
) {
  for (const group of model.groupOrder) {
    if (closedGroups.has(group)) {
      continue;
    }
    const groupLimit = model.groupLimits.get(group);
    if (groupLimit !== undefined && (groupWins.get(group) ?? 0) >= groupLimit) {
      continue;
    }
    const hasRows = model.mainRows.some((row) => row.group === group && !rowExhausted(row, rowWins));
    if (hasRows) {
      return group;
    }
  }
  return null;
}

function rowExhausted(row: MainRow, rowWins: Map<number, number>) {
  return row.limit !== null && (rowWins.get(row.offerId) ?? 0) >= row.limit;
}

function resolveCost(row: MainRow, model: PromotionModel) {
  const type = inferCostType(row);
  if (type === "dollar") {
    const exact = model.pricePoints.find((point) => point.price.toFixed(2) === (row.dollarCost ?? 0).toFixed(2));
    return {
      baselineSpinsCost: exact?.totalValue ?? nearestPricePoint(model.pricePoints, row.dollarCost ?? 0, "price")?.totalValue ?? 0,
      approximateDollarCost: row.dollarCost ?? 0,
    };
  }

  if (type === "resource") {
    const resourceValue = model.rewardValues.get(row.paymentTypeKey)?.spinsValue ?? 0;
    const baseline = resourceValue * (row.resourceCost ?? 0);
    const nearest = nearestPricePoint(model.pricePoints, baseline, "value");
    return {
      baselineSpinsCost: nearest?.totalValue ?? baseline,
      approximateDollarCost: nearest?.price ?? 0,
    };
  }

  return {
    baselineSpinsCost: 0,
    approximateDollarCost: 0,
  };
}

function inferCostType(row: MainRow) {
  if (row.paymentTypeKey === "free" || row.paymentTypeKey === "rv") {
    return "free";
  }
  if (row.dollarCost !== null) {
    return "dollar";
  }
  if (row.resourceCost !== null) {
    return "resource";
  }
  return "free";
}

function finalizeRows(model: PromotionModel, aggregates: Aggregate[], runCount: number) {
  const averages = aggregates.map((aggregate) => ({
    offerId: aggregate.offerId,
    paymentType: aggregate.paymentType,
    baselineSpinsCost: aggregate.baselineSpinsCost / runCount,
    approximateDollarCost: aggregate.approximateDollarCost / runCount,
    mainValue: aggregate.mainValue / runCount,
    bundleValue: aggregate.bundleValue / runCount,
    barValue: aggregate.barValue / runCount,
    directEnergyMainValue: aggregate.directEnergyMainValue / runCount,
    directEnergyBundleValue: aggregate.directEnergyBundleValue / runCount,
    directEnergyBarValue: aggregate.directEnergyBarValue / runCount,
    milestonesCompleted: aggregate.milestonesCompleted / runCount,
    rewardDistribution: {
      main: distributionEntries(aggregate.mainDistribution, runCount),
      bundle: distributionEntries(aggregate.bundleDistribution, runCount),
      bar: distributionEntries(aggregate.barDistribution, runCount),
    },
  }));

  const attributedWithoutBar = new Array(averages.length).fill(0);
  const attributedWithBar = new Array(averages.length).fill(0);

  for (let index = 0; index < averages.length; index += 1) {
    const step = averages[index];
    const anchorId = model.anchorOfferByOfferId.get(step.offerId) ?? step.offerId;
    const anchorIndex = model.mainRows.findIndex((row) => row.offerId === anchorId);
    if (anchorIndex === -1) {
      continue;
    }
    attributedWithoutBar[anchorIndex] += step.mainValue + step.bundleValue;
    attributedWithBar[anchorIndex] += step.mainValue + step.bundleValue + step.barValue;
  }

  const rows: OfferResultRow[] = [];
  let cumulativeCost = 0;
  let cumulativeNoBar = 0;
  let cumulativeWithBar = 0;

  for (let index = 0; index < averages.length; index += 1) {
    const step = averages[index];
    cumulativeCost += step.approximateDollarCost;
    cumulativeNoBar += attributedWithoutBar[index];
    cumulativeWithBar += attributedWithBar[index];
    const cumulativeBaselinePoint =
      cumulativeCost > 0
        ? nearestPricePoint(model.pricePoints, cumulativeCost, "price")?.totalValue ?? 0
        : 0;
    const incrementalBaselinePoint =
      step.approximateDollarCost > 0
        ? nearestPricePoint(model.pricePoints, step.approximateDollarCost, "price")?.totalValue ?? 0
        : 0;

    const anchorId = model.anchorOfferByOfferId.get(step.offerId) ?? step.offerId;
    rows.push({
      offerId: step.offerId,
      paymentType: step.paymentType,
      rollsIntoOfferId: anchorId === step.offerId ? null : anchorId,
      approximateDollarCost: step.approximateDollarCost,
      baselineSpinsCost: step.baselineSpinsCost,
      mainValue: step.mainValue,
      bundleValue: step.bundleValue,
      barValue: step.barValue,
      directEnergyMainValue: step.directEnergyMainValue,
      directEnergyBundleValue: step.directEnergyBundleValue,
      directEnergyBarValue: step.directEnergyBarValue,
      attributedVfmWithoutBar: attributedWithoutBar[index],
      attributedVfmWithBar: attributedWithBar[index],
      incrementalSlopeWithoutBar:
        incrementalBaselinePoint > 0
          ? attributedWithoutBar[index] / incrementalBaselinePoint
          : null,
      incrementalSlopeWithBar:
        incrementalBaselinePoint > 0
          ? attributedWithBar[index] / incrementalBaselinePoint
          : null,
      cumulativeSlopeWithoutBar:
        cumulativeBaselinePoint > 0 ? cumulativeNoBar / cumulativeBaselinePoint : null,
      cumulativeSlopeWithBar:
        cumulativeBaselinePoint > 0 ? cumulativeWithBar / cumulativeBaselinePoint : null,
      averageBarMilestonesCompleted: step.milestonesCompleted,
      rewardDistribution: step.rewardDistribution,
    });
  }

  return rows;
}

function accumulateJourney(aggregates: Aggregate[], steps: StepResult[]) {
  for (let index = 0; index < aggregates.length; index += 1) {
    const step = steps[index];
    if (!step) {
      continue;
    }
    const aggregate = aggregates[index];
    aggregate.baselineSpinsCost += step.baselineSpinsCost;
    aggregate.approximateDollarCost += step.approximateDollarCost;
    aggregate.mainValue += step.mainValue;
    aggregate.bundleValue += step.bundleValue;
    aggregate.barValue += step.barValue;
    aggregate.directEnergyMainValue += step.directEnergyMainValue;
    aggregate.directEnergyBundleValue += step.directEnergyBundleValue;
    aggregate.directEnergyBarValue += step.directEnergyBarValue;
    aggregate.milestonesCompleted += step.milestonesCompleted;
    aggregate.rewardIndexSelection.set(
      step.rewardIndex,
      (aggregate.rewardIndexSelection.get(step.rewardIndex) ?? 0) + 1,
    );
    addRewards(aggregate.mainDistribution, step.rewards.main);
    addRewards(aggregate.bundleDistribution, step.rewards.bundle);
    addRewards(aggregate.barDistribution, step.rewards.bar);
  }
}

function addRewards(target: Map<string, number>, rewards: RewardSlot[]) {
  for (const reward of rewards) {
    target.set(reward.reward, (target.get(reward.reward) ?? 0) + reward.amount);
  }
}

function distributionEntries(map: Map<string, number>, runCount: number) {
  return [...map.entries()]
    .map(([reward, total]) => ({ reward, averageAmount: total / runCount }))
    .sort((left, right) => right.averageAmount - left.averageAmount || left.reward.localeCompare(right.reward));
}

function buildRewardIndexDistribution(
  model: PromotionModel,
  aggregates: Aggregate[],
  runCount: number,
) {
  const seen = new Set<string>();
  const columns: { key: string; label: string }[] = [];
  for (const row of model.mainRows) {
    if (seen.has(row.rewardIndex)) {
      continue;
    }
    seen.add(row.rewardIndex);
    columns.push({
      key: row.rewardIndex,
      label: row.rewardIndexLabel,
    });
  }

  const rows = aggregates.map((aggregate) => {
    const values: Record<string, number> = {};
    for (const column of columns) {
      const picks = aggregate.rewardIndexSelection.get(column.key) ?? 0;
      values[column.key] = picks / runCount;
    }
    return {
      offerId: aggregate.offerId,
      values,
    };
  });

  return { columns, rows };
}

function parsePaymentTypes(tab: ResolvedTab) {
  const index = tab.headerIndex.paymentType;
  const values = new Set<string>();
  for (const row of tab.rows.slice(1)) {
    const value = clean(row[index]);
    if (value) {
      values.add(normalizeName(value));
    }
  }
  return values;
}

function parseRewardValues(tab: ResolvedTab, issues: ValidationIssue[]) {
  const rewardIndex = tab.headerIndex.reward;
  const spinsIndex = tab.headerIndex.spinsValue;
  const values = new Map<string, { name: string; spinsValue: number }>();

  for (const row of tab.rows.slice(1)) {
    const reward = clean(row[rewardIndex]);
    if (!reward) {
      continue;
    }
    const spinsValue = numberValue(row[spinsIndex]);
    if (spinsValue === null) {
      issues.push(configError(tab.label, reward, `Reward "${reward}" is missing a numeric spins value.`));
      continue;
    }
    values.set(normalizeName(reward), { name: reward, spinsValue });
  }

  return values;
}

function parsePricePoints(tab: ResolvedTab, issues: ValidationIssue[]) {
  const points: PricePoint[] = [];
  for (let index = 1; index < tab.rows.length; index += 1) {
    const row = tab.rows[index];
    const price = numberValue(row[tab.headerIndex.price]);
    const totalValue = numberValue(row[tab.headerIndex.totalValue]);
    if (price === null && totalValue === null) {
      continue;
    }
    if (price === null || totalValue === null) {
      issues.push(configError(tab.label, `row ${index + 1}`, "Each populated Price List row needs both Price and Total Value."));
      continue;
    }
    points.push({ price, totalValue });
  }
  return points.sort((left, right) => left.price - right.price);
}

function parseGroupRows(tab: ResolvedTab) {
  const rows: GroupRow[] = [];
  for (const row of tab.rows.slice(1)) {
    const group = numberValue(row[tab.headerIndex.group]);
    if (group === null) {
      continue;
    }
    rows.push({
      group,
      limit: numberValue(row[tab.headerIndex.limit]),
    });
  }
  return rows.sort((left, right) => left.group - right.group);
}

function parseMainRows(tab: ResolvedTab, issues: ValidationIssue[]) {
  const rows: MainRow[] = [];
  for (let index = 1; index < tab.rows.length; index += 1) {
    const row = tab.rows[index];
    const paymentType = clean(row[tab.headerIndex.paymentType]);
    if (!paymentType) {
      continue;
    }
    const offerId = numberValue(row[tab.headerIndex.offerId]);
    if (offerId === null) {
      issues.push(configError(tab.label, `row ${index + 1}`, "Each populated Main Config row needs an Offer ID."));
      continue;
    }
    const rewards = parseRewards(tab, row, 10);
    const rewardIndexRaw = clean(row[tab.headerIndex.rewardIndex]);
    const parsedWeight = numberValue(row[tab.headerIndex.weight]);
    const parsedLimit = numberValue(row[tab.headerIndex.limit]);
    const effectiveLimit =
      parsedLimit !== null ? parsedLimit : parsedWeight === null ? 1 : null;
    rows.push({
      offerId,
      rewardIndex: rewardIndexRaw || `offer_${offerId}`,
      rewardIndexLabel: buildRewardIndexLabel(
        rewardIndexRaw || `Offer ${offerId}`,
        rewards,
      ),
      paymentType,
      paymentTypeKey: normalizeName(paymentType),
      group: numberValue(row[tab.headerIndex.group]),
      closeGroup: booleanValue(row[tab.headerIndex.closeGroup]),
      dollarCost: numberValue(row[tab.headerIndex.dollarCost]),
      resourceCost: numberValue(row[tab.headerIndex.resourceCost]),
      barPoints: numberValue(row[tab.headerIndex.barPoints]) ?? 0,
      limit: effectiveLimit,
      weight: parsedWeight,
      rewards,
    });
  }
  return rows.sort((left, right) => left.offerId - right.offerId);
}

function parseBundleRows(tab: ResolvedTab) {
  const rows: BundleRow[] = [];
  for (const row of tab.rows.slice(1)) {
    const bundleId = numberValue(row[tab.headerIndex.bundleId]);
    const rewards = parseRewards(tab, row, 10);
    const barPoints = numberValue(row[tab.headerIndex.barPoints]) ?? 0;
    const limit = numberValue(row[tab.headerIndex.limit]);
    if (bundleId === null && rewards.length === 0 && barPoints === 0 && limit === null) {
      continue;
    }
    if (bundleId === null) {
      continue;
    }
    rows.push({
      bundleId,
      limit,
      barPoints,
      rewards,
    });
  }
  return rows.sort((left, right) => left.bundleId - right.bundleId);
}

function parseBarRows(tab: ResolvedTab, issues: ValidationIssue[]) {
  const rows: BarRow[] = [];
  for (let index = 1; index < tab.rows.length; index += 1) {
    const row = tab.rows[index];
    const barId = numberValue(row[tab.headerIndex.barId]);
    const accPoints = numberValue(row[tab.headerIndex.accPoints]);
    const barPoints = numberValue(row[tab.headerIndex.barPoints]);
    const rewards = parseRewards(tab, row, 10);
    if (barId === null && accPoints === null && barPoints === null && rewards.length === 0) {
      continue;
    }
    if (barId === null || accPoints === null || barPoints === null) {
      issues.push(configError(tab.label, `row ${index + 1}`, "Each populated Bar Config row needs Bar ID, Bar Points, and Acc Points."));
      continue;
    }
    rows.push({
      barId,
      accPoints,
      barPoints,
      rewards,
    });
  }
  return rows.sort((left, right) => left.accPoints - right.accPoints);
}

function parseRewards(tab: ResolvedTab, row: string[], slots: number) {
  const rewards: RewardSlot[] = [];
  for (let slot = 1; slot <= slots; slot += 1) {
    const rewardIndex = resolveHeader(tab.rawHeaderIndex, [`Reward ${slot}`]);
    if (rewardIndex === undefined) {
      continue;
    }
    const reward = clean(row[rewardIndex]);
    if (!reward) {
      continue;
    }
    const amountIndex = resolveHeader(tab.rawHeaderIndex, [`Reward ${slot} Amount`]);
    rewards.push({
      reward,
      amount: numberValue(amountIndex === undefined ? "" : row[amountIndex]) ?? 1,
    });
  }
  return rewards;
}

function buildRewardIndexLabel(baseLabel: string, rewards: RewardSlot[]) {
  if (rewards.length === 0) {
    return baseLabel;
  }
  const rewardPart = rewards.map((item) => `${item.reward} x ${item.amount}`).join(" + ");
  return `${baseLabel} (${rewardPart})`;
}

function buildBundleIndex(bundleRows: BundleRow[]) {
  const map = new Map<number, BundleRow>();
  let purchaseIndex = 1;
  for (const bundle of bundleRows) {
    const repeats = bundle.limit ?? 1;
    for (let count = 0; count < repeats; count += 1) {
      map.set(purchaseIndex, bundle);
      purchaseIndex += 1;
    }
  }
  return map;
}

function buildAnchorIndex(mainRows: MainRow[]) {
  const anchors = new Map<number, number>();
  let currentAnchor: number | null = null;
  for (const row of mainRows) {
    if (row.paymentTypeKey !== "free") {
      currentAnchor = row.offerId;
    }
    anchors.set(row.offerId, currentAnchor ?? row.offerId);
  }
  return anchors;
}

function rewardValue(
  rewards: RewardSlot[],
  values: Map<string, { name: string; spinsValue: number }>,
) {
  return rewards.reduce((sum, reward) => {
    const spinsValue = values.get(normalizeName(reward.reward))?.spinsValue ?? 0;
    return sum + spinsValue * reward.amount;
  }, 0);
}

function rewardDirectEnergyValue(
  rewards: RewardSlot[],
  values: Map<string, { name: string; spinsValue: number }>,
) {
  return rewards.reduce((sum, reward) => {
    const normalized = normalizeName(reward.reward);
    if (!isDirectEnergyReward(normalized)) {
      return sum;
    }
    const spinsValue = values.get(normalized)?.spinsValue ?? 0;
    return sum + spinsValue * reward.amount;
  }, 0);
}

function isDirectEnergyReward(normalizedRewardName: string) {
  return normalizedRewardName.includes("energy");
}

function nearestPricePoint(points: PricePoint[], target: number, by: "price" | "value") {
  let best: PricePoint | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const point of points) {
    const value = by === "price" ? point.price : point.totalValue;
    const distance = Math.abs(value - target);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
}

function mustTab(validation: ValidationResult, key: string) {
  const tab = validation.resolvedTabs[key];
  if (!tab) {
    throw new Error(`Missing resolved tab ${key}`);
  }
  return tab;
}

function hashTabs(tabs: Record<string, string[][]>) {
  return crypto.createHash("sha256").update(JSON.stringify(tabs)).digest("hex");
}

function indexHeaders(headers: string[]) {
  const index: Record<string, number> = {};
  headers.forEach((header, column) => {
    const normalized = normalizeName(header);
    if (normalized && index[normalized] === undefined) {
      index[normalized] = column;
    }
  });
  return index;
}

function resolveHeader(index: Record<string, number>, labels: string[]) {
  for (const label of labels) {
    const found = index[normalizeName(label)];
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function clean(value: string | undefined) {
  return (value ?? "").trim();
}

function numberValue(value: string | undefined) {
  const trimmed = clean(value);
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value: string | undefined) {
  return normalizeName(value ?? "") === "true";
}

function configError(tab: string, field: string | undefined, message: string): ValidationIssue {
  return {
    severity: "error",
    category: "config",
    tab,
    field,
    message,
  };
}

function groupBy<T>(items: T[], keyFn: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  return map;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromHash(hash: string) {
  return Number.parseInt(hash.slice(0, 8), 16) || 1;
}
