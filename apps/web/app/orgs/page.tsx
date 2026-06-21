import React from "react";
import Link from "next/link";
// Deep-import the LIGHT read path only (pg-only) — never pull the heavy
// engine/store/memory graph into the Next bundle.
import { getPool } from "@civ/persistence/src/pool";
import { readOrgList } from "@civ/persistence/src/read";
import { LiveDot } from "../../components/LiveDot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

export default async function OrgsPage() {
  let orgs: Awaited<ReturnType<typeof readOrgList>> | null = null;
  let error: string | null = null;
  try {
    orgs = await readOrgList(getPool());
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  if (!orgs) {
    return (
      <main className="board">
        <header className="board-head">
          <div className="board-live board-live--down">
            <span className="live-dot live-dot--down" aria-hidden />
            <span className="board-live-label mono">NO SIGNAL</span>
          </div>
          <h1 className="board-title">Organizations out of reach.</h1>
          <p className="board-sub">The keyless read path couldn’t reach Postgres. The world keeps reasoning on 0G regardless.</p>
        </header>
        <div className="board-fault">
          <span className="board-fault-label mono">db unavailable</span>
          {error && <code className="board-fault-msg mono">{error}</code>}
        </div>
      </main>
    );
  }

  const totalTreasury = orgs.reduce((n, o) => n + o.treasury, 0);
  const totalMembers = orgs.reduce((n, o) => n + o.memberCount, 0);

  return (
    <main className="board">
      <header className="board-head">
        <div className="board-live">
          <LiveDot />
          <span className="board-live-label mono">LIVE on 0G</span>
          <span className="board-live-cadence">reasoning as agents · testnet 16602</span>
        </div>
        <h1 className="board-title">Organizations.</h1>
        <p className="board-sub">
          Organizations reason as <span className="ink">agents in their own right</span> — strategy,
          hiring, treasury — projected into a persona and run through the exact same 0G brain as
          citizens. Their decisions archive to <span className="ink">0G Storage</span> identically.
        </p>
      </header>

      {orgs.length > 0 && (
        <section className="cluster cluster--three" aria-label="Organization totals">
          <div className="cluster-cell">
            <span className="cluster-label">Organizations</span>
            <span className="cluster-value mono">{orgs.length}</span>
            <span className="cluster-foot">reasoning as agents</span>
          </div>
          <div className="cluster-cell">
            <span className="cluster-label">Combined treasury</span>
            <span className="cluster-value mono">{money(totalTreasury)}</span>
            <span className="cluster-foot">moves with every decision</span>
          </div>
          <div className="cluster-cell">
            <span className="cluster-label">Members</span>
            <span className="cluster-value mono">{totalMembers}</span>
            <span className="cluster-foot">citizens enrolled</span>
          </div>
        </section>
      )}

      {orgs.length === 0 ? (
        <div className="board-empty">
          <p className="board-empty-title">No organizations yet.</p>
          <p className="board-empty-body">
            As the world runs, ambitious citizens found organizations — they’ll appear here, each
            reasoning and archiving to 0G like any other agent.
          </p>
        </div>
      ) : (
        <div className="org-grid">
          {orgs.map((o) => (
            <Link key={o.id} href={`/orgs/${o.id}`} className="org-card">
              <span className="org-card-mark" aria-hidden />
              <span className="org-card-name">{o.name}</span>
              <span className="org-card-kind mono">{o.kind}</span>
              <dl className="org-card-stats">
                <div>
                  <dt className="org-card-stat-label">Treasury</dt>
                  <dd className="org-card-stat-val mono">{money(o.treasury)}</dd>
                </div>
                <div>
                  <dt className="org-card-stat-label">Members</dt>
                  <dd className="org-card-stat-val mono">{o.memberCount}</dd>
                </div>
              </dl>
              <span className="org-card-go mono">View organization →</span>
            </Link>
          ))}
        </div>
      )}

      <nav className="board-foot" aria-label="Navigation">
        <Link href="/world" className="board-foot-cta">The world</Link>
        <Link href="/map" className="board-foot-cta board-foot-cta--ghost">Living map</Link>
        <Link href="/history" className="board-foot-cta board-foot-cta--ghost">History</Link>
        <span className="board-foot-spacer" />
        <Link href="/" className="board-foot-link mono">← Home</Link>
      </nav>
    </main>
  );
}
