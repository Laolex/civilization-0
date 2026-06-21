import React from "react";
import Link from "next/link";
// Deep-import the LIGHT read path + pg-only pool only — never pull the heavy
// engine/store/memory graph into the Next bundle.
import { getPool } from "@civ/persistence/src/pool";
import { readWorlds } from "@civ/persistence/src/read";
import { getCurrentUser } from "../../lib/auth";
import { CreateWorldWidget } from "./create-world-widget";
import { LiveDot } from "../../components/LiveDot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function WorldsPage() {
  const user = await getCurrentUser();
  let worlds: Awaited<ReturnType<typeof readWorlds>> | null = null;
  let error: string | null = null;
  try {
    worlds = await readWorlds(getPool(), user?.id);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  if (!worlds) {
    return (
      <main className="board">
        <header className="board-head">
          <div className="board-live board-live--down">
            <span className="live-dot live-dot--down" aria-hidden />
            <span className="board-live-label mono">NO SIGNAL</span>
          </div>
          <h1 className="board-title">Worlds out of reach.</h1>
          <p className="board-sub">The keyless read path couldn’t reach Postgres.</p>
        </header>
        <div className="board-fault">
          <span className="board-fault-label mono">db unavailable</span>
          {error && <code className="board-fault-msg mono">{error}</code>}
        </div>
      </main>
    );
  }

  const totalPop = worlds.reduce((n, w) => n + w.population, 0);
  const privateCount = worlds.filter((w) => w.visibility === "private").length;

  return (
    <main className="board">
      <header className="board-head">
        <div className="board-live">
          <LiveDot />
          <span className="board-live-label mono">LIVE on 0G</span>
          <span className="board-live-cadence">each world ticks itself on 0G</span>
        </div>
        <h1 className="board-title">Worlds.</h1>
        <p className="board-sub">
          Every world runs its own society on <span className="ink">0G</span>. Genesis is public;
          sign in to spin up private worlds and populate them with citizens that reason on 0G.
        </p>
      </header>

      <section className="cluster cluster--three" aria-label="World totals">
        <div className="cluster-cell">
          <span className="cluster-label">Worlds</span>
          <span className="cluster-value mono">{worlds.length}</span>
          <span className="cluster-foot">{privateCount} private</span>
        </div>
        <div className="cluster-cell">
          <span className="cluster-label">Population</span>
          <span className="cluster-value mono">{totalPop}</span>
          <span className="cluster-foot">citizens across all worlds</span>
        </div>
        <div className="cluster-cell">
          <span className="cluster-label">Public</span>
          <span className="cluster-value mono">{worlds.length - privateCount}</span>
          <span className="cluster-foot">open to everyone</span>
        </div>
      </section>

      <div className="org-grid">
        {worlds.map((w) => {
          const cap = w.populationCap || 1;
          const pct = Math.max(0, Math.min(100, Math.round((w.population / cap) * 100)));
          const isPrivate = w.visibility === "private";
          const href = w.id === "genesis" ? "/world" : "/map";
          return (
            <Link key={w.id} href={href} className={`wl-card${isPrivate ? " wl-card--private" : ""}`}>
              <div className="wl-card-head">
                <span className="wl-card-name">{w.name}</span>
                <span className={`wl-vis mono${isPrivate ? " wl-vis--private" : ""}`}>
                  {isPrivate && <span aria-hidden>🔒 </span>}{w.visibility}
                </span>
              </div>
              <div className="wl-pop">
                <span className="wl-pop-bar" aria-hidden>
                  <span className="wl-pop-fill" style={{ width: `${pct}%` }} />
                </span>
                <span className="wl-pop-label mono">{w.population}/{w.populationCap}</span>
              </div>
              <span className="wl-card-go mono">{w.id === "genesis" ? "Open dashboard →" : "View on map →"}</span>
            </Link>
          );
        })}
      </div>

      {user ? (
        <CreateWorldWidget />
      ) : (
        <p className="map-note">
          <Link href="/login" className="bld-proof-link mono">Sign in</Link> to create your own private worlds.
        </p>
      )}

      <nav className="board-foot" aria-label="Navigation">
        <Link href="/map" className="board-foot-cta">◉ Living map</Link>
        <Link href="/world" className="board-foot-cta board-foot-cta--ghost">Dashboard</Link>
        <span className="board-foot-spacer" />
        <Link href="/" className="board-foot-link mono">← Home</Link>
      </nav>
    </main>
  );
}
