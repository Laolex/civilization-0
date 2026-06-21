import React from "react";
import Link from "next/link";
import { getPool } from "@civ/persistence/src/pool";
import { readCitizen, readRelationships, readGoals, readDecisionChainRaw, searchEvents, readNarrative } from "@civ/persistence/src/read";
import { toCausalChain } from "../../../lib/citizen-db";
import { buildLifeStory } from "../../../lib/lifestory";
import { CausalChain } from "../../../components/CausalChain";
import { LiveDot } from "../../../components/LiveDot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const shortHash = (h: string) => (h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-4)}` : h);

const VERB: Record<string, string> = {
  invest: "invested in", partner: "partnered with", meet: "met", hire: "hired",
  start_company: "started a company", create_org: "founded an organization",
  work: "put in a day's work", quit_job: "left a job",
};
function describe(type: string, hasTarget: boolean): { verb: string; withTarget: boolean } {
  const targeted = type === "invest" || type === "partner" || type === "meet" || type === "hire";
  if (targeted && !hasTarget) {
    const solo: Record<string, string> = { invest: "made an investment", partner: "formed a partnership", meet: "met someone new", hire: "made a hire" };
    return { verb: solo[type] ?? type.replace(/_/g, " "), withTarget: false };
  }
  return { verb: VERB[type] ?? type.replace(/_/g, " "), withTarget: targeted };
}

