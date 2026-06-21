import React from "react";
import Link from "next/link";
// Deep-import the LIGHT read path only (pg-only) — never pull the heavy
// engine/store/memory graph into the Next bundle.
import { getPool } from "@civ/persistence/src/pool";
import { readOrg, type OrgView } from "@civ/persistence/src/read";
import { LiveDot } from "../../../components/LiveDot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const shortHash = (h: string) => (h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-4)}` : h);

const VERB: Record<string, string> = {
  invest: "invested in", partner: "partnered with", hire: "hired",
  create_org: "founded an organization", work: "put capital to work",
};
function action(type: string, hasTarget: boolean): { verb: string; withTarget: boolean } {
  const targeted = type === "invest" || type === "partner" || type === "hire";
  if (targeted && !hasTarget) {
    const solo: Record<string, string> = { invest: "made an investment", partner: "formed a partnership", hire: "made a hire" };
    return { verb: solo[type] ?? type.replace(/_/g, " "), withTarget: false };
  }
  return { verb: VERB[type] ?? type.replace(/_/g, " "), withTarget: targeted };
}

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
      <main className="board">
        <header className="board-head">
          <h1 className="board-title">Organization not found.</h1>
          <p className="board-sub">No organization with id <span className="cz-notfound-id mono">{params.id}</span>.</p>
        </header>
        {error && (
          <div className="board-fault">
            <span className="board-fault-label mono">db unavailable</span>
            <code className="board-fault-msg mono">{error}</code>
          </div>
        )}
        <nav className="board-foot" aria-label="Navigation">
          <Link href="/orgs" className="board-foot-cta">← Organizations</Link>
        </nav>
      </main>
    );
  }

  return (
    <main className="board">
      <header className="board-head">
        <div className="board-live">
          <LiveDot />
          <span className="board-live-label mono">LIVE on 0G</span>
          <span className="board-live-cadence">reasons as an agent · founded D{org.createdDay}</span>
        </div>
        <h1 className="board-title">
          <span className="org-title-mark" aria-hidden />{org.name}
        </h1>
        <p className="cz-meta mono">
          <span className="org-kind-tag">{org.kind}</span>
          {org.goal && <span>· {org.goal}</span>}
        </p>
      </header>

      <section className="cluster cluster--three" aria-label="Organization state">
        <div className="cluster-cell">
          <span className="cluster-label">Members</span>
          <span className="cluster-value mono">{org.members.length}</span>
          <span className="cluster-foot">citizens enrolled</span>
        </div>
        <div className="cluster-cell">
          <span className="cluster-label">Treasury</span>
          <span className="cluster-value mono accent">{money(org.treasury)}</span>
          <span className="cluster-foot">moves with every decision</span>
        </div>
        <div className="cluster-cell">
          <span className="cluster-label">Reputation</span>
          <span className="cluster-value mono">{org.reputation}</span>
          <span className="cluster-foot">standing in the world</span>
        </div>
      </section>

      <section className="cz-section">
        <div className="section-head">
          <h2 className="section-title">Members</h2>
          <span className="section-meta mono">{org.members.length}</span>
        </div>
        {org.members.length === 0 ? (
          <p className="board-empty-body">No members yet.</p>
        ) : (
          <ul className="rel-list">
            {org.members.map((m) => (
              <li key={m.citizenId}>
                <div className="rel-row">
                  <Link href={`/citizens/${m.citizenId}`} className="rel-name">{m.citizenId}</Link>
                  <span className="rel-stats">
                    <span>{m.role}</span>
                    <span>joined D{m.joinedDay}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cz-section">
        <div className="section-head">
          <h2 className="section-title">Decisions</h2>
          <span className="section-meta mono">reasoned on 0G Compute</span>
        </div>
        {org.decisions.length === 0 ? (
          <div className="board-empty">
            <p className="board-empty-body">
              No decisions yet — when the scheduler next ticks, {org.name} will reason on 0G like
              any other agent, and its choices will archive to 0G Storage.
            </p>
          </div>
        ) : (
          <ol className="orgdec-list">
            {org.decisions.map((d) => {
              const { verb, withTarget } = action(d.action, !!d.targetId);
              return (
                <li key={d.eventId} className="orgdec">
                  <div className="orgdec-head">
                    <span className="feed-day mono">D{d.day}</span>
                    <span className="orgdec-line">
                      <span className="orgdec-action">{verb}</span>
                      {withTarget && d.targetId && (
                        <Link href={`/citizens/${d.targetId}`} className="feed-actor">{d.targetId}</Link>
                      )}
                    </span>
                    <span className="feed-proof">
                      {d.rootHash ? (
                        <>
                          <span className="chip chip-compute mono">0G Compute&nbsp;✓</span>
                          <Link href={`/verify/${d.rootHash}`} className="chip chip-storage mono">0G Storage&nbsp;✓</Link>
                        </>
                      ) : (
                        <span className="chip chip-pending mono">0G Storage&nbsp;· pending</span>
                      )}
                    </span>
                  </div>
                  {d.reasoning && <p className="orgdec-reason">{d.reasoning}</p>}
                  {d.rootHash && <span className="orgdec-hash mono">{shortHash(d.rootHash)}</span>}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <nav className="board-foot" aria-label="Navigation">
        <Link href="/orgs" className="board-foot-cta">← Organizations</Link>
        <Link href="/map" className="board-foot-cta board-foot-cta--ghost">◉ Living map</Link>
        <span className="board-foot-spacer" />
        <Link href="/world" className="board-foot-link mono">The world</Link>
      </nav>
    </main>
  );
}
