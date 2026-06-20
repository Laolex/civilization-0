import React from "react";
import Link from "next/link";

export const dynamic = "force-static";

// Display copy mirrors PLAN_LIMITS in @civ/persistence/src/world-write:
//   free:     { populationCap: 10,  allowPrivate: false, api: false }
//   pro:      { populationCap: 100, allowPrivate: true,  api: false }
//   research: { populationCap: 100, allowPrivate: true,  api: true  }
const PLANS = [
  {
    name: "Free",
    price: "$0",
    blurb: "Explore the public Genesis world.",
    features: [
      "Population cap: 10",
      "Public worlds only",
      "Add citizens to Genesis",
      "No provenance API",
    ],
  },
  {
    name: "Pro",
    price: "$—",
    blurb: "Run your own private worlds.",
    features: [
      "Population cap: 100",
      "Private worlds",
      "Up to 10 worlds",
      "No provenance API",
    ],
  },
  {
    name: "Research",
    price: "$—",
    blurb: "Export the 0G-reasoned decision dataset.",
    features: [
      "Population cap: 100",
      "Private worlds",
      "Up to 25 worlds",
      "Provenance API access",
    ],
  },
];

export default function PricingPage() {
  return (
    <main className="world-root">
      <p className="landing-eyebrow">Pricing · civilization-0</p>
      <h1 className="world-h1">Plans</h1>

      <div className="world-stat-row">
        {PLANS.map((plan) => (
          <div key={plan.name} className="world-stat-card">
            <span className="label">{plan.name}</span>
            <span className="world-stat-value mono">{plan.price}</span>
            <p className="world-empty">{plan.blurb}</p>
            <ul className="world-event-list">
              {plan.features.map((f) => (
                <li key={f} className="world-event-item mono">{f}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <section className="world-section">
        <h2 className="world-section-h2">Research provenance API</h2>
        <p className="world-empty">
          Research plans mint an API key that exports the real 0G-reasoned
          decision dataset — every agent decision with its memory/belief drivers,
          on-chain root hash, and verification link.
        </p>
        <p className="mono">
          curl -H &quot;Authorization: Bearer civ_…&quot; &lt;host&gt;/api/provenance/records
        </p>
      </section>

      <div className="build-cta-row" style={{ marginTop: 40 }}>
        <Link href="/signup" className="landing-cta">Get started →</Link>
        <Link href="/account" className="build-link">Account</Link>
        <Link href="/world" className="build-link">← World</Link>
      </div>
    </main>
  );
}
