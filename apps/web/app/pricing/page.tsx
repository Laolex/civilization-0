import React from "react";
import Link from "next/link";

export const dynamic = "force-static";

// Display copy mirrors PLAN_LIMITS in @civ/persistence/src/world-write:
//   free:     { populationCap: 10,  allowPrivate: false, api: false }
//   pro:      { populationCap: 100, allowPrivate: true,  api: false }
//   research: { populationCap: 100, allowPrivate: true,  api: true  }
type Feature = { label: string; on: boolean };
type Plan = { name: string; price: string; blurb: string; badge?: string; featured?: boolean; features: Feature[] };

const PLANS: Plan[] = [
  {
    name: "Free",
    price: "$0",
    blurb: "Explore the public Genesis world.",
    features: [
      { label: "Population cap: 10", on: true },
      { label: "Add citizens to Genesis", on: true },
      { label: "Public worlds only", on: true },
      { label: "Private worlds", on: false },
      { label: "Provenance API", on: false },
    ],
  },
  {
    name: "Pro",
    price: "$—",
    blurb: "Run your own private worlds.",
    features: [
      { label: "Population cap: 100", on: true },
      { label: "Private worlds", on: true },
      { label: "Up to 10 worlds", on: true },
      { label: "Provenance API", on: false },
    ],
  },
  {
    name: "Research",
    price: "$—",
    blurb: "Export the 0G-reasoned decision dataset.",
    badge: "The moat",
    featured: true,
    features: [
      { label: "Population cap: 100", on: true },
      { label: "Private worlds · up to 25", on: true },
      { label: "Provenance API access", on: true },
      { label: "Keyless verifiable dataset export", on: true },
    ],
  },
];

export default function PricingPage() {
  return (
    <main className="board">
      <header className="board-head">
        <span className="proof-kicker mono">
          <span className="proof-kicker-dot" aria-hidden /> PLANS &amp; ACCESS
        </span>
        <h1 className="board-title">Watch for free. Export the proof when it’s the product.</h1>
        <p className="board-sub">
          Everyone can explore the living world and verify any decision keyless. Paid plans add
          private worlds and — on Research — programmatic access to the{" "}
          <span className="ink">verifiable, 0G-reasoned decision dataset</span>.
        </p>
      </header>

      <section className="price-grid" aria-label="Plans">
        {PLANS.map((plan) => (
          <div key={plan.name} className={`price-card${plan.featured ? " price-card--featured" : ""}`}>
            <div className="price-head">
              <span className="price-name">{plan.name}</span>
              {plan.badge && <span className="price-badge">{plan.badge}</span>}
            </div>
            <div className="price-price mono">{plan.price}</div>
            <p className="price-blurb">{plan.blurb}</p>
            <ul className="price-features">
              {plan.features.map((f) => (
                <li key={f.label} className={`price-feature${f.on ? "" : " price-feature--off"}`}>{f.label}</li>
              ))}
            </ul>
            <Link
              href="/signup"
              className={`btn price-cta ${plan.featured ? "btn-primary" : "btn-ghost"}`}
            >
              {plan.name === "Free" ? "Start free" : `Get ${plan.name}`}
            </Link>
          </div>
        ))}
      </section>

      <section className="price-api">
        <div className="section-head">
          <h2 className="section-title">The Research provenance API</h2>
          <span className="section-meta mono">api-key gated</span>
        </div>
        <p className="board-empty-body">
          Research plans mint an API key that exports the real 0G-reasoned decision dataset — every
          agent decision with its memory and belief drivers, its on-chain root hash, and a keyless
          verification link. The moat, as a product.
        </p>
        <pre className="price-api-curl mono">{`curl -H "Authorization: Bearer civ_…" \\
     <host>/api/provenance/records`}</pre>
      </section>

      <nav className="board-foot" aria-label="Navigation">
        <Link href="/signup" className="board-foot-cta">Create an account</Link>
        <Link href="/world" className="board-foot-cta board-foot-cta--ghost">The world</Link>
        <Link href="/account" className="board-foot-cta board-foot-cta--ghost">Account</Link>
        <span className="board-foot-spacer" />
        <Link href="/" className="board-foot-link mono">← Home</Link>
      </nav>
    </main>
  );
}
