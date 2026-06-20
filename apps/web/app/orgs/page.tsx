import React from "react";
import Link from "next/link";
// Deep-import the LIGHT read path only (pg-only) — never pull the heavy
// engine/store/memory graph into the Next bundle.
import { getPool } from "@civ/persistence/src/pool";
import { readOrgList } from "@civ/persistence/src/read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      <main className="world-root">
        <p className="landing-eyebrow">Organizations · civilization-0</p>
        <h1 className="world-h1">Organizations not connected</h1>
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
      <p className="landing-eyebrow">Organizations · civilization-0</p>
      <h1 className="world-h1">Organizations</h1>

      {orgs.length === 0 ? (
        <p className="world-empty">No organizations yet. Run the org seed.</p>
      ) : (
        <table className="world-table">
          <thead>
            <tr>
              <th className="world-th">Name</th>
              <th className="world-th">Kind</th>
              <th className="world-th world-th-right">Members</th>
              <th className="world-th world-th-right">Treasury</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id} className="world-tr">
                <td className="world-td">
                  <Link href={`/orgs/${o.id}`} className="world-id-link">
                    {o.name}
                  </Link>
                </td>
                <td className="world-td mono">{o.kind}</td>
                <td className="world-td world-td-right mono">{o.memberCount}</td>
                <td className="world-td world-td-right mono world-accent">{o.treasury}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="build-cta-row" style={{ marginTop: 40 }}>
        <Link href="/world" className="build-link">← World</Link>
      </div>
    </main>
  );
}
