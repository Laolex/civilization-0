import React from "react";
import Link from "next/link";

export default function Landing() {
  return (
    <main className="landing-root">
      <p className="landing-eyebrow">Civilization-0 · Verifiable provenance for agentic AI</p>
      <h1 className="landing-h1">Prove why the AI<br />decided.</h1>
      <p className="landing-sub">
        Autonomous agents make calls no one can audit. Civilization-0 is the
        provenance layer for agentic AI on 0G: every decision is reasoned on 0G
        Compute, and its full causal chain — the memory that shaped the belief
        that drove the decision — lives on 0G Storage, verifiable by anyone,
        replayable forever. We prove it with a living society whose citizens
        think on 0G Compute and whose history lives on 0G Storage.
      </p>
      <div className="landing-cta-row">
        <Link href="/world" className="landing-cta">
          Enter the world →
        </Link>
        <Link href="/build" className="landing-cta-secondary">
          Add provenance to your agent →
        </Link>
      </div>
      <div className="build-cta-row" style={{ marginTop: 28, flexWrap: "wrap", gap: 14 }}>
        <Link href="/citizens/ada" className="build-link">Ada's story</Link>
        <Link href="/orgs" className="build-link">Organizations</Link>
        <Link href="/history" className="build-link">History</Link>
        <Link href="/worlds" className="build-link">Worlds</Link>
        <Link href="/pricing" className="build-link">Pricing</Link>
        <Link href="/login" className="build-link">Sign in</Link>
      </div>
    </main>
  );
}
