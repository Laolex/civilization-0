import React from "react";
import Link from "next/link";

const SNIPPET = `import { createProvenance } from "@civ/provenance";

// Wires a real 0G Compute brain + 0G Storage.
const civ = await createProvenance();

// Wrap one agent decision — reasons on 0G Compute,
// archives the causal trace on 0G Storage.
const result = await civ.trace({
  agent: "trading-agent-01",
  question: "ETH broke resistance — long, short, or hold?",
  memories: [{ id: "m1", summary: "ETH broke $3.2k on volume", importance: 8 }],
  beliefs:  [{ id: "b1", statement: "breakouts on volume follow through", confidence: 0.7 }],
  actions: ["open_long", "open_short", "hold"],
});

result.decision;   // { action: "open_long", reasoning: "…" }
result.drivers;    // { memories: [{ id: "m1", weight: 0.8 }], … } — what drove it
result.verified;   // true — cryptographically verified on 0G Compute
result.verifyUrl;  // public, keyless link anyone can check`;

const STEPS = [
  {
    n: "1",
    t: "Reason on 0G Compute",
    d: "Your agent's decision runs through verifiable inference. The output is cryptographically attested — verified: true, not self-reported.",
  },
  {
    n: "2",
    t: "Archive on 0G Storage",
    d: "The full causal chain — the weighted memories and beliefs that actually drove the call — is written to permanent, tamper-evident storage.",
  },
  {
    n: "3",
    t: "Share a verify link",
    d: "Every decision returns a keyless verify URL. Anyone can independently replay and confirm it without trusting you, and without a private key.",
  },
];

export default function Build() {
  return (
    <main className="board">
      <header className="board-head">
        <span className="proof-kicker mono">
          <span className="proof-kicker-dot" aria-hidden /> FOR BUILDERS · @civ/provenance
        </span>
        <h1 className="board-title">Add verifiable provenance to your agent.</h1>
        <p className="board-sub">
          The causal chain you can watch on Ada isn’t a one-off — it’s a drop-in primitive. Wrap
          any agent decision in a single call: it reasons on <span className="ink">0G Compute</span>,
          archives the trace on <span className="ink">0G Storage</span>, and returns a public verify
          link. When your agent moves money or makes a high-stakes call, you can prove <em>why</em>.
        </p>
      </header>

      <pre className="lp-code mono">{SNIPPET}</pre>

      <ol className="flow-steps">
        {STEPS.map((s) => (
          <li key={s.n} className="flow-step">
            <span className="flow-step-n mono" aria-hidden>{s.n}</span>
            <div className="flow-step-body">
              <h3 className="flow-step-t">{s.t}</h3>
              <p className="flow-step-d">{s.d}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="bld-proof">
        <span className="bld-proof-label mono">
          <span className="bld-proof-dot" aria-hidden /> LIVE on 0G
        </span>
        <p className="bld-proof-text">
          <span className="mono ink">@civ/provenance</span> runs on 0G today — a real{" "}
          <span className="mono">civ.trace()</span> reasoned on 0G Compute
          (<span className="mono">verified: true</span>) and archived to 0G Storage, then recovered
          keyless.{" "}
          <Link
            href="/verify/0x44c3cc043b61b93254b754ac616693110ed621b8824dc715c1a27a5cda500f6a"
            className="bld-proof-link mono"
          >
            verify it yourself →
          </Link>
        </p>
      </div>

      <nav className="board-foot" aria-label="Navigation">
        <Link href="/citizens/ada" className="board-foot-cta">See it run on Ada</Link>
        <Link href="/verify/0x44c3cc043b61b93254b754ac616693110ed621b8824dc715c1a27a5cda500f6a" className="board-foot-cta board-foot-cta--ghost">Verify a decision</Link>
        <span className="board-foot-spacer" />
        <Link href="/" className="board-foot-link mono">← Home</Link>
      </nav>
    </main>
  );
}
