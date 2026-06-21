"use client";
import React from "react";
import Link from "next/link";
import type { MapWorld } from "@civ/persistence/src/read";

// Deterministic hash → stable pseudo-random in [0,1) so a dot keeps its spot
// across renders/ticks instead of jumping around.
function rand(seed: string, salt: number): number {
  let h = 0x811c9dc5 ^ salt;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return ((h >>> 0) % 10000) / 10000;
}

function pos(id: string) {
  // keep entities inside a 10%–90% box so they never clip the void edges
  const x = 10 + rand(id, 1) * 80;
  const y = 12 + rand(id, 2) * 76;
  const dur = 9 + rand(id, 3) * 9;        // 9–18s drift
  const delay = -rand(id, 4) * 12;        // desync starts
  const dx = (rand(id, 5) - 0.5) * 5;     // small drift radius (%)
  const dy = (rand(id, 6) - 0.5) * 5;
  return { x, y, dur, delay, dx, dy };
}

function Citizen({ c }: { c: { id: string; name: string; tier: number } }) {
  const p = pos(c.id);
  const size = 9 + c.tier * 4;            // tier 1→13px … tier 3→21px
  return (
    <Link
      href={`/citizens/${c.id}`}
      className={`lw-dot lw-tier-${c.tier}`}
      title={`${c.name} · tier ${c.tier}`}
      style={{
        left: `${p.x}%`, top: `${p.y}%`, width: size, height: size,
        ["--dx" as string]: `${p.dx}%`, ["--dy" as string]: `${p.dy}%`,
        ["--dur" as string]: `${p.dur}s`, ["--delay" as string]: `${p.delay}s`,
      }}
    >
      <span className="lw-label">{c.name}</span>
    </Link>
  );
}

function Org({ o }: { o: { id: string; name: string } }) {
  const p = pos(o.id);
  return (
    <Link
      href={`/orgs/${o.id}`}
      className="lw-org"
      title={`${o.name} · organization`}
      style={{
        left: `${p.x}%`, top: `${p.y}%`,
        ["--dx" as string]: `${p.dx}%`, ["--dy" as string]: `${p.dy}%`,
        ["--dur" as string]: `${p.dur}s`, ["--delay" as string]: `${p.delay}s`,
      }}
    >
      <span className="lw-org-shape" />
      <span className="lw-label">{o.name}</span>
    </Link>
  );
}

export function LivingWorld({ worlds }: { worlds: MapWorld[] }) {
  return (
    <div className="lw-grid">
      {worlds.map((w) => {
        const pop = w.citizens.length;
        return (
          <section key={w.id} className={`lw-box${w.visibility === "private" ? " lw-private" : ""}`}>
            <header className="lw-box-head">
              <span className="lw-box-name mono">{w.name}</span>
              <span className="lw-box-meta mono">
                {w.visibility === "private" && <span className="lw-lock" title="private world">🔒</span>}
                {pop} {pop === 1 ? "citizen" : "citizens"}{w.orgs.length > 0 ? ` · ${w.orgs.length} org${w.orgs.length > 1 ? "s" : ""}` : ""}
              </span>
            </header>
            <div className="lw-void">
              {pop === 0 && w.orgs.length === 0 ? (
                <span className="lw-empty mono">empty — no inhabitants yet</span>
              ) : (
                <>
                  {w.citizens.map((c) => <Citizen key={c.id} c={c} />)}
                  {w.orgs.map((o) => <Org key={o.id} o={o} />)}
                </>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
