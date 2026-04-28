import Link from "next/link";

import { connectSheetAction, refreshSheetAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";
import { hasGoogleOAuthConfig } from "@/lib/env";
import { listRecentSheets, saveRecentSheet } from "@/lib/db";
import { buildPromotionModel, runSimulation, validatePromotionSheet, type DistributionEntry } from "@/lib/promotion";
import { buildSpreadsheetUrl, extractSpreadsheetId, loadSpreadsheetSnapshot } from "@/lib/google";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const errorParam = readParam(params.error);
  const sheetParam = readParam(params.sheet);
  const currentUser = await getCurrentUser();
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

  return (
    <main className="shell">
      <section className="hero">
        <div className="heroCard">
          <span className="eyebrow">Promotion Simulator</span>
          <h1 className="heroTitle">Sheet-driven results, fast enough to iterate live.</h1>
          <p className="heroCopy">
            Connect a promotion sheet, validate the tabs and headers with forgiving
            matching, and run deterministic or Monte Carlo results only when the
            designer clicks refresh.
          </p>
          <div className="heroStats">
            <div className="stat">
              <span className="statLabel">Mode</span>
              <strong className="statValue">Single promotion deep-dive</strong>
            </div>
            <div className="stat">
              <span className="statLabel">Read model</span>
              <strong className="statValue">User-scoped Google Sheets</strong>
            </div>
            <div className="stat">
              <span className="statLabel">Refresh model</span>
              <strong className="statValue">Manual recompute</strong>
            </div>
          </div>
        </div>

        <div className="heroSide">
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
                    <Link className="ghostButton" href="/api/auth/logout">
                      Sign out
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <p className="panelCopy">
                    Sign in with Google so the app can read only the sheets you already
                    have access to.
                  </p>
                  <div className="actions">
                    <Link className="button" href="/api/auth/login">
                      Sign in with Google
                    </Link>
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
            <h2 className="panelTitle">How the app reads sheets</h2>
            <p className="panelCopy">
              Tab and header matching is case-insensitive and space-tolerant. Names are
              normalized before validation so designers do not get blocked by casing or
              whitespace noise.
            </p>
            <div className="actions">
              <span className="pill">Main Config</span>
              <span className="pill">Bar Config</span>
              <span className="pill">Resource &amp; Valuation</span>
            </div>
          </section>
        </div>
      </section>

      <div className="stack">
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
            <form action={refreshSheetAction}>
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
                      label="Compute time"
                      value={`${simulation.result.durationMs.toFixed(1)} ms`}
                      meta={simulation.result.weightedMode ? "Monte Carlo path" : "Exact path"}
                    />
                    <SummaryCard
                      label="Total VFM (no bar)"
                      value={formatNumber(simulation.result.summary.totalVfmWithoutBar)}
                      meta={`Slope ${formatRatio(simulation.result.summary.cumulativeSlopeWithoutBar)}`}
                    />
                    <SummaryCard
                      label="Total VFM (with bar)"
                      value={formatNumber(simulation.result.summary.totalVfmWithBar)}
                      meta={`Slope ${formatRatio(simulation.result.summary.cumulativeSlopeWithBar)}`}
                    />
                    <SummaryCard
                      label="Baseline spins cost"
                      value={formatNumber(simulation.result.summary.totalBaselineSpinsCost)}
                      meta={`~$${simulation.result.summary.totalApproximateDollarCost.toFixed(2)}`}
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
                      VFM and slope calculations.
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
                          <th>Main</th>
                          <th>Bundle</th>
                          <th>Bar</th>
                          <th>VFM no bar</th>
                          <th>VFM with bar</th>
                          <th>Slope no bar</th>
                          <th>Slope with bar</th>
                          <th>Cumulative no bar</th>
                          <th>Cumulative with bar</th>
                          <th>Avg milestones</th>
                          <th>Reward distribution</th>
                        </tr>
                      </thead>
                      <tbody>
                        {simulation.result.rows.map((row) => (
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
                              <div>{formatNumber(row.baselineSpinsCost)} spins</div>
                              <div className="muted">~${row.approximateDollarCost.toFixed(2)}</div>
                            </td>
                            <td>{formatNumber(row.mainValue)}</td>
                            <td>{formatNumber(row.bundleValue)}</td>
                            <td>{formatNumber(row.barValue)}</td>
                            <td>{formatNumber(row.attributedVfmWithoutBar)}</td>
                            <td>{formatNumber(row.attributedVfmWithBar)}</td>
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
