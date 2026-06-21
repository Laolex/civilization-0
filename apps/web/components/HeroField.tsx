"use client";
import React from "react";

// Deterministic hash → stable pseudo-random in [0,1) so each dot keeps its
// spot across renders instead of jumping. Mirrors LivingWorld's placement.
function rand(seed: string, salt: number): number {
  let h = 0x811c9dc5 ^ salt;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return ((h >>> 0) % 10000) / 10000;
}

function pos(id: string) {
  return {
    x: 3 + rand(id, 1) * 94,
    y: 7 + rand(id, 2) * 86,
    dur: 11 + rand(id, 3) * 13,     // 11–24s slow drift
    delay: -rand(id, 4) * 16,
    dx: (rand(id, 5) - 0.5) * 7,    // drift radius (%)
    dy: (rand(id, 6) - 0.5) * 7,
  };
}

type Citizen = { id: string; name: string; tier: number };
type Org = { id: string; name: string };

/**
 * The living world, drifting behind the pitch. Purely atmospheric — the real,
 * clickable world is one CTA away (/map). Stops drifting under reduced motion.
 */
export function HeroField({ citizens, orgs }: { citizens: Citizen[]; orgs: Org[] }) {
  return (
    <div className="hero-field" aria-hidden>
      {citizens.map((c) => {
        const p = pos(c.id);
        const size = 8 + c.tier * 4;
        return (
          <span
            key={c.id}
            className={`lw-dot lw-tier-${c.tier} hero-dot`}
            style={{
              left: `${p.x}%`, top: `${p.y}%`, width: size, height: size,
              ["--dx" as string]: `${p.dx}%`, ["--dy" as string]: `${p.dy}%`,
              ["--dur" as string]: `${p.dur}s`, ["--delay" as string]: `${p.delay}s`,
            }}
          />
        );
      })}
      {orgs.map((o) => {
        const p = pos(o.id);
        return (
          <span
            key={o.id}
            className="lw-org hero-dot"
            style={{
              left: `${p.x}%`, top: `${p.y}%`,
              ["--dx" as string]: `${p.dx}%`, ["--dy" as string]: `${p.dy}%`,
              ["--dur" as string]: `${p.dur}s`, ["--delay" as string]: `${p.delay}s`,
            }}
          >
            <span className="lw-org-shape" />
          </span>
        );
      })}
    </div>
  );
}
