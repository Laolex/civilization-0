import React from "react";
import Link from "next/link";
import { getCurrentUser } from "../../lib/auth";
import { getPool } from "@civ/persistence/src/pool";
import { readWorlds } from "@civ/persistence/src/read";
import { PLAN_LIMITS } from "@civ/persistence/src/world-write";
import { AccountActions } from "../../components/AccountActions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <main className="board board--narrow">
        <header className="board-head">
          <h1 className="board-title">Not signed in.</h1>
          <p className="board-sub">Sign in to manage your worlds, plan, and Research API key.</p>
        </header>
        <nav className="board-foot" aria-label="Navigation">
          <Link href="/login" className="board-foot-cta">Log in</Link>
          <Link href="/signup" className="board-foot-cta board-foot-cta--ghost">Sign up</Link>
          <span className="board-foot-spacer" />
          <Link href="/" className="board-foot-link mono">← Home</Link>
        </nav>
      </main>
    );
  }

  const worlds = await readWorlds(getPool(), user.id);
  const owned = worlds.filter((w) => w.ownerId === user.id);
  const identity = user.email ?? user.wallet ?? "Account";

  return (
    <main className="board board--mid">
      <header className="board-head">
        <span className="proof-kicker mono">
          <span className="proof-kicker-dot" aria-hidden /> ACCOUNT
        </span>
        <h1 className={`board-title${user.wallet && !user.email ? " board-title--addr" : ""}`}>{identity}</h1>
      </header>

      <section className="cluster cluster--three" aria-label="Account">
        <div className="cluster-cell">
          <span className="cluster-label">Plan</span>
          <span className="cluster-value mono">{user.plan}</span>
          <span className="cluster-foot">{PLAN_LIMITS[user.plan].api ? "API enabled" : "no API access"}</span>
        </div>
        <div className="cluster-cell">
          <span className="cluster-label">Worlds</span>
          <span className="cluster-value mono">{owned.length}</span>
          <span className="cluster-foot">owned by you</span>
        </div>
        <div className="cluster-cell">
          <span className="cluster-label">API key</span>
          <span className={`cluster-value mono${user.hasApiKey ? " accent" : ""}`}>{user.hasApiKey ? "active" : "—"}</span>
          <span className="cluster-foot">research dataset export</span>
        </div>
      </section>

      <AccountActions plan={user.plan} apiEligible={PLAN_LIMITS[user.plan].api} />

      <section className="cz-section">
        <div className="section-head">
          <h2 className="section-title">Your worlds</h2>
          <span className="section-meta mono">{owned.length} owned</span>
        </div>
        {owned.length === 0 ? (
          <div className="board-empty">
            <p className="board-empty-body">No worlds yet. Create one to populate it with citizens that reason on 0G.</p>
          </div>
        ) : (
          <ul className="rel-list">
            {owned.map((w) => (
              <li key={w.id}>
                <div className="rel-row">
                  <Link href="/worlds" className="rel-name">{w.name}</Link>
                  <span className="rel-stats">
                    <span>{w.visibility}</span>
                    <span>{w.population}/{w.populationCap}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav className="board-foot" aria-label="Navigation">
        <Link href="/worlds" className="board-foot-cta">Create a world</Link>
        <Link href="/pricing" className="board-foot-cta board-foot-cta--ghost">Plans &amp; API</Link>
        <span className="board-foot-spacer" />
        <Link href="/world" className="board-foot-link mono">← The world</Link>
      </nav>
    </main>
  );
}
