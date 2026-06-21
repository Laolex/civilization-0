import React from "react";
import Link from "next/link";
import { getPool } from "@civ/persistence/src/pool";
import { searchEvents, listEventTypes, readNarrative, type HistoricalEvent } from "@civ/persistence/src/read";
import { buildLifeStory } from "../../lib/lifestory";
import { LiveDot } from "../../components/LiveDot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// When an action normally takes a target but none is recorded, fall back to a
// self-contained phrase so the line never dangles ("invested in" with nothing).
function describe(type: string, hasTarget: boolean): { verb: string; withTarget: boolean } {
  const t = (withTarget: string, without: string) =>
    hasTarget ? { verb: withTarget, withTarget: true } : { verb: without, withTarget: false };
  switch (type) {
    case "invest": return t("invested in", "made an investment");
    case "partner": return t("partnered with", "formed a partnership");
    case "meet": return t("met", "met someone new");
    case "hire": return t("hired", "made a hire");
    case "start_company": return { verb: "started a company", withTarget: false };
    case "create_org": return { verb: "founded an organization", withTarget: false };
    case "work": return { verb: "put in a day's work", withTarget: false };
    case "quit_job": return { verb: "left a job", withTarget: false };
    default: return { verb: type.replace(/_/g, " "), withTarget: hasTarget };
  }
}

function linkFor(id: string): string {
  // orgs are rendered under /orgs/<id>; everything else is a citizen.
  return id.includes("-collective") || id.includes("guild") ? `/orgs/${id}` : `/citizens/${id}`;
}
const shortHash = (h: string) => (h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-4)}` : h);

export default async function HistoryPage({ searchParams }: { searchParams: { actor?: string; type?: string } }) {
  const actor = searchParams.actor?.trim() || undefined;
  const type = searchParams.type?.trim() || undefined;

  let events: HistoricalEvent[] = [];
  let types: string[] = [];
  let error: string | null = null;
  try {
    [events, types] = await Promise.all([
      searchEvents(getPool(), { actorId: actor, type, limit: 100 }),
      listEventTypes(getPool()),
    ]);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  // Per-citizen life story when a single actor is selected.
  let story: string[] | null = null;
  let narrative: Awaited<ReturnType<typeof readNarrative>> = null;
  let actorName: string | null = null;
  if (actor && !error) {
    try {
      const c = await getPool().query("SELECT name, occupation FROM citizens WHERE id = $1", [actor]);
      if (c.rows[0]) {
        actorName = c.rows[0].name;
        const lifeEvents = events.filter((e) => e.actorId === actor)
          .map((e) => ({ day: e.day, type: e.type, targetId: e.targetId, reasoning: e.reasoning }));
        story = buildLifeStory({ name: c.rows[0].name, occupation: c.rows[0].occupation, events: lifeEvents });
      }
      narrative = await readNarrative(getPool(), actor, "life_story");
    } catch { /* story is optional */ }
  }

  const filtered = !!(actor || type);

  return (
    <main className="board">
      <header className="board-head">
        <div className="board-live">
          <LiveDot />
          <span className="board-live-label mono">LIVE on 0G</span>
          <span className="board-live-cadence">every event links to its on-chain proof</span>
        </div>
        <h1 className="board-title">World history.</h1>
        <p className="board-sub">
          The full record of everything that has happened — searchable, and every event traceable
          to the <span className="ink">0G Storage</span> trace behind it.
        </p>
      </header>

      <form className="filter-bar" method="get" action="/history" role="search">
        <input
          className="field mono"
          name="actor"
          defaultValue={actor ?? ""}
          placeholder="citizen or org id — e.g. ada"
          aria-label="Filter by citizen or organization id"
        />
        <select className="field field-select mono" name="type" defaultValue={type ?? ""} aria-label="Filter by event type">
          <option value="">all event types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button type="submit" className="board-foot-cta filter-submit">Search</button>
        {filtered && <Link href="/history" className="board-foot-link mono filter-clear">clear</Link>}
      </form>

      {story && (
        <section className="panel life-panel">
          <div className="section-head">
            <h2 className="section-title">Life of {actorName ?? actor}</h2>
            <span className="section-meta mono">{actor}</span>
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
      )}

      <section className="feed">
        <div className="section-head">
          <h2 className="section-title">
            Events{actor ? ` · ${actorName ?? actor}` : ""}{type ? ` · ${type}` : ""}
          </h2>
          <span className="section-meta mono">{error ? "—" : `${events.length} record${events.length === 1 ? "" : "s"}`}</span>
        </div>

        {error ? (
          <div className="board-fault">
            <span className="board-fault-label mono">db unavailable</span>
            <code className="board-fault-msg mono">{error}</code>
          </div>
        ) : events.length === 0 ? (
          <div className="board-empty">
            <p className="board-empty-title">No events match.</p>
            <p className="board-empty-body">Clear the filter, or try another citizen or organization id.</p>
          </div>
        ) : (
          <ol className="feed-list">
            {events.map((e) => {
              const { verb, withTarget } = describe(e.type, !!e.targetId);
              return (
                <li key={e.id} className="feed-row">
                  <span className="feed-day mono">D{e.day}</span>
                  <span className="feed-line">
                    <Link href={linkFor(e.actorId)} className="feed-actor">{e.actorId}</Link>
                    <span className="feed-verb">{verb}</span>
                    {withTarget && e.targetId && (
                      <Link href={linkFor(e.targetId)} className="feed-actor">{e.targetId}</Link>
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
        <Link href="/world" className="board-foot-cta">The world</Link>
        <Link href="/map" className="board-foot-cta board-foot-cta--ghost">Living map</Link>
        <Link href="/orgs" className="board-foot-cta board-foot-cta--ghost">Organizations</Link>
        <span className="board-foot-spacer" />
        <Link href="/" className="board-foot-link mono">← Home</Link>
      </nav>
    </main>
  );
}
