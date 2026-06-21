import React from "react";
import Link from "next/link";
import { getPool } from "@civ/persistence/src/pool";
import { readWorldMap, type MapWorld } from "@civ/persistence/src/read";
import { LivingWorld } from "../../components/LivingWorld";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function MapPage() {
  let worlds: MapWorld[] = [];
  let error: string | null = null;
  try {
    worlds = await readWorldMap(getPool());
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const totalCitizens = worlds.reduce((n, w) => n + w.citizens.length, 0);

  return (
    <main className="world-root">
      <p className="landing-eyebrow">The living map · civilization-0</p>
      <h1 className="world-h1">Every world. Every citizen. Alive.</h1>
      <p className="world-empty" style={{ textAlign: "left", maxWidth: 640 }}>
        Each box is a world; each glowing dot is a citizen reasoning on 0G (brighter = higher tier),
        each semicircle an organization. They drift in real time. <b>Click any one</b> to open its life
        and the chain of decisions — reasoned and verified on 0G — that got it there. As the population
        grows the void fills; as people create worlds, new boxes appear.
      </p>

      <div className="world-stat-row" style={{ marginBottom: 8 }}>
        <div className="world-stat-card"><span className="label">Worlds</span><span className="world-stat-value mono">{worlds.length}</span></div>
        <div className="world-stat-card"><span className="label">Citizens</span><span className="world-stat-value mono">{totalCitizens}</span></div>
      </div>

      {error ? (
        <div className="world-error-panel"><p className="world-error-msg mono">{error}</p></div>
      ) : (
        <LivingWorld worlds={worlds} />
      )}

      <div className="build-cta-row" style={{ marginTop: 8, flexWrap: "wrap", gap: 14 }}>
        <Link href="/citizens/new" className="landing-cta">+ Add your citizen</Link>
        <Link href="/worlds" className="build-link">Create a world</Link>
        <Link href="/world" className="build-link">Dashboard</Link>
        <Link href="/" className="build-link">← Home</Link>
      </div>
      <p className="world-empty" style={{ textAlign: "left", marginTop: 10, fontSize: 12, opacity: 0.6 }}>
        Anyone can drop a citizen into the public world. Sign in to create your own private world and populate it.
      </p>
    </main>
  );
}
