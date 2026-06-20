import React from "react";
import Link from "next/link";
// Deep-import the LIGHT read path + pg-only pool only — never pull the heavy
// engine/store/memory graph into the Next bundle.
import { getPool } from "@civ/persistence/src/pool";
import { readWorlds } from "@civ/persistence/src/read";
import { getCurrentUser } from "../../lib/auth";
import { CreateWorldWidget } from "./create-world-widget";

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
      <main className="world-root">
        <p className="landing-eyebrow">Worlds · civilization-0</p>
        <h1 className="world-h1">Worlds not connected</h1>
        <div className="world-error-panel">
          <p className="world-error-label mono">Database unavailable</p>
          {error && <p className="world-error-msg mono">{error}</p>}
        </div>
        <div className="build-cta-row" style={{ marginTop: 32 }}>
          <Link href="/world" className="build-link">← World</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="world-root">
      <p className="landing-eyebrow">Worlds · civilization-0</p>
      <h1 className="world-h1">Worlds</h1>

      <table className="world-table">
        <thead>
          <tr>
            <th className="world-th">Name</th>
            <th className="world-th">Visibility</th>
            <th className="world-th world-th-right">Population</th>
            <th className="world-th world-th-right">Cap</th>
          </tr>
        </thead>
        <tbody>
          {worlds.map((w) => (
            <tr key={w.id} className="world-tr">
              <td className="world-td">
                {w.id === "genesis" ? (
                  <Link href="/world" className="world-id-link">{w.name}</Link>
                ) : (
                  w.name
                )}
              </td>
              <td className="world-td mono">{w.visibility}</td>
              <td className="world-td world-td-right mono world-accent">{w.population}</td>
              <td className="world-td world-td-right mono">{w.populationCap}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {user && <CreateWorldWidget />}

      <div className="build-cta-row" style={{ marginTop: 40 }}>
        <Link href="/world" className="build-link">← World</Link>
      </div>
    </main>
  );
}