export default async function CitizenPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const citizen = await readCitizen(getPool(), id);
  if (!citizen) {
    return (
      <main className="board">
        <header className="board-head">
          <h1 className="board-title">Citizen not found.</h1>
          <p className="board-sub">No citizen with id <span className="cz-notfound-id mono">{id}</span> lives in this world.</p>
        </header>
        <nav className="board-foot" aria-label="Navigation">
          <Link href="/citizens/new" className="board-foot-cta">+ New citizen</Link>
          <Link href="/world" className="board-foot-cta board-foot-cta--ghost">The world</Link>
          <span className="board-foot-spacer" />
          <Link href="/" className="board-foot-link mono">← Home</Link>
        </nav>
      </main>
    );
  }

  const [rels, goals, events, chainRaw, narrative] = await Promise.all([
    readRelationships(getPool(), id), readGoals(getPool(), id),
    searchEvents(getPool(), { actorId: id, limit: 50 }), readDecisionChainRaw(getPool(), id),
    readNarrative(getPool(), id, "life_story"),
  ]);
  const ownEvents = events.filter((e) => e.actorId === id);
  const story = buildLifeStory({
    name: citizen.name, occupation: citizen.occupation,
    events: ownEvents.map((e) => ({ day: e.day, type: e.type, targetId: e.targetId, reasoning: e.reasoning })),
  });
  const chain = chainRaw ? toCausalChain(chainRaw) : null;

  return (
    <main className="board">
      <header className="board-head">
        <div className="board-live">
          <LiveDot />
          <span className="board-live-label mono">LIVE on 0G</span>
          <span className="board-live-cadence">tier {citizen.tier} · reasons on 0G Compute</span>
        </div>
        <h1 className="board-title">{citizen.name}</h1>
        <p className="cz-meta mono">
          <span>{citizen.occupation}</span>
          <span>· age {citizen.age}</span>
          <span className="cz-meta-tier">· tier {citizen.tier}</span>
        </p>
      </header>

      <section className="cluster cluster--three" aria-label="Citizen state">
        <div className="cluster-cell">
          <span className="cluster-label">Reputation</span>
          <span className="cluster-value mono">{citizen.reputation}</span>
          <span className="cluster-foot">standing in the world</span>
        </div>
        <div className="cluster-cell">
          <span className="cluster-label">Wealth</span>
          <span className="cluster-value mono">{money(citizen.wealth)}</span>
          <span className="cluster-foot">moves with every decision</span>
        </div>
        <div className="cluster-cell">
          <span className="cluster-label">Born</span>
          <span className="cluster-value mono">D{citizen.createdDay}</span>
          <span className="cluster-foot">since genesis</span>
        </div>
      </section>

      <section className="cz-section panel">
        <div className="section-head">
          <h2 className="section-title">Life story</h2>
          <span className="section-meta mono">{ownEvents.length} event{ownEvents.length === 1 ? "" : "s"}</span>
        </div>
        <div className="life-lines">
          {story.map((line, i) => <p key={i} className="life-line">{line}</p>)}
        </div>
        {narrative && (
          <div className="life-narrative">
            <span className="life-narrative-label mono">
              <span className="life-narrative-dot" aria-hidden /> Narrated on 0G Compute
            </span>
            <p className="life-narrative-text">{narrative.text}</p>
            {narrative.rootHash && (
              <Link href={`/verify/${narrative.rootHash}`} className="chip chip-storage mono life-narrative-verify">
                0G Storage&nbsp;✓ · {shortHash(narrative.rootHash)}
              </Link>
            )}
          </div>
        )}
      </section>

      {chain && (
        <section className="cz-section">
          <div className="section-head">
            <h2 className="section-title">Why {citizen.name}’s latest decision happened</h2>
            <span className="section-meta mono">Memory → Belief → 0G Compute → 0G Storage</span>
          </div>
          <CausalChain chain={chain} />
        </section>
      )}

      <section className="cz-section">
        <div className="section-head"><h2 className="section-title">Goals</h2></div>
        {goals.length === 0 ? (
          <p className="board-empty-body">No goals yet.</p>
        ) : (
          <ul className="goal-list">
            {goals.map((g) => {
              const pct = Math.max(0, Math.min(100, Math.round(g.progress * 100)));
              return (
                <li key={g.id} className="goal-row">
                  <span className="goal-kind">{g.kind}</span>
                  <span className="goal-desc" title={g.description}>{g.description}</span>
                  <span className="goal-bar" aria-hidden>
                    <span className={`goal-bar-fill${pct >= 100 ? " goal-bar-fill--done" : ""}`} style={{ width: `${pct}%` }} />
                  </span>
                  <span className="goal-pct">{pct}%</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="cz-section">
        <div className="section-head"><h2 className="section-title">Relationships</h2></div>
        {rels.length === 0 ? (
          <p className="board-empty-body">No relationships yet.</p>
        ) : (
          <ul className="rel-list">
            {rels.map((r) => (
              <li key={r.otherId}>
                <div className="rel-row">
                  <Link href={`/citizens/${r.otherId}`} className="rel-name">{r.otherId}</Link>
                  <span className="rel-stats">
                    <span>trust {r.trust.toFixed(2)}</span>
                    <span>friendship {r.friendship.toFixed(2)}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cz-section feed">
        <div className="section-head">
          <h2 className="section-title">Timeline</h2>
          <span className="section-meta mono">newest first</span>
        </div>
        {ownEvents.length === 0 ? (
          <div className="board-empty">
            <p className="board-empty-body">No events yet — they’ll appear when the scheduler next ticks the world on 0G.</p>
          </div>
        ) : (
          <ol className="feed-list">
            {ownEvents.map((e) => {
              const { verb, withTarget } = describe(e.type, !!e.targetId);
              return (
                <li key={e.id} className="feed-row">
                  <span className="feed-day mono">D{e.day}</span>
                  <span className="feed-line">
                    <span className="feed-verb">{verb}</span>
                    {withTarget && e.targetId && (
                      <Link href={`/citizens/${e.targetId}`} className="feed-actor">{e.targetId}</Link>
                    )}
                  </span>
                  <span className="feed-proof">
                    {e.rootHash ? (
                      <>
                        <span className="chip chip-compute mono">0G Compute&nbsp;✓</span>
                        <Link href={`/verify/${e.rootHash}`} className="chip chip-storage mono">0G Storage&nbsp;✓</Link>
                      </>
                    ) : (
                      <span className="chip chip-pending mono">0G Storage&nbsp;· pending</span>
                    )}
                  </span>
                  <span className="feed-hash mono" title={e.rootHash ?? e.id}>
                    {e.rootHash ? shortHash(e.rootHash) : e.id}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <nav className="board-foot" aria-label="Navigation">
        <Link href="/map" className="board-foot-cta">◉ Living map</Link>
        <Link href="/history" className="board-foot-cta board-foot-cta--ghost">History</Link>
        <span className="board-foot-spacer" />
        <Link href="/world" className="board-foot-link mono">← The world</Link>
      </nav>
    </main>
  );
}
