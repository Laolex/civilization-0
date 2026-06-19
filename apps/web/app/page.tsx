import React from "react";
import Link from "next/link";

export default function Landing() {
  return (
    <main className="landing-root">
      <p className="landing-eyebrow">Civilization-0 · Explainability Layer</p>
      <h1 className="landing-h1">Every decision,<br />on the record.</h1>
      <p className="landing-sub">
        A society whose citizens think on 0G Compute and whose history lives
        on 0G Storage. Every causal chain is archived, verifiable, and
        traceable — down to the memory that triggered the belief that drove the
        decision.
      </p>
      <Link href="/citizens/ada" className="landing-cta">
        Enter Civilization →
      </Link>
    </main>
  );
}
