import React from "react";
import Link from "next/link";
// Deep-import the LIGHT read path only (pg-only) — never pull the heavy
// engine/store/memory graph into the Next bundle.
import { getPool } from "@civ/persistence/src/pool";
import { readOrg, type OrgView } from "@civ/persistence/src/read";
import { ZeroGBadges } from "../../../components/ZeroGBadges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OrgDetailPage({ params }: { params: { id: string } }) {
  let org: OrgView | null = null;
  let error: string | null = null;
  try {
    org = await readOrg(getPool(), params.id);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  if (!org) {
    return (
      <main className="world-root">
        <p className="landing-eyebrow">Organization · civilization-0</p>
        <h1 className="world-h1">Organization not found</h1>
        <div className="world-error-panel">
          <p className="world-error-label mono">No organization for id {params.id}</p>
          {error && <p className="world-error-msg mono">{error}</p>}
        </div>
        <div className="build-cta-row" style={{ marginTop: 32 }}>
          <Link href="/orgs" className="build-link">← Organizations</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="world-root">
      <p className="landing-eyebrow">Organization · civilization-0</p>
      <h1 className="world-h1">{org.name}</h1>
      <p className="mono">{org.goal}</p>

      <div className="world-stat-row">
        <div className="world-stat-card">
          <span className="label">Kind</span>
          <span className="world-stat-value mono">{org.kind}</span>
        </div>
        <div className="world-stat-card">
          <span className="label">Members</span>
          <span className="world-stat-value mono">{org.members.length}</span>
        </div>
        <div className="world-stat-card">
          <span className="label">Treasury</span>
          <span className="world-stat-value mono world-accent">{org.treasury}</span>
        </div>
        <div className="world-stat-card">
          <span className="label">Reputation</span>
          <span className="world-stat-value mono">{org.reputation}</span>
        </div>
      </div>

      <section className="world-section">
        <h2 className="world-section-h2">Members</h2>
        {org.members.length === 0 ? (
          <p className="world-empty">No members yet.</p>
        ) : (
          <table className="world-table">
            <thead>
              <tr>
                <th className="world-th">Citizen</th>
                <th className="world-th">Role</th>
                <th className="world-th world-th-right">Joined</th>
              </tr>
            </thead>
            <tbody>
              {org.members.map((m) => (
                <tr key={m.citizenId} className="world-tr">
                  <td className="world-td">
                    <Link href={`/citizens/${m.citizenId}`} className="world-id-link mono">
                      {m.citizenId}
                    </Link>
                  </td>
                  <td className="world-td mono">{m.role}</td>
                  <td className="world-td world-td-right mono">{m.joinedDay}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="world-section">
        <h2 className="world-section-h2">Decisions · reasoned on 0G</h2>
        {org.decisions.length === 0 ? (
          <p className="world-empty">No decisions yet.</p>
        ) : (
          <ul className="world-event-list">
            {org.decisions.map((d) => (
              <li key={d.eventId} className="world-event-item">
                <span className="world-event-day label">Day {d.day}</span>
                <span className="world-event-type mono">{d.action}</span>
                <span>{d.reasoning}</span>
                {d.targetId && (
                  <span className="world-event-actors mono">
                    {"→ "}
                    <Link href={`/citizens/${d.targetId}`} className="world-id-link">
                      {d.targetId}
                    </Link>
                  </span>
                )}
                <ZeroGBadges rootHash={d.rootHash} verified />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="build-cta-row" style={{ marginTop: 40 }}>
        <Link href="/orgs" className="build-link">← Organizations</Link>
      </div>
    </main>
  );
}
