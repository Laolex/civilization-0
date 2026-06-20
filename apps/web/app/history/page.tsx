import React from "react";
import Link from "next/link";
import { getPool } from "@civ/persistence/src/pool";
import { searchEvents, listEventTypes, readNarrative, type HistoricalEvent } from "@civ/persistence/src/read";
import { buildLifeStory } from "../../lib/lifestory";
import { ZeroGBadges } from "../../components/ZeroGBadges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function linkFor(id: string): string {
  // orgs are rendered under /orgs/<id>; everything else is a citizen.
  return id.includes("-collective") || id.includes("guild") ? `/orgs/${id}` : `/citizens/${id}`;
}

export default async function HistoryPage({ searchParams }: { searchParams: { actor?: string; type?: string } }) {
  const actor = searchParams.actor?.trim() || undefined;
  const type = searchParams.type?.trim() || undefined;

  let events: HistoricalEvent[] = [];
  let types: string[] = [];
  let error: string | null = null;
  try {
    [events, types] = await Promise.all([searchEvents(getPool(), { actorId: actor, type, limit: 100 }), listEventTypes(getPool())]);
  } catch (err) { error = err instanceof Error ? err.message : String(err); }

  // Per-citizen life story when a single actor is selected.
  let story: string[] | null = null;
  let narrative: Awaited<ReturnType<typeof readNarrative>> = null;
  if (actor && !error) {
    try {
      const c = await getPool().query("SELECT name, occupation FROM citizens WHERE id = $1", [actor]);
      if (c.rows[0]) {
        const lifeEvents = events.filter((e) => e.actorId === actor)
          .map((e) => ({ day: e.day, type: e.type, targetId: e.targetId, reasoning: e.reasoning }));
        story = buildLifeStory({ name: c.rows[0].name, occupation: c.rows[0].occupation, events: lifeEvents });
      }
      narrative = await readNarrative(getPool(), actor, "life_story");
    } catch { /* story is optional */ }
  }

  return (
    <main className="world-root">
      <p className="landing-eyebrow">History Explorer · civilization-0</p>
      <h1 className="world-h1">World History</h1>

      <form className="world-stat-row" method="get" action="/history" style={{ flexWrap: "wrap", gap: 12 }}>
        <input className="mono" name="actor" defaultValue={actor ?? ""} placeholder="citizen or org id (e.g. ada)"
          style={{ padding: "8px 10px", background: "#0d1424", border: "1px solid #2b3a5c", borderRadius: 6, color: "#cdd9f5", minWidth: 220 }} />
        <select className="mono" name="type" defaultValue={type ?? ""}
          style={{ padding: "8px 10px", background: "#0d1424", border: "1px solid #2b3a5c", borderRadius: 6, color: "#cdd9f5" }}>
          <option value="">all types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button type="submit" className="landing-cta">Search</button>
        {(actor || type) && <Link href="/history" className="build-link">clear</Link>}
      </form>

      {story && (
        <section className="world-section">
          <h2 className="world-section-h2">Life of {actor}</h2>
          {story.map((line, i) => <p key={i} className="world-empty" style={{ textAlign: "left", margin: "4px 0" }}>{line}</p>)}
          {narrative && (
            <div style={{ marginTop: 12 }}>
              <p className="landing-eyebrow">Narrated on 0G</p>
              <p className="mono" style={{ lineHeight: 1.6 }}>{narrative.text}</p>
              <ZeroGBadges rootHash={narrative.rootHash} verified />
            </div>
          )}
        </section>
      )}

      <section className="world-section">
        <h2 className="world-section-h2">Events{actor ? ` involving ${actor}` : ""}{type ? ` · ${type}` : ""}</h2>
        {error ? (
          <div className="world-error-panel"><p className="world-error-msg mono">{error}</p></div>
        ) : events.length === 0 ? (
          <p className="world-empty">No events match.</p>
        ) : (
          <ul className="world-event-list">
            {events.map((e) => (
              <li key={e.id} className="world-event-item">
                <span className="world-event-day label">Day {e.day}</span>
                <span className="world-event-type mono">{e.type}</span>
                <span className="world-event-actors mono">
                  <Link href={linkFor(e.actorId)} className="world-id-link">{e.actorId}</Link>
                  {e.targetId && <>{" → "}<Link href={linkFor(e.targetId)} className="world-id-link">{e.targetId}</Link></>}
                </span>
                <ZeroGBadges rootHash={e.rootHash} verified />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="build-cta-row" style={{ marginTop: 40 }}>
        <Link href="/world" className="build-link">← World</Link>
      </div>
    </main>
  );
}
