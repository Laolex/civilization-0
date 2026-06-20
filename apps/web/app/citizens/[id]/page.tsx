import React from "react";
import Link from "next/link";
import { getPool } from "@civ/persistence/src/pool";
import { readCitizen, readRelationships, readGoals, readDecisionChainRaw, searchEvents, readNarrative } from "@civ/persistence/src/read";
import { toCausalChain } from "../../../lib/citizen-db";
import { buildLifeStory } from "../../../lib/lifestory";
import { CausalChain } from "../../../components/CausalChain";
import { ZeroGBadges } from "../../../components/ZeroGBadges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CitizenPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const citizen = await readCitizen(getPool(), id);
  if (!citizen) {
    return (
      <main className="world-root">
        <p className="landing-eyebrow">Citizen · civilization-0</p>
        <h1 className="world-h1">Citizen not found</h1>
        <p className="world-empty">No citizen with id <span className="mono">{id}</span>.</p>
        <div className="build-cta-row" style={{ marginTop: 24 }}>
          <Link href="/citizens/new" className="landing-cta">+ New citizen</Link>
          <Link href="/world" className="build-link">← World</Link>
        </div>
      </main>
    );
  }
  const [rels, goals, events, chainRaw, narrative] = await Promise.all([
    readRelationships(getPool(), id), readGoals(getPool(), id),
    searchEvents(getPool(), { actorId: id, limit: 50 }), readDecisionChainRaw(getPool(), id),
    readNarrative(getPool(), id, "life_story"),
  ]);
  const ownEvents = events.filter((e) => e.actorId === id);
  const story = buildLifeStory({ name: citizen.name, occupation: citizen.occupation,
    events: ownEvents.map((e) => ({ day: e.day, type: e.type, targetId: e.targetId, reasoning: e.reasoning })) });
  const chain = chainRaw ? toCausalChain(chainRaw) : null;

  return (
    <main className="world-root">
      <p className="landing-eyebrow">Citizen · civilization-0</p>
      <h1 className="world-h1">{citizen.name}</h1>
      <p className="mono" style={{ color: "#9db4e8" }}>{citizen.occupation} · age {citizen.age} · tier {citizen.tier}</p>

      <div className="world-stat-row">
        <div className="world-stat-card"><span className="label">Reputation</span><span className="world-stat-value mono">{citizen.reputation}</span></div>
        <div className="world-stat-card"><span className="label">Wealth</span><span className="world-stat-value mono">{citizen.wealth}</span></div>
        <div className="world-stat-card"><span className="label">Created day</span><span className="world-stat-value mono">{citizen.createdDay}</span></div>
      </div>

      <section className="world-section">
        <h2 className="world-section-h2">Life story</h2>
        {story.map((line, i) => <p key={i} className="world-empty" style={{ textAlign: "left", margin: "4px 0" }}>{line}</p>)}
        {narrative && (
          <div style={{ marginTop: 12 }}>
            <p className="landing-eyebrow">Narrated on 0G</p>
            <p className="mono" style={{ lineHeight: 1.6 }}>{narrative.text}</p>
            <ZeroGBadges rootHash={narrative.rootHash} verified />
          </div>
        )}
      </section>

      {chain && (
        <section className="world-section">
          <h2 className="world-section-h2">Why {citizen.name}'s latest decision happened</h2>
          <CausalChain chain={chain} />
        </section>
      )}

      <section className="world-section">
        <h2 className="world-section-h2">Goals</h2>
        {goals.length === 0 ? <p className="world-empty">No goals yet.</p> : (
          <ul className="world-event-list">
            {goals.map((g) => <li key={g.id} className="world-event-item"><span className="world-event-type mono">{g.kind}</span><span>{g.description}</span><span className="world-event-id mono">{Math.round(g.progress * 100)}%</span></li>)}
          </ul>
        )}
      </section>

      <section className="world-section">
        <h2 className="world-section-h2">Relationships</h2>
        {rels.length === 0 ? <p className="world-empty">No relationships yet.</p> : (
          <ul className="world-event-list">
            {rels.map((r) => <li key={r.otherId} className="world-event-item">
              <Link href={`/citizens/${r.otherId}`} className="world-id-link mono">{r.otherId}</Link>
              <span className="world-event-id mono">trust {r.trust.toFixed(2)} · friendship {r.friendship.toFixed(2)}</span>
            </li>)}
          </ul>
        )}
      </section>

      <section className="world-section">
        <h2 className="world-section-h2">Timeline</h2>
        {ownEvents.length === 0 ? <p className="world-empty">No events yet — wait for the scheduler to tick.</p> : (
          <ul className="world-event-list">
            {ownEvents.map((e) => <li key={e.id} className="world-event-item">
              <span className="world-event-day label">Day {e.day}</span>
              <span className="world-event-type mono">{e.type}</span>
              {e.targetId && <span className="world-event-actors mono">→ <Link href={`/citizens/${e.targetId}`} className="world-id-link">{e.targetId}</Link></span>}
              <ZeroGBadges rootHash={e.rootHash} verified />
            </li>)}
          </ul>
        )}
      </section>

      <div className="build-cta-row" style={{ marginTop: 40 }}>
        <Link href="/history" className="landing-cta">History →</Link>
        <Link href="/world" className="build-link">← World</Link>
      </div>
    </main>
  );
}
