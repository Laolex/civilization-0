import React from "react";
import Link from "next/link";
import { getPool } from "@civ/persistence/src/pool";
import {
  readProofStats,
  readWorldView,
  readOrgList,
  type ProofStats,
} from "@civ/persistence/src/read";
import { LiveDot } from "../components/LiveDot";
import { HeroField } from "../components/HeroField";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERB: Record<string, string> = {
  invest: "invested",
  start_company: "started a company",
  create_org: "founded an organization",
  work: "put in a day's work",
  meet: "met someone",
  quit_job: "left a job",
  partner: "formed a partnership",
};

export default async function Landing() {
  let stats: ProofStats | null = null;
  let citizens: { id: string; name: string; tier: number }[] = [];
  let orgs: { id: string; name: string }[] = [];
  let latest: { actor: string; verb: string; rootHash: string } | null = null;

  try {
    const pool = getPool();
    const [s, view, orgList] = await Promise.all([
      readProofStats(pool).catch(() => null),
      readWorldView(pool, 12).catch(() => null),
      readOrgList(pool).catch(() => []),
    ]);
    stats = s;
    if (view) {
      citizens = view.citizens.map((c) => ({ id: c.id, name: c.name, tier: c.tier }));
      const nameOf = new Map(view.citizens.map((c) => [c.id, c.name] as const));
      const ev = view.recentEvents.find((e) => e.rootHash);
      if (ev) {
        latest = {
          actor: nameOf.get(ev.actorId) ?? ev.actorId,
          verb: VERB[ev.type] ?? ev.type.replace(/_/g, " "),
          rootHash: ev.rootHash as string,
        };
      }
    }
    orgs = orgList.map((o) => ({ id: o.id, name: o.name }));
  } catch {
    /* DB down — the hero still renders the static pitch, just without live proof. */
  }

  const shortHash = (h: string) => `${h.slice(0, 8)}…${h.slice(-4)}`;

  return (
    <main className="lp">
      {/* ── Hero: the living world, drifting behind the claim ───────────── */}
      <section className="lp-hero">
        <HeroField citizens={citizens} orgs={orgs} />
        <div className="lp-hero-scrim" aria-hidden />

        <div className="lp-hero-inner">
          <span className="lp-kicker mono">
            <LiveDot />
            <span className="lp-kicker-text">LIVE on 0G{stats ? ` · Day ${stats.day}` : ""}</span>
          </span>

          <h1 className="lp-h1">Prove why the<br />AI decided.</h1>

          <p className="lp-sub">
            Autonomous agents make calls no one can audit. Civilization-0 is the provenance
            layer for agentic AI on 0G — every decision is reasoned on 0G Compute, and the full
            causal chain that drove it lives on 0G Storage, verifiable by anyone, forever. We
            prove it with a society whose citizens think on 0G — and run themselves.
          </p>

          <div className="lp-cta-row">
            <Link href="/map" className="lp-cta-primary">Enter the living world →</Link>
            <Link href="/build" className="lp-cta-ghost">Add provenance to your agent →</Link>
          </div>

          {stats && (
            <div className="lp-proof mono">
              <span className="lp-proof-stat"><b>{stats.verifiedDecisions}</b> reasoned + verified on 0G Compute</span>
              <span className="lp-proof-dot" aria-hidden>·</span>
              <span className="lp-proof-stat"><b>{stats.archivedTraces}</b> traces archived on 0G Storage</span>
            </div>
          )}

          {latest && (
            <Link href={`/verify/${latest.rootHash}`} className="lp-evidence">
              <span className="lp-evidence-head">
                <span className="lp-evidence-label">Latest decision · live</span>
                <span className="chip chip-compute mono">0G Compute&nbsp;✓</span>
              </span>
              <span className="lp-evidence-line">
                <b>{latest.actor}</b> {latest.verb}
              </span>
              <span className="lp-evidence-foot mono">
                <span>{shortHash(latest.rootHash)}</span>
                <span className="lp-evidence-verify">recover &amp; verify →</span>
              </span>
            </Link>
          )}
        </div>
      </section>

      {/* ── The moat, in one API call ──────────────────────────────────── */}
      <section className="lp-section">
        <div className="lp-section-head">
          <h2 className="lp-h2">The whole idea in one call.</h2>
          <p className="lp-section-sub">
            Wrap any agent’s decision. It reasons on 0G Compute, records the brain-weighted
            inputs that <span className="ink">actually drove</span> the choice, archives the trace
            to 0G Storage, and hands back a public link anyone can check.
          </p>
        </div>
        <pre className="lp-code mono">{`import { createProvenance } from "@civ/provenance";

const civ = createProvenance();          // wraps 0G Compute + 0G Storage

const result = await civ.trace({
  agent: "trading-agent-01",
  question: "ETH broke resistance — long, short, or hold?",
  memories: [{ id: "m1", summary: "ETH broke $3.2k on volume", importance: 8 }],
  beliefs:  [{ id: "b1", statement: "breakouts on volume follow through" }],
  actions:  ["open_long", "open_short", "hold"],
});

result.decision;   // { action: "open_long", reasoning: "…" }  ← on 0G Compute
result.drivers;    // what ACTUALLY drove it — the brain-weighted subset
result.verified;   // true  — TEE-verified on 0G Compute
result.verifyUrl;  // /verify/0x…  — keyless, anyone can check`}</pre>
        <p className="lp-code-note">
          <code className="mono">drivers</code> is the moat: not everything retrieved — the
          weighted subset the decision hinged on, recorded and made verifiable.
        </p>
      </section>

      {/* ── Don't trust us — check ─────────────────────────────────────── */}
      <section className="lp-section">
        <div className="lp-section-head">
          <h2 className="lp-h2">Don’t trust us. Check.</h2>
          <p className="lp-section-sub">Three ways to confirm it’s real, none of which require trusting the operator.</p>
        </div>
        <div className="lp-checks">
          <Link href="/world" className="lp-check">
            <span className="lp-check-verb mono">watch</span>
            <span className="lp-check-title">The world, live</span>
            <span className="lp-check-body">A self-running society on 0G testnet — day, population, and a stream of decisions, each tagged with its 0G proof.</span>
          </Link>
          <Link href="/citizens/ada" className="lp-check">
            <span className="lp-check-verb mono">inspect</span>
            <span className="lp-check-title">A causal chain</span>
            <span className="lp-check-body">Open any citizen and walk the chain — Memory → Belief → 0G Compute → Decision → 0G Storage — behind their latest move.</span>
          </Link>
          <Link href={latest ? `/verify/${latest.rootHash}` : "/world"} className="lp-check">
            <span className="lp-check-verb mono">verify</span>
            <span className="lp-check-title">A decision, keyless</span>
            <span className="lp-check-body">Recover any record from 0G Storage by its root hash alone — no key, no trust in us — and read the verified reasoning.</span>
          </Link>
        </div>
      </section>

      {/* ── Thesis ─────────────────────────────────────────────────────── */}
      <section className="lp-section lp-thesis">
        <p className="lp-thesis-text">
          As agents get more autonomous, “trust our logs” stops being good enough — where
          decisions are adversarial, on-chain, or regulated, reasoning has to be{" "}
          <span className="ink">independently verifiable by anyone, forever</span>. The civilization
          is the proof. The verifiable provenance layer is the product.
        </p>
        <div className="lp-cta-row">
          <Link href="/build" className="lp-cta-primary">Add provenance to your agent →</Link>
          <Link href="/world" className="lp-cta-ghost">See the world →</Link>
        </div>
      </section>
    </main>
  );
}
