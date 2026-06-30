import React from "react";
import Link from "next/link";
// Deep-import the LIGHT read path only (pg-only) — never pull the engine/store
// graph (@civ/engine, @civ/store, @civ/memory) into the Next bundle.
import { getPool } from "@civ/persistence/src/pool";
import {
  readWorldView,
  readProofStats,
  readOrgList,
  readWorld,
  type WorldView,
  type ProofStats,
} from "@civ/persistence/src/read";
import { canIntervene } from "@civ/persistence/src/intervention-authz";
import { getCurrentUser } from "../../lib/auth";
import { topCitizens, recent, population } from "../../lib/dashboard";
import { LiveDot } from "../../components/LiveDot";
import { WorldEventBox } from "../../components/WorldEventBox";
import { AdvanceWorldButton } from "../../components/AdvanceWorldButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FEED_LIMIT = 18;

type OrgRow = Awaited<ReturnType<typeof readOrgList>>[number];

/**
 * Humanize an event into a verb phrase. When the action normally takes a target
 * but none is recorded, fall back to a self-contained phrase so the line never
 * dangles ("invested in" with nothing after it).
 */
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

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const shortHash = (h: string) => (h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-4)}` : h);

export default async function WorldPage() {
  let view: WorldView | null = null;
  let proof: ProofStats | null = null;
  let orgs: OrgRow[] = [];
  let error: string | null = null;

  try {
    const pool = getPool();
    [view, proof, orgs] = await Promise.all([
      readWorldView(pool, FEED_LIMIT),
      readProofStats(pool).catch(() => null),
      readOrgList(pool).catch(() => [] as OrgRow[]),
    ]);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  // ── Error state: the world can't be reached. Honest, not decorative. ──────
  if (!view) {
    return (
      <main className="board">
        <header className="board-head">
          <div className="board-live board-live--down">
            <span className="live-dot live-dot--down" aria-hidden />
            <span className="board-live-label mono">NO SIGNAL</span>
          </div>
          <h1 className="board-title">The world is out of reach.</h1>
          <p className="board-sub">
            The dashboard reads its state from Postgres, keyless. That connection failed —
            the autonomous world itself keeps ticking on 0G regardless.
          </p>
        </header>
        <div className="board-fault">
          <span className="board-fault-label mono">db unavailable</span>
          {error && <code className="board-fault-msg mono">{error}</code>}
        </div>
        <BoardFooter />
      </main>
    );
  }

  let showWorldEvent = false;
  try {
    const viewer = await getCurrentUser();
    if (viewer) {
      const gw = await readWorld(getPool(), "genesis");
      if (gw) showWorldEvent = canIntervene({ id: viewer.id, plan: viewer.plan }, { id: gw.id, ownerId: gw.ownerId });
    }
  } catch { showWorldEvent = false; }

  const nameOf = new Map(view.citizens.map((c) => [c.id, c.name] as const));
  const isCitizen = (id: string) => nameOf.has(id);
  const label = (id: string) => nameOf.get(id) ?? id;

  const citizens = topCitizens(view, 12) as WorldView["citizens"];
  const events = recent(view, FEED_LIMIT);
  const pop = population(view);
  const verified = proof?.verifiedDecisions ?? 0;
  const archived = proof?.archivedTraces ?? 0;
  const latestRoot = proof?.latestRootHash ?? null;

  const seeded = pop > 0;
  const hasReasoned = events.length > 0;

  return (
    <main className="board">
      {/* ── Live header: assert autonomy, set the cinematic tone ─────────── */}
      <header className="board-head">
        <div className="board-live">
          <LiveDot />
          <span className="board-live-label mono">LIVE on 0G</span>
          <span className="board-live-cadence">advances itself every 2h · testnet 16602</span>
        </div>
        <h1 className="board-title">The world is running itself.</h1>
        <p className="board-sub">
          An autonomous AI society on 0G. Every decision below was reasoned on{" "}
          <span className="ink">0G Compute</span> and its causal chain archived to{" "}
          <span className="ink">0G Storage</span> — recover and verify any of them yourself,
          with no key and no trust in us.
        </p>
      </header>

      {showWorldEvent && <AdvanceWorldButton worldId="genesis" />}
      {showWorldEvent && <WorldEventBox worldId="genesis" />}

      {/* ── Instrument cluster: proof density, one panel divided into cells ── */}
      <section className="cluster" aria-label="World state and proof density">
        <div className="cluster-cell">
          <span className="cluster-label">Day</span>
          <span className="cluster-value mono">{view.day}</span>
          <span className="cluster-foot">since genesis</span>
        </div>
        <div className="cluster-cell">
          <span className="cluster-label">Population</span>
          <span className="cluster-value mono">{pop}</span>
          <span className="cluster-foot">{orgs.length} org{orgs.length === 1 ? "" : "s"} reasoning as agents</span>
        </div>
        <div className="cluster-cell cluster-cell--proof">
          <span className="cluster-label">Reasoned + verified</span>
          <span className="cluster-value mono accent">{verified}</span>
          <span className="cluster-foot">decisions on 0G Compute, <span className="ok">TEE&nbsp;✓</span></span>
        </div>
        <div className="cluster-cell cluster-cell--proof">
          <span className="cluster-label">Archived</span>
          <span className="cluster-value mono accent">{archived}</span>
          <span className="cluster-foot">traces on 0G Storage, recoverable</span>
        </div>
        {latestRoot && (
          <Link href={`/verify/${latestRoot}`} className="cluster-verify">
            <span className="cluster-verify-label mono">Verify the latest decision</span>
            <span className="cluster-verify-hash mono">{shortHash(latestRoot)}</span>
            <span className="cluster-verify-go" aria-hidden>→</span>
          </Link>
        )}
      </section>

      {/* ── The reasoning feed: watch the world think ───────────────────── */}
      <section className="feed">
        <div className="section-head">
          <h2 className="section-title">Live reasoning</h2>
          <span className="section-meta mono">newest first</span>
        </div>

        {!hasReasoned ? (
          <div className="board-empty">
            <p className="board-empty-title">The world is seeded but hasn't reasoned yet.</p>
            <p className="board-empty-body">
              The scheduler ticks it on 0G every two hours. The first decisions will appear
              here — each one reasoned on 0G Compute and archived to 0G Storage.
            </p>
          </div>
        ) : (
          <ol className="feed-list">
            {events.map((e) => {
              const { verb, withTarget } = describe(e.type, isCitizen(e.targetId ?? "") || !!e.targetId);
              return (
                <li key={e.id} className="feed-row">
                  <span className="feed-day mono">D{e.day}</span>

                  <span className="feed-line">
                    {isCitizen(e.actorId) ? (
                      <Link href={`/citizens/${e.actorId}`} className="feed-actor">{label(e.actorId)}</Link>
                    ) : (
                      <span className="feed-actor feed-actor--ext">{label(e.actorId)}</span>
                    )}
                    <span className="feed-verb">{verb}</span>
                    {withTarget && e.targetId && (
                      isCitizen(e.targetId) ? (
                        <Link href={`/citizens/${e.targetId}`} className="feed-actor">{label(e.targetId)}</Link>
                      ) : (
                        <span className="feed-actor feed-actor--ext">{label(e.targetId)}</span>
                      )
                    )}
                  </span>

                  <span className="feed-proof">
                    {e.rootHash ? (
                      <>
                        <span className="chip chip-compute mono">0G Compute&nbsp;✓</span>
                        <Link href={`/verify/${e.rootHash}`} className="chip chip-storage mono">
                          0G Storage&nbsp;✓
                        </Link>
                      </>
                    ) : (
                      <span className="chip chip-pending mono" title="No archived trace for this event yet">
                        0G Storage&nbsp;· pending
                      </span>
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

        <Link href="/history" className="feed-more mono">Full history →</Link>
      </section>

      {/* ── Inhabitants: a living roster, not a flat table ──────────────── */}
      <section className="dwellers">
        <div className="dwellers-grid">
          <div className="panel roster-panel">
            <div className="section-head">
              <h2 className="section-title">Citizens</h2>
              <span className="section-meta mono">by reputation</span>
            </div>
            {!seeded ? (
              <p className="board-empty-body">No citizens yet.</p>
            ) : (
              <ol className="roster">
                {citizens.map((c) => (
                  <li key={c.id} className="roster-row">
                    <span className={`tier-dot tier-${c.tier}`} aria-hidden />
                    <Link href={`/citizens/${c.id}`} className="roster-name">{c.name}</Link>
                    <span className="roster-occ">{c.occupation}</span>
                    <span className="roster-rep mono" title="reputation">{c.reputation}</span>
                    <span className="roster-wealth mono">{money(c.wealth ?? 0)}</span>
                  </li>
                ))}
              </ol>
            )}
            <div className="roster-legend mono" aria-hidden>
              <span><span className="tier-dot tier-1" /> tier 1</span>
              <span><span className="tier-dot tier-2" /> tier 2</span>
              <span><span className="tier-dot tier-3" /> tier 3</span>
            </div>
          </div>

          <div className="panel orgs-panel">
            <div className="section-head">
              <h2 className="section-title">Organizations</h2>
              <span className="section-meta mono">reason as agents</span>
            </div>
            {orgs.length === 0 ? (
              <p className="board-empty-body">No organizations yet. Citizens found them as the world runs.</p>
            ) : (
              <ol className="orgs-list">
                {orgs.map((o) => (
                  <li key={o.id} className="orgs-row">
                    <span className="orgs-mark" aria-hidden />
                    <div className="orgs-main">
                      <Link href={`/orgs/${o.id}`} className="orgs-name">{o.name}</Link>
                      <span className="orgs-kind mono">{o.kind}</span>
                    </div>
                    <div className="orgs-stats mono">
                      <span title="treasury">{money(o.treasury)}</span>
                      <span className="orgs-members">{o.memberCount} member{o.memberCount === 1 ? "" : "s"}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <p className="orgs-note">
              Organizations are projected into a persona and reason through the same 0G brain
              as citizens — their decisions archive to 0G Storage identically.
            </p>
          </div>
        </div>
      </section>

      <BoardFooter />
    </main>
  );
}

function BoardFooter() {
  return (
    <nav className="board-foot" aria-label="World navigation">
      <Link href="/map" className="board-foot-cta">◉ Living map</Link>
      <Link href="/history" className="board-foot-cta">History</Link>
      <Link href="/orgs" className="board-foot-cta">Organizations</Link>
      <Link href="/citizens/new" className="board-foot-cta board-foot-cta--ghost">+ New citizen</Link>
      <span className="board-foot-spacer" />
      <Link href="/" className="board-foot-link mono">← Home</Link>
      <Link href="/pricing" className="board-foot-link mono">Pricing</Link>
    </nav>
  );
}
