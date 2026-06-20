import React from "react";
import Link from "next/link";
// Deep-import the LIGHT read path only (pg-only) — never pull the engine/store
// graph (@civ/engine, @civ/store, @civ/memory) into the Next bundle.
import { getPool } from "@civ/persistence/src/pool";
import { readWorldView, type WorldView } from "@civ/persistence/src/read";
import { topCitizens, recent, population } from "../../lib/dashboard";
import { ZeroGBadges } from "../../components/ZeroGBadges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function WorldPage() {
  let view: WorldView | null = null;
  let error: string | null = null;
  try {
    view = await readWorldView(getPool(), 20);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  if (!view) {
    return (
      <main className="world-root">
        <p className="landing-eyebrow">World Dashboard · civilization-0</p>
        <h1 className="world-h1">World not connected</h1>
        <div className="world-error-panel">
          <p className="world-error-label mono">Database unavailable</p>
          {error && <p className="world-error-msg mono">{error}</p>}
        </div>
        <div className="build-cta-row" style={{ marginTop: 32 }}>
          <Link href="/" className="build-link">← Home</Link>
        </div>
      </main>
    );
  }

  const citizens = topCitizens(view, 8);
  const events = recent(view, 20);
  const pop = population(view);

  return (
    <main className="world-root">
      <p className="landing-eyebrow">World Dashboard · civilization-0</p>
      <h1 className="world-h1">The World</h1>

      <div className="world-stat-row">
        <div className="world-stat-card">
          <span className="label">Day</span>
          <span className="world-stat-value mono">{view.day}</span>
        </div>
        <div className="world-stat-card">
          <span className="label">Population</span>
          <span className="world-stat-value mono">{pop}</span>
        </div>
      </div>

      <section className="world-section">
        <h2 className="world-section-h2">Top Citizens</h2>
        {citizens.length === 0 ? (
          <p className="world-empty">No citizens yet.</p>
        ) : (
          <table className="world-table">
            <thead>
              <tr>
                <th className="world-th">ID</th>
                <th className="world-th">Name</th>
                <th className="world-th">Tier</th>
                <th className="world-th world-th-right">Reputation</th>
              </tr>
            </thead>
            <tbody>
              {citizens.map((c) => (
                <tr key={c.id} className="world-tr">
                  <td className="world-td">
                    <Link href={`/citizens/${c.id}`} className="world-id-link mono">
                      {c.id}
                    </Link>
                  </td>
                  <td className="world-td">{c.name}</td>
                  <td className="world-td mono">{c.tier}</td>
                  <td className="world-td world-td-right mono world-accent">{c.reputation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="world-section">
        <h2 className="world-section-h2">Recent Events</h2>
        {events.length === 0 ? (
          <p className="world-empty">No events yet.</p>
        ) : (
          <ul className="world-event-list">
            {events.map((e) => (
              <li key={e.id} className="world-event-item">
                <span className="world-event-day label">Day {e.day}</span>
                <span className="world-event-type mono">{e.type}</span>
                <span className="world-event-actors mono">
                  <Link href={`/citizens/${e.actorId}`} className="world-id-link">{e.actorId}</Link>
                  {e.targetId && (
                    <>
                      {" → "}
                      <Link href={`/citizens/${e.targetId}`} className="world-id-link">{e.targetId}</Link>
                    </>
                  )}
                </span>
                <span className="world-event-id mono">{e.id}</span>
                <ZeroGBadges rootHash={e.rootHash} verified />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="build-cta-row" style={{ marginTop: 40 }}>
        <Link href="/orgs" className="landing-cta">Organizations →</Link>
        <Link href="/history" className="landing-cta">History →</Link>
        <Link href="/citizens/new" className="landing-cta">+ New citizen</Link>
        <Link href="/" className="build-link">← Home</Link>
      </div>
    </main>
  );
}
