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
    n: "01",
    t: "Reason on 0G Compute",
    d: "Your agent's decision runs through verifiable inference. The output is cryptographically verified — verified: true, not self-attested.",
  },
  {
    n: "02",
    t: "Archive on 0G Storage",
    d: "The full causal chain — the weighted memories and beliefs that actually drove the call — is written to permanent, tamper-evident storage.",
  },
  {
    n: "03",
    t: "Share a verify link",
    d: "Every decision returns a keyless verify URL. Anyone can independently replay and confirm it without trusting you, and without a private key.",
  },
];

export default function Build() {
  return (
    <main className="build-root">
      <p className="landing-eyebrow">For builders · @civ/provenance</p>
      <h1 className="build-h1">Add verifiable provenance to your agent.</h1>
      <p className="build-sub">
        The causal chain you just watched on Ada isn&apos;t a one-off — it&apos;s a
        drop-in primitive. Wrap any agent decision in a single call: it reasons
        on 0G Compute, archives the trace on 0G Storage, and returns a public
        verify link. When your agent moves money or makes a high-stakes call,
        you can prove <em>why</em>.
      </p>

      <pre className="build-snippet mono">{SNIPPET}</pre>

      <ol className="build-steps">
        {STEPS.map((s) => (
          <li key={s.n} className="build-step">
            <span className="build-step-n mono">{s.n}</span>
            <div>
              <h3 className="build-step-t">{s.t}</h3>
              <p className="build-step-d">{s.d}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="build-foot">
        Status: <span className="mono">@civ/provenance</span> runs live on 0G
        today — a real <span className="mono">civ.trace()</span> reasoned on 0G
        Compute (<span className="mono">verified: true</span>) and archived to 0G
        Storage, then recovered keyless —{" "}
        <Link
          href="/verify/0x44c3cc043b61b93254b754ac616693110ed621b8824dc715c1a27a5cda500f6a"
          className="build-link mono"
        >
          verify it yourself ↗
        </Link>
        . Same path the <Link href="/citizens/ada" className="build-link">Ada demo</Link> proves
        in your browser. Spec: <span className="mono">docs/SDK_SPEC.md</span>.
      </p>

      <div className="build-cta-row">
        <Link href="/citizens/ada" className="landing-cta">
          See it run on Ada →
        </Link>
        <Link href="/" className="build-link">
          ← Home
        </Link>
      </div>
    </main>
  );
}
