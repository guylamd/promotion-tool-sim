import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  connectSheetAction,
  removeRecentSheetAction,
  refreshSheetAction,
} from "@/app/actions";
import { BackToTopButton } from "@/app/back-to-top-button";
import { FormSubmitLoaderButton } from "@/app/form-submit-loader-button";
import { OfferResultsTable } from "@/app/offer-results-table";
import { RefreshFloatingButton } from "@/app/refresh-floating-button";
import { RefreshSubmitOverlay } from "@/app/refresh-submit-overlay";
import { ThemeSwitch } from "@/app/theme-switch";
import { getCurrentUser } from "@/lib/auth";
import { hasGoogleOAuthConfig, isDevPreviewEnabled } from "@/lib/env";
import { listRecentSheets, saveRecentSheet, type RecentSheet } from "@/lib/db";
import { buildPromotionModel, runSimulation, validatePromotionSheet } from "@/lib/promotion";
import { buildSpreadsheetUrl, extractSpreadsheetId, loadSpreadsheetSnapshot } from "@/lib/google";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const currentTheme = cookieStore.get("theme")?.value === "dark" ? "dark" : "light";
  const errorParam = readParam(params.error);
  const authErrorParam = readParam(params.auth_error);
  const sheetParam = readParam(params.sheet);
  const autoExportEnabled = readParam(params.autoExport) === "1";
  const currentUser = await getCurrentUser();
  const devPreview = isDevPreviewEnabled();
  const oauthReady = hasGoogleOAuthConfig();
  const recentSheets = currentUser ? await listRecentSheets(currentUser.id) : [];

  if (!devPreview && oauthReady && !currentUser && !authErrorParam) {
    redirect("/api/auth/login");
  }

  let pageError = authErrorParam || errorParam;
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

      await saveRecentSheet({
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

  const rowsWithCumulativeValues = simulation?.result
    ? simulation.result.rows.map((row, index, allRows) => {
        const currentDirect = row.directEnergyMainValue + row.directEnergyBundleValue;
        const currentOther = row.mainValue + row.bundleValue - currentDirect;
        const cumulativeCost = allRows
          .slice(0, index + 1)
          .reduce((sum, entry) => sum + entry.approximateDollarCost, 0);
        const cumulativeDirect = allRows.slice(0, index + 1).reduce((sum, entry) => {
          return sum + entry.directEnergyMainValue + entry.directEnergyBundleValue;
        }, 0);
        const cumulativeOther = allRows.slice(0, index + 1).reduce((sum, entry) => {
          const entryDirect = entry.directEnergyMainValue + entry.directEnergyBundleValue;
          return sum + (entry.mainValue + entry.bundleValue - entryDirect);
        }, 0);
        const cumulativeTotalSpinsValue = cumulativeDirect + cumulativeOther;

        return {
          ...row,
          currentDirect,
          currentOther,
          cumulativeCost,
          cumulativeDirect,
          cumulativeOther,
          cumulativeTotalSpinsValue,
        };
      })
    : [];

  return (
    <main className="shell">
      <header className="appHeader">
        <img className="appLogo" src="/whalo-logo.gif" alt="Whalo logo" />
        <h1 className="appTitle">Promotion Tool Simulator</h1>
        <div className="headerActions">
          <ThemeSwitch initialTheme={currentTheme} />
        </div>
      </header>

      <div className="stack">
        <section className="panel" id="sheet-connect-panel">
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
                <span className="muted">Offer ID, Group, Close Group, Payment Type, Dollar Cost, Resource Cost, Bar Points, Limit, Weight, Reward Index, Reward 1, Reward 1 Amount</span>
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
              disabled={!currentUser && !devPreview}
            />
            <label className="toggleRow">
              <input
                type="checkbox"
                name="autoExport"
                value="1"
                defaultChecked={autoExportEnabled}
              />
              <span>Auto-export results to sheet on each run</span>
            </label>
            <div className="actions">
              <FormSubmitLoaderButton
                className="button"
                idleLabel="Connect sheet"
                loadingLabel="Connecting sheet..."
                disabled={!currentUser && !devPreview}
              />
              {simulation ? (
                <FormSubmitLoaderButton
                  className="secondaryButton"
                  idleLabel="Refresh simulation"
                  loadingLabel="Refreshing simulation..."
                  form="refresh-simulation-form"
                />
              ) : null}
            </div>
          </form>
          {simulation ? (
            <form id="refresh-simulation-form" action={refreshSheetAction}>
              <input type="hidden" name="sheetUrl" value={simulation.snapshotUrl} />
              <input type="hidden" name="autoExport" value={autoExportEnabled ? "1" : "0"} />
            </form>
          ) : null}
        </section>

        {recentSheets.length > 0 ? (
          <section className="panel">
            <details className="requirementsDetails" open>
              <summary className="requirementsSummary">
                Recent sheets ({recentSheets.length})
              </summary>
              <div className="recentList">
                {recentSheets.map((sheet: RecentSheet) => (
                  <div className="recentItem" key={`${sheet.userId}-${sheet.spreadsheetId}`}>
                    <div className="recentMeta">
                      <p className="recentTitle">
                        {sheet.spreadsheetTitle ?? `Sheet ${sheet.spreadsheetId}`}
                      </p>
                      <div className="recentSubtle">{sheet.spreadsheetUrl}</div>
                    </div>
                    <div className="recentActions">
                      <form action={refreshSheetAction}>
                        <input type="hidden" name="sheetUrl" value={sheet.spreadsheetUrl} />
                        <input type="hidden" name="autoExport" value={autoExportEnabled ? "1" : "0"} />
                        <button className="secondaryButton" type="submit">
                          Open
                        </button>
                      </form>
                      <form action={removeRecentSheetAction}>
                        <input type="hidden" name="spreadsheetId" value={sheet.spreadsheetId} />
                        <input type="hidden" name="currentSheet" value={sheetParam ?? ""} />
                        <input type="hidden" name="autoExport" value={autoExportEnabled ? "1" : "0"} />
                        <button className="recentDeleteButton" type="submit" aria-label="Remove from recent sheets">
                          ×
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            </details>
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
                  <details className="requirementsDetails" open>
                    <summary className="requirementsSummary tableSummary">
                      By Group Values
                    </summary>
                    <div className="tableHead">
                      <p className="panelCopy">
                        Group-level values including optional Buy All economics when Buy All
                        Cost is configured in Groups Config.
                      </p>
                    </div>
                    <div className="tableWrap">
                      <table className="resultsTable">
                        <thead>
                          <tr>
                            <th>Group</th>
                            <th>Offer count</th>
                            <th>Total cost</th>
                            <th>Total main value</th>
                            <th>Total bundle value</th>
                            <th>Total bar value</th>
                            <th>Direct energy spins value</th>
                            <th>Other rewards spins value</th>
                            <th>Total spins value no bar</th>
                            <th>Total spins value with bar</th>
                            <th>Slope no bar</th>
                            <th>Slope with bar</th>
                            <th>Buy all cost</th>
                            <th>Buy all slope no bar</th>
                            <th>Buy all slope with bar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {simulation.result.byGroupValues.map((groupRow) => (
                            <tr key={`group-values-${groupRow.group}`}>
                              <td className="mono">{groupRow.group}</td>
                              <td>{groupRow.offerCount}</td>
                              <td>${groupRow.totalCost.toFixed(2)}</td>
                              <td>{formatNumber(groupRow.totalMainValue)}</td>
                              <td>{formatNumber(groupRow.totalBundleValue)}</td>
                              <td>{formatNumber(groupRow.totalBarValue)}</td>
                              <td>{formatNumber(groupRow.totalDirectEnergySpins)}</td>
                              <td>{formatNumber(groupRow.totalOtherSpins)}</td>
                              <td>{formatNumber(groupRow.totalSpinsNoBar)}</td>
                              <td>{formatNumber(groupRow.totalSpinsWithBar)}</td>
                              <td>{formatRatio(groupRow.slopeNoBar)}</td>
                              <td>{formatRatio(groupRow.slopeWithBar)}</td>
                              <td>
                                {groupRow.buyAllCost === null
                                  ? "-"
                                  : `$${groupRow.buyAllCost.toFixed(2)}`}
                              </td>
                              <td>{formatRatio(groupRow.buyAllSlopeNoBar)}</td>
                              <td>{formatRatio(groupRow.buyAllSlopeWithBar)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </section>

                <section className="tableCard">
                  <div className="tableHead">
                    <h2 className="panelTitle">Offer ID results</h2>
                    <p className="panelCopy">
                      Each row represents the state after that purchase index, with reward
                      value columns shown as row-level outcomes for that offer.
                    </p>
                  </div>
                  <div className="tableWrap">
                    <OfferResultsTable rows={rowsWithCumulativeValues} />
                  </div>
                </section>

                <section className="tableCard">
                  <div className="tableHead">
                    <h2 className="panelTitle">Rewards Distribution per Offer ID</h2>
                    <p className="panelCopy">
                      Distribution of selected main-config reward index per offer ID.
                    </p>
                  </div>
                  <div className="tableWrap">
                    {(() => {
                      const distribution = simulation.result?.rewardIndexDistribution;
                      if (!distribution) {
                        return null;
                      }
                      return (
                        <table className="resultsTable">
                          <thead>
                            <tr>
                              <th>Offer ID</th>
                              {distribution.columns.map((column) => (
                                <th key={column.key}>{column.label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {distribution.rows.map((row) => (
                              <tr key={`reward-distribution-${row.offerId}`}>
                                <td className="mono">{row.offerId}</td>
                                {distribution.columns.map((column) => (
                                  <td key={`${row.offerId}-${column.key}`}>
                                    {formatPercent(row.values[column.key] ?? 0)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      );
                    })()}
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
      <BackToTopButton targetId="sheet-connect-panel" />
      {simulation ? (
        <RefreshFloatingButton
          anchorId="sheet-connect-panel"
          refreshFormId="refresh-simulation-form"
        />
      ) : null}
      {simulation ? <RefreshSubmitOverlay formId="refresh-simulation-form" /> : null}
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
          group: 1,
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
          group: 1,
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
          group: 2,
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
      rewardIndexDistribution: {
        columns: [
          { key: "Reward Index 1", label: "Reward Index 1 (EnergySmall x 2 + CoinsPack x 1)" },
          { key: "Reward Index 2", label: "Reward Index 2 (EnergySmall x 1 + Puzzle_Pacing x 1)" },
          { key: "Reward Index 3", label: "Reward Index 3 (EnergyLarge x 1 + CoinsPack x 2)" },
        ],
        rows: [
          {
            offerId: 1,
            values: {
              "Reward Index 1": 0.6,
              "Reward Index 2": 0.3,
              "Reward Index 3": 0.1,
            },
          },
          {
            offerId: 2,
            values: {
              "Reward Index 1": 0.5,
              "Reward Index 2": 0.4,
              "Reward Index 3": 0.1,
            },
          },
          {
            offerId: 3,
            values: {
              "Reward Index 1": 0.4,
              "Reward Index 2": 0.4,
              "Reward Index 3": 0.2,
            },
          },
        ],
      },
      byGroupValues: [
        {
          group: 1,
          offerCount: 2,
          totalCost: 4.99,
          totalMainValue: 1950,
          totalBundleValue: 140,
          totalBarValue: 50,
          totalDirectEnergySpins: 1720,
          totalOtherSpins: 370,
          totalSpinsNoBar: 2090,
          totalSpinsWithBar: 2140,
          slopeNoBar: 4.18,
          slopeWithBar: 4.28,
          buyAllCost: 3.99,
          buyAllSlopeNoBar: 5.23,
          buyAllSlopeWithBar: 5.36,
        },
        {
          group: 2,
          offerCount: 1,
          totalCost: 9.99,
          totalMainValue: 2000,
          totalBundleValue: 160,
          totalBarValue: 90,
          totalDirectEnergySpins: 1460,
          totalOtherSpins: 700,
          totalSpinsNoBar: 2160,
          totalSpinsWithBar: 2250,
          slopeNoBar: 1.96,
          slopeWithBar: 2.05,
          buyAllCost: null,
          buyAllSlopeNoBar: null,
          buyAllSlopeWithBar: null,
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

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function formatRatio(value: number | null) {
  return value === null ? "—" : value.toFixed(2);
}
