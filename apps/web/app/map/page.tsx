import React from "react";
import Link from "next/link";
import { getPool } from "@civ/persistence/src/pool";
import { readWorldMap, type MapWorld } from "@civ/persistence/src/read";
import { Constellation } from "../../components/Constellation";
import { LiveDot } from "../../components/LiveDot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function MapPage() {
  let worlds: MapWorld[] = [];
  let error: string | null = null;
  try {
    worlds = await readWorldMap(getPool());
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const totalCitizens = worlds.reduce((n, w) => n + w.citizens.length, 0);
  const totalOrgs = worlds.reduce((n, w) => n + w.orgs.length, 0);
  const privateWorlds = worlds.filter((w) => w.visibility === "private").length;

  return (
    <main className="board">
      <header className="board-head">
        <div className="board-live">
          <LiveDot />
          <span className="board-live-label mono">LIVE on 0G</span>
          <span className="board-live-cadence">hover a citizen to light up their web · click to replay the decision and see which ties pulled it</span>
        </div>
        <h1 className="board-title">Every world. Every citizen. Alive.</h1>
        <p className="board-sub">
          Each field is a world; each glowing dot a citizen reasoning on{" "}
          <span className="ink">0G Compute</span>, and each line a real relationship between them —
          brighter ties run deeper. Organizations pull their members close. Open any node to see the
          causal chain — reasoned and archived on 0G — that got it there.
        </p>
        <p className="map-exhibit">
          the provenance layer for autonomous AI — watch citizens reason over the social graph, live on 0G. click any citizen to replay the decision and see which ties pulled it.{" "}
          <Link href="/build" className="map-exhibit-link">See how it wraps any agent →</Link>
        </p>
      </header>

      {!error && (
        <section className="cluster cluster--three" aria-label="Map totals">
          <div className="cluster-cell">
            <span className="cluster-label">Worlds</span>
            <span className="cluster-value mono">{worlds.length}</span>
            <span className="cluster-foot">{privateWorlds} private</span>
          </div>
          <div className="cluster-cell">
            <span className="cluster-label">Citizens</span>
            <span className="cluster-value mono">{totalCitizens}</span>
            <span className="cluster-foot">reasoning on 0G Compute</span>
          </div>
          <div className="cluster-cell">
            <span className="cluster-label">Organizations</span>
            <span className="cluster-value mono">{totalOrgs}</span>
            <span className="cluster-foot">agents in their own right</span>
          </div>
        </section>
      )}

      {/* Legend: teach the encoding before the visualization dazzles */}
      <div className="map-legend" aria-label="Legend">
        <span className="map-legend-item">
          <span className="tier-dot tier-1" aria-hidden /> tier 1
        </span>
        <span className="map-legend-item">
          <span className="tier-dot tier-2" aria-hidden /> tier 2
        </span>
        <span className="map-legend-item">
          <span className="tier-dot tier-3" aria-hidden /> tier 3 — brighter, higher standing
        </span>
        <span className="map-legend-sep" aria-hidden />
        <span className="map-legend-item">
          <span className="map-legend-org" aria-hidden /> organization
        </span>
        <span className="map-legend-sep" aria-hidden />
        <span className="map-legend-item">
          <span className="map-legend-edge" aria-hidden /> relationship — brighter = stronger
        </span>
        <span className="map-legend-item">
          <span className="map-legend-lock" aria-hidden>🔒</span> private world
        </span>
      </div>

      {error ? (
        <div className="board-fault">
          <span className="board-fault-label mono">map unavailable</span>
          <code className="board-fault-msg mono">{error}</code>
        </div>
      ) : worlds.length === 0 ? (
        <div className="board-empty">
          <p className="board-empty-title">No worlds yet.</p>
          <p className="board-empty-body">
            Seed a world and its citizens will begin reasoning on 0G — they’ll appear here, drifting.
          </p>
        </div>
      ) : (
        <Constellation worlds={worlds} />
      )}

      <nav className="board-foot" aria-label="Map navigation">
        <Link href="/citizens/new" className="board-foot-cta">+ Add your citizen</Link>
        <Link href="/worlds" className="board-foot-cta board-foot-cta--ghost">Create a world</Link>
        <Link href="/world" className="board-foot-cta board-foot-cta--ghost">Dashboard</Link>
        <span className="board-foot-spacer" />
        <Link href="/" className="board-foot-link mono">← Home</Link>
      </nav>
      <p className="map-note">
        Anyone can drop a citizen into the public world. Sign in to create your own private world and populate it.
      </p>
    </main>
  );
}
