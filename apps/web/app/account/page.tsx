import React from "react";
import Link from "next/link";
import { getCurrentUser } from "../../lib/auth";
import { getPool } from "@civ/persistence/src/pool";
import { readWorlds } from "@civ/persistence/src/read";
import { PLAN_LIMITS } from "@civ/persistence/src/world-write";
import { AccountActions } from "../../components/AccountActions";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (<main className="world-root"><p className="landing-eyebrow">Account</p><h1 className="world-h1">Not signed in</h1>
      <div className="build-cta-row" style={{ marginTop: 24 }}><Link href="/login" className="landing-cta">Log in</Link><Link href="/signup" className="build-link">Sign up</Link></div></main>);
  }
  const worlds = await readWorlds(getPool(), user.id);
  const owned = worlds.filter((w) => w.ownerId === user.id);
  return (
    <main className="world-root">
      <p className="landing-eyebrow">Account · civilization-0</p>
      <h1 className="world-h1" style={user.wallet && !user.email ? { fontSize: 20, wordBreak: "break-all" } : undefined}>
        {user.email ?? user.wallet ?? "Account"}
      </h1>
      <div className="world-stat-row">
        <div className="world-stat-card"><span className="label">Plan</span><span className="world-stat-value mono">{user.plan}</span></div>
        <div className="world-stat-card"><span className="label">Worlds</span><span className="world-stat-value mono">{owned.length}</span></div>
        <div className="world-stat-card"><span className="label">API key</span><span className="world-stat-value mono">{user.hasApiKey ? "active" : "—"}</span></div>
      </div>
      <AccountActions plan={user.plan} apiEligible={PLAN_LIMITS[user.plan].api} />
      <section className="world-section">
        <h2 className="world-section-h2">Your worlds</h2>
        {owned.length === 0 ? <p className="world-empty">No worlds yet.</p> : (
          <ul className="world-event-list">{owned.map((w) => <li key={w.id} className="world-event-item">
            <Link href={`/worlds`} className="world-id-link mono">{w.name}</Link>
            <span className="world-event-id mono">{w.visibility} · {w.population}/{w.populationCap}</span></li>)}</ul>)}
      </section>
      <div className="build-cta-row" style={{ marginTop: 32 }}>
        <Link href="/pricing" className="landing-cta">Plans & API →</Link>
        <Link href="/worlds" className="build-link">Worlds</Link>
        <Link href="/world" className="build-link">← World</Link>
      </div>
    </main>
  );
}
