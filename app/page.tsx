import { cookies } from "next/headers";
import { connectSheetAction, refreshSheetAction, toggleThemeAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";
import { hasGoogleOAuthConfig, isDevPreviewEnabled } from "@/lib/env";
import { listRecentSheets, saveRecentSheet } from "@/lib/db";
import { buildPromotionModel, runSimulation, validatePromotionSheet, type DistributionEntry } from "@/lib/promotion";
import { buildSpreadsheetUrl, extractSpreadsheetId, loadSpreadsheetSnapshot } from "@/lib/google";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const currentTheme = cookieStore.get("theme")?.value === "dark" ? "dark" : "light";
  const errorParam = readParam(params.error);
  const sheetParam = readParam(params.sheet);
  const currentUser = await getCurrentUser();
  const devPreview = isDevPreviewEnabled();
  const oauthReady = hasGoogleOAuthConfig();
  const recentSheets = currentUser ? listRecentSheets(currentUser.id) : [];

  let pageError = errorParam;
  let sheetInputValue = "";
  let simulation:
    | {
        validation: ReturnType<typeof validatePromotionSheet>;
        result: ReturnType<typeof runSimulation> | null;
        snapshotTitle: string;
        snapshotUrl: string;
      }
    | null = null;

  if (currentUser && sheetParam) {
    try {
      const spreadsheetId = extractSpreadsheetId(sheetParam);
      sheetInputValue = buildSpreadsheetUrl(spreadsheetId);
      const snapshot = await loadSpreadsheetSnapshot(currentUser, spreadsheetId);
      const validation = validatePromotionSheet(snapshot);
      const built = buildPromotionModel(snapshot, validation);

      saveRecentSheet({
        userId: currentUser.id,
        spreadsheetId,
        spreadsheetUrl: buildSpreadsheetUrl(spreadsheetId),
        spreadsheetTitle: snapshot.spreadsheetTitle,
        lastSnapshotHash: built.model?.snapshotHash ?? null,
      });

      simulation = {
        validation: built.validation,
        result: built.model ? runSimulation(built.model) : null,
        snapshotTitle: snapshot.spreadsheetTitle,
        snapshotUrl: snapshot.spreadsheetUrl,
      };
    } catch (error) {
      pageError = error instanceof Error ? error.message : "Failed to load the sheet.";
      sheetInputValue = sheetParam;
    }
  }

  if (!currentUser && devPreview && !simulation) {
    simulation = buildDevPreviewSimulation();
  }

  const rowsWithCumulativeCost = simulation?.result
    ? simulation.result.rows.map((row, index, allRows) => {
        const cumulativeCost = allRows
          .slice(0, index + 1)
          .reduce((sum, entry) => sum + entry.approximateDollarCost, 0);
        return { ...row, cumulativeCost };
      })
    : [];

  return (
    <main className="shell">
      <header className="appHeader">
        <img className="appLogo" src="/whalo-logo.gif" alt="Whalo logo" />
        <h1 className="appTitle">Promotion Tool Simulator</h1>
        <div className="headerActions">
          <form action={toggleThemeAction}>
            <input type="hidden" name="currentTheme" value={currentTheme} />
            <input type="hidden" name="returnTo" value={sheetParam ? `/?sheet=${encodeURIComponent(sheetParam)}` : "/"} />
            <button className="ghostButton" type="submit">
              {currentTheme === "dark" ? "Light mode" : "Dark mode"}
            </button>
          </form>
        </div>
      </header>

      <div className="stack">
        <section className="panel">
          <h2 className="panelTitle">Google access</h2>
          {oauthReady ? (
            currentUser ? (
              <>
                <p className="panelCopy">
                  Signed in as <strong>{currentUser.email}</strong>. Your recent sheets
                  stay private to your own session.
                </p>
                <div className="actions">
                  <span className="pill">Authenticated</span>
                  <a className="ghostButton" href="/api/auth/logout">
                    Sign out
                  </a>
                </div>
              </>
            ) : (
              <>
                <p className="panelCopy">
                  Sign in with Google so the app can read only the sheets you already
                  have access to.
                </p>
                <div className="actions">
                  {devPreview ? (
                    <span className="pill">Dev preview mode (OAuth bypass)</span>
                  ) : (
                    <a className="button" href="/api/auth/login">
                      Sign in with Google
                    </a>
                  )}
                </div>
              </>
            )
          ) : (
            <div className="callout calloutWarning">
              Add <span className="mono">GOOGLE_CLIENT_ID</span>,{" "}
              <span className="mono">GOOGLE_CLIENT_SECRET</span>, and{" "}
              <span className="mono">APP_URL</span> to start Google sign-in.
            </div>
          )}
        </section>

        <section className="panel">
          <h2 className="panelTitle">Required sheet structure</h2>
          <p className="panelCopy">
            Tab and header matching is case-insensitive and space-tolerant. Names are
            normalized before validation so designers do not get blocked by casing or
            whitespace noise.
          </p>
          <details className="requirementsDetails">
            <summary className="requirementsSummary">Required tabs and headers</summary>
            <div className="requirementsGrid">
              <div className="requirementItem">
                <strong>Main Config</strong>
                <span className="muted">Offer ID, Group, Close Group, Payment Type, Dollar Cost, Resource Cost, Bar Points, Limit, Weight, Reward 1, Reward 1 Amount</span>
              </div>
              <div className="requirementItem">
                <strong>Groups Config</strong>
                <span className="muted">Group, Limit</span>
              </div>
              <div className="requirementItem">
                <strong>Extra Bundle Config</strong>
                <span className="muted">Bundle ID, Bar Points, Limit, Reward 1, Reward 1 Amount</span>
              </div>
              <div className="requirementItem">
                <strong>Bar Config</strong>
                <span className="muted">Bar ID, Bar Points, Acc Points, Reward 1, Reward 1 Amount</span>
              </div>
              <div className="requirementItem">
                <strong>Payment Types</strong>
                <span className="muted">Payment Type</span>
              </div>
              <div className="requirementItem">
                <strong>Price List</strong>
                <span className="muted">Price, Total Value</span>
              </div>
              <div className="requirementItem">
                <strong>Resource and Valuation</strong>
                <span className="muted">Reward, Spins Value</span>
              </div>
            </div>
          </details>
        </section>

        {pageError ? <div className="callout calloutError">{pageError}</div> : null}

        <section className="panel">
          <h2 className="panelTitle">Connect or refresh a promotion sheet</h2>
          <p className="panelCopy">
            Paste a Google Sheets URL. The app reads the live sheet only when you choose
            to refresh, so designers can keep editing without auto-recalculation noise.
          </p>

          <form action={connectSheetAction} className="formRow">
            <input
              className="input"
              type="url"
              name="sheetUrl"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              defaultValue={sheetInputValue}
              disabled={!currentUser}
            />
            <div className="actions">
              <button className="button" type="submit" disabled={!currentUser}>
                Connect sheet
              </button>
            </div>
          </form>
          {simulation ? (
            <form action={refreshSheetAction} className="refreshForm">
              <input type="hidden" name="sheetUrl" value={simulation.snapshotUrl} />
              <div className="actions">
                <button className="secondaryButton" type="submit">
                  Refresh simulation
                </button>
              </div>
            </form>
          ) : null}
        </section>

        {recentSheets.length > 0 ? (
          <section className="panel">
            <h2 className="panelTitle">Recent sheets</h2>
            <div className="recentList">
              {recentSheets.map((sheet) => (
                <div className="recentItem" key={`${sheet.userId}-${sheet.spreadsheetId}`}>
                  <div className="recentMeta">
                    <p className="recentTitle">
                      {sheet.spreadsheetTitle ?? `Sheet ${sheet.spreadsheetId}`}
                    </p>
                    <div className="recentSubtle">{sheet.spreadsheetUrl}</div>
                  </div>
                  <form action={refreshSheetAction}>
                    <input type="hidden" name="sheetUrl" value={sheet.spreadsheetUrl} />
                    <button className="secondaryButton" type="submit">
                      Open
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {simulation ? (
          <>
            <section className="panel">
              <h2 className="panelTitle">Validation</h2>
              <p className="panelCopy">
                {simulation.result
                  ? "The sheet passed the blocking checks. Warnings still appear here so designers can clean up the config without losing results."
                  : "Simulation is blocked until the missing tabs, headers, or fatal config issues are fixed."}
              </p>
              <ValidationIssues issues={simulation.validation.issues} />
            </section>

            {simulation.result ? (
              <>
                <section className="panel">
                  <h2 className="panelTitle">Promotion summary</h2>
                  <p className="panelCopy">
                    Results for <strong>{simulation.snapshotTitle}</strong>. Weighted mode
                    uses {simulation.result.runCount.toLocaleString()} journeys, while
                    sequential mode stays exact.
                  </p>
                  <div className="summaryGrid">
                    <SummaryCard
                      label="Total Spins Value (Direct Energy, no bar)"
                      value={`${formatNumber(simulation.result.summary.totalDirectEnergySpinsWithoutBar)} spins`}
                    />
                    <SummaryCard
                      label="Total Spins Value (All Rewards, no bar)"
                      value={`${formatNumber(simulation.result.summary.totalVfmWithoutBar)} spins`}
                    />
                    <SummaryCard
                      label="Total Spins Value (All Rewards, with bar)"
                      value={`${formatNumber(simulation.result.summary.totalVfmWithBar)} spins`}
                    />
                    <SummaryCard
                      label="Total Cost"
                      value={`$${simulation.result.summary.totalApproximateDollarCost.toFixed(2)}`}
                    />
                    <SummaryCard
                      label="Slope (no bar)"
                      value={formatRatio(simulation.result.summary.cumulativeSlopeWithoutBar)}
                    />
                    <SummaryCard
                      label="Slope (with bar)"
                      value={formatRatio(simulation.result.summary.cumulativeSlopeWithBar)}
                    />
                    <SummaryCard
                      label="Main / Bundle / Bar"
                      value={`${formatNumber(simulation.result.summary.totalMainValue)} / ${formatNumber(simulation.result.summary.totalBundleValue)} / ${formatNumber(simulation.result.summary.totalBarValue)}`}
                      meta={`Snapshot ${simulation.result.snapshotHash.slice(0, 8)}`}
                    />
                  </div>
                </section>

                <section className="tableCard">
                  <div className="tableHead">
                    <h2 className="panelTitle">Offer ID results</h2>
                    <p className="panelCopy">
                      Each row represents the state after that purchase index. Free follow-up
                      rewards are rolled back into the nearest preceding non-free offer for
                      total spins value and slope calculations.
                    </p>
                  </div>
                  <div className="tableWrap">
                    <table className="resultsTable">
                      <thead>
                        <tr>
                          <th>Offer</th>
                          <th>Payment</th>
                          <th>Rollup</th>
                          <th>Cost</th>
                          <th>Cumulative cost</th>
                          <th>Main</th>
                          <th>Bundle</th>
                          <th>Bar</th>
                          <th>Total spins value direct</th>
                          <th>Total spins value other</th>
                          <th>Slope no bar</th>
                          <th>Slope with bar</th>
                          <th>Cumulative no bar</th>
                          <th>Cumulative with bar</th>
                          <th>Avg milestones</th>
                          <th>Reward distribution</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rowsWithCumulativeCost.map((row) => (
                          <tr key={row.offerId}>
                            <td className="mono">{row.offerId}</td>
                            <td>{row.paymentType}</td>
                            <td>
                              {row.rollsIntoOfferId ? (
                                <span className="muted">Rolls into {row.rollsIntoOfferId}</span>
                              ) : (
                                <span className="pill">Anchor</span>
                              )}
                            </td>
                            <td>
                              ${row.approximateDollarCost.toFixed(2)}
                            </td>
                            <td>${row.cumulativeCost.toFixed(2)}</td>
                            <td>{formatNumber(row.mainValue)}</td>
                            <td>{formatNumber(row.bundleValue)}</td>
                            <td>{formatNumber(row.barValue)}</td>
                            <td>
                              {formatNumber(
                                row.directEnergyMainValue + row.directEnergyBundleValue,
                              )}
                            </td>
                            <td>
                              {formatNumber(
                                row.attributedVfmWithoutBar -
                                  (row.directEnergyMainValue +
                                    row.directEnergyBundleValue),
                              )}
                            </td>
                            <td>{formatRatio(row.incrementalSlopeWithoutBar)}</td>
                            <td>{formatRatio(row.incrementalSlopeWithBar)}</td>
                            <td>{formatRatio(row.cumulativeSlopeWithoutBar)}</td>
                            <td>{formatRatio(row.cumulativeSlopeWithBar)}</td>
                            <td>{row.averageBarMilestonesCompleted.toFixed(2)}</td>
                            <td>
                              <RewardDistribution rewardDistribution={row.rewardDistribution} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            ) : null}
          </>
        ) : (
          <section className="panel">
            <h2 className="panelTitle">Ready when you are</h2>
            <div className="emptyState">
              Sign in, connect a sheet, and refresh when you want a fresh simulation. The
              app is built for multiple teammates working independently, each with their
              own recent sheet history and result session.
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function buildDevPreviewSimulation() {
  return {
    validation: {
      issues: [],
      blockingIssues: [],
      resolvedTabs: {},
    },
    result: {
      runCount: 1000,
      weightedMode: true,
      durationMs: 24.8,
      snapshotHash: "devpreview",
      rows: [
        {
          offerId: 1,
          paymentType: "USD",
          rollsIntoOfferId: null,
          approximateDollarCost: 4.99,
          baselineSpinsCost: 500,
          mainValue: 1300,
          bundleValue: 100,
          barValue: 30,
          directEnergyMainValue: 1100,
          directEnergyBundleValue: 80,
          directEnergyBarValue: 20,
          attributedVfmWithoutBar: 1400,
          attributedVfmWithBar: 1430,
          incrementalSlopeWithoutBar: 2.8,
          incrementalSlopeWithBar: 2.86,
          cumulativeSlopeWithoutBar: 2.8,
          cumulativeSlopeWithBar: 2.86,
          averageBarMilestonesCompleted: 0.2,
          rewardDistribution: {
            main: [{ reward: "EnergySmall", averageAmount: 2 }],
            bundle: [{ reward: "CoinsPack", averageAmount: 1 }],
            bar: [{ reward: "EnergyMini", averageAmount: 1 }],
          },
        },
        {
          offerId: 2,
          paymentType: "FREE",
          rollsIntoOfferId: 1,
          approximateDollarCost: 0,
          baselineSpinsCost: 0,
          mainValue: 650,
          bundleValue: 40,
          barValue: 20,
          directEnergyMainValue: 520,
          directEnergyBundleValue: 20,
          directEnergyBarValue: 10,
          attributedVfmWithoutBar: 0,
          attributedVfmWithBar: 0,
          incrementalSlopeWithoutBar: null,
          incrementalSlopeWithBar: null,
          cumulativeSlopeWithoutBar: 2.8,
          cumulativeSlopeWithBar: 2.86,
          averageBarMilestonesCompleted: 0.6,
          rewardDistribution: {
            main: [{ reward: "EnergySmall", averageAmount: 1 }],
            bundle: [{ reward: "Puzzle_Pacing", averageAmount: 1 }],
            bar: [{ reward: "CoinsPack", averageAmount: 0.5 }],
          },
        },
        {
          offerId: 3,
          paymentType: "USD",
          rollsIntoOfferId: null,
          approximateDollarCost: 9.99,
          baselineSpinsCost: 1100,
          mainValue: 2000,
          bundleValue: 160,
          barValue: 90,
          directEnergyMainValue: 1400,
          directEnergyBundleValue: 60,
          directEnergyBarValue: 50,
          attributedVfmWithoutBar: 2160,
          attributedVfmWithBar: 2250,
          incrementalSlopeWithoutBar: 1.96,
          incrementalSlopeWithBar: 2.05,
          cumulativeSlopeWithoutBar: 2.11,
          cumulativeSlopeWithBar: 2.18,
          averageBarMilestonesCompleted: 1.8,
          rewardDistribution: {
            main: [{ reward: "EnergyLarge", averageAmount: 1 }],
            bundle: [{ reward: "CoinsPack", averageAmount: 2 }],
            bar: [{ reward: "EnergyMini", averageAmount: 2 }],
          },
        },
      ],
      summary: {
        promotionTitle: "Dev Preview Promotion",
        totalBaselineSpinsCost: 1600,
        totalApproximateDollarCost: 14.98,
        totalVfmWithoutBar: 3560,
        totalVfmWithBar: 3680,
        totalDirectEnergySpinsWithoutBar: 3180,
        totalDirectEnergySpinsWithBar: 3240,
        totalMainValue: 3950,
        totalBundleValue: 300,
        totalBarValue: 140,
        cumulativeSlopeWithoutBar: 2.11,
        cumulativeSlopeWithBar: 2.18,
      },
    },
    snapshotTitle: "Dev Preview Promotion",
    snapshotUrl: "https://docs.google.com/spreadsheets/d/dev-preview/edit",
  };
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function SummaryCard({
  label,
  value,
  meta,
}: {
  label: string;
  value: string;
  meta?: string;
}) {
  return (
    <div className="summaryCard">
      <p className="summaryLabel">{label}</p>
      <p className="summaryValue">{value}</p>
      {meta ? <div className="summaryMeta">{meta}</div> : null}
    </div>
  );
}

function ValidationIssues({
  issues,
}: {
  issues: ReturnType<typeof validatePromotionSheet>["issues"];
}) {
  if (issues.length === 0) {
    return <div className="callout">No validation issues found.</div>;
  }

  return (
    <div className="issueList">
      {issues.map((issue, index) => (
        <div
          className={`issue ${issue.severity === "error" ? "issueError" : "issueWarning"}`}
          key={`${issue.tab}-${issue.field ?? "general"}-${index}`}
        >
          <div className="issueHeader">
            <span className="pill">{issue.severity}</span>
            <span>{issue.tab}</span>
            {issue.field ? <span className="muted">• {issue.field}</span> : null}
          </div>
          <div>{issue.message}</div>
        </div>
      ))}
    </div>
  );
}

function RewardDistribution({
  rewardDistribution,
}: {
  rewardDistribution: {
    main: DistributionEntry[];
    bundle: DistributionEntry[];
    bar: DistributionEntry[];
  };
}) {
  return (
    <div className="distList">
      <DistributionSection title="Main" entries={rewardDistribution.main} />
      <DistributionSection title="Bundle" entries={rewardDistribution.bundle} />
      <DistributionSection title="Bar" entries={rewardDistribution.bar} />
    </div>
  );
}

function DistributionSection({
  title,
  entries,
}: {
  title: string;
  entries: DistributionEntry[];
}) {
  return (
    <div className="distSection">
      <p className="distTitle">{title}</p>
      {entries.length > 0 ? (
        entries.map((entry) => (
          <div className="distEntry" key={`${title}-${entry.reward}`}>
            <span>{entry.reward}</span>
            <span>{entry.averageAmount.toFixed(2)}</span>
          </div>
        ))
      ) : (
        <div className="muted">None</div>
      )}
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function formatRatio(value: number | null) {
  return value === null ? "—" : value.toFixed(2);
}
