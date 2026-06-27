"use client";
import React, { useMemo, useState } from "react";
import type { MapWorld } from "@civ/persistence/src/read";
import { MapSidePanel } from "./MapSidePanel";
import { edgeKey, replayEdges } from "../lib/replay";
import type { SocialDriverView } from "../lib/types";

// Deterministic hash → stable pseudo-random in [0,1) so the layout is identical
// on the server and the client (no hydration mismatch) and stable across ticks.
function rand(seed: string, salt: number): number {
  let h = 0x811c9dc5 ^ salt;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return ((h >>> 0) % 100000) / 100000;
}

type Node = { id: string; kind: "citizen" | "org"; name: string; tier: number; x: number; y: number };
type Spring = { a: string; b: string; rest: number; k: number };

const FW = 100; // field width  (viewBox units)
const FH = 60; //  field height

/** A tiny deterministic force-directed layout. Settles relationship + membership
 *  springs against all-pairs repulsion, then normalizes into the field. */
function layout(world: MapWorld): { nodes: Node[]; tethers: { a: string; b: string }[] } {
  const nodes: Node[] = [
    ...world.citizens.map((c) => ({ id: c.id, kind: "citizen" as const, name: c.name, tier: c.tier, x: 0, y: 0 })),
    ...world.orgs.map((o) => ({ id: o.id, kind: "org" as const, name: o.name, tier: 2, x: 0, y: 0 })),
  ];
  if (nodes.length === 0) return { nodes, tethers: [] };

  nodes.forEach((n) => { n.x = 0.5 + (rand(n.id, 1) - 0.5) * 0.6; n.y = 0.5 + (rand(n.id, 2) - 0.5) * 0.6; });

  const springs: Spring[] = world.edges.map((e) => ({ a: e.a, b: e.b, rest: 0.3 - e.strength * 0.12, k: 0.9 }));
  const tethers: { a: string; b: string }[] = [];
  for (const [cid, oid] of Object.entries(world.membership)) {
    springs.push({ a: oid, b: cid, rest: 0.18, k: 1.2 });
    tethers.push({ a: oid, b: cid });
  }

  const idx = new Map(nodes.map((n, i) => [n.id, i] as const));
  const vx = new Array(nodes.length).fill(0), vy = new Array(nodes.length).fill(0);
  const ITER = 260, DAMP = 0.82, DT = 0.85;

  for (let it = 0; it < ITER; it++) {
    const fx = new Array(nodes.length).fill(0), fy = new Array(nodes.length).fill(0);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        let dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
        const d2 = dx * dx + dy * dy + 0.0016, d = Math.sqrt(d2), rep = 0.011 / d2;
        fx[i] += (dx / d) * rep; fy[i] += (dy / d) * rep;
        fx[j] -= (dx / d) * rep; fy[j] -= (dy / d) * rep;
      }
    }
    for (const s of springs) {
      const i = idx.get(s.a), j = idx.get(s.b);
      if (i == null || j == null) continue;
      const dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y, d = Math.hypot(dx, dy) + 1e-6;
      const f = (d - s.rest) * s.k * 0.12;
      fx[i] += (dx / d) * f; fy[i] += (dy / d) * f;
      fx[j] -= (dx / d) * f; fy[j] -= (dy / d) * f;
    }
    for (let i = 0; i < nodes.length; i++) {
      fx[i] += (0.5 - nodes[i].x) * 0.018; fy[i] += (0.5 - nodes[i].y) * 0.018;
      vx[i] = (vx[i] + fx[i]) * DAMP; vy[i] = (vy[i] + fy[i]) * DAMP;
      nodes[i].x += Math.max(-0.04, Math.min(0.04, vx[i] * DT));
      nodes[i].y += Math.max(-0.04, Math.min(0.04, vy[i] * DT));
    }
  }

  const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = 0.12, sx = maxX - minX || 1, sy = maxY - minY || 1;
  nodes.forEach((n) => {
    n.x = (pad + ((n.x - minX) / sx) * (1 - 2 * pad)) * FW;
    n.y = (pad + ((n.y - minY) / sy) * (1 - 2 * pad)) * FH;
  });
  return { nodes, tethers };
}

const TIER_R: Record<number, number> = { 1: 1.5, 2: 2.0, 3: 2.7 };

function Field({ world }: { world: MapWorld }) {
  const { nodes, tethers } = useMemo(() => layout(world), [world]);
  const pos = useMemo(() => new Map(nodes.map((n) => [n.id, n] as const)), [nodes]);
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [replay, setReplay] = useState<Map<string, number> | null>(null);

  // The hovered node's neighbourhood (itself + everything it's tied to).
  const lit = useMemo(() => {
    if (!hover) return null;
    const s = new Set<string>([hover]);
    for (const e of world.edges) { if (e.a === hover) s.add(e.b); if (e.b === hover) s.add(e.a); }
    for (const [cid, oid] of Object.entries(world.membership)) {
      if (cid === hover) s.add(oid); if (oid === hover) s.add(cid);
    }
    return s;
  }, [hover, world]);

  const dim = (id: string) => (lit && !lit.has(id) ? 0.18 : 1);
  const edgeLit = (a: string, b: string) => !lit || lit.has(a) || lit.has(b);

  return (
    <div className="cn-field-inner">
    <svg className="cn-svg" viewBox={`0 0 ${FW} ${FH}`} role="img" aria-label={`Social map of ${world.name}`}>
      <g className="cn-orbit">
        {/* org → member tethers (faint violet) */}
        {tethers.map((t) => {
          const A = pos.get(t.a), B = pos.get(t.b);
          if (!A || !B) return null;
          return (
            <line key={`t-${t.a}-${t.b}`} className="cn-tether" x1={A.x} y1={A.y} x2={B.x} y2={B.y}
              opacity={edgeLit(t.a, t.b) ? 0.4 : 0.08} />
          );
        })}
        {/* relationship edges (accent; brighter = stronger tie) */}
        {world.edges.map((e) => {
          const A = pos.get(e.a), B = pos.get(e.b);
          if (!A || !B) return null;
          const on = edgeLit(e.a, e.b);
          const rk = replay?.get(edgeKey(e.a, e.b));
          return (
            <line key={`e-${e.a}-${e.b}`}
              className={`cn-edge${rk != null ? " cn-edge--replay" : ""}`}
              x1={A.x} y1={A.y} x2={B.x} y2={B.y}
              strokeWidth={rk != null ? 0.5 + rk * 1.6 : 0.35 + e.strength * 0.6}
              opacity={rk != null ? 1 : (on ? 1 : 0.1) * (0.28 + e.strength * 0.55)} />
          );
        })}
        {/* nodes */}
        {nodes.map((n) => {
          const r = n.kind === "org" ? 2.4 : TIER_R[n.tier] ?? 1.6;
          const href = n.kind === "org" ? `/orgs/${n.id}` : `/citizens/${n.id}`;
          if (n.kind === "citizen") {
            return (
              <a key={n.id} href={href} className="cn-node"
                onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}
                onClick={(e) => { e.preventDefault(); setSelected({ id: n.id, name: n.name }); setReplay(null); }}
                style={{ opacity: dim(n.id) }}>
                <circle className="cn-halo" cx={n.x} cy={n.y} r={r * 2.6} />
                <circle className={`cn-dot cn-tier-${n.tier}`} cx={n.x} cy={n.y} r={r} />
                <text className="cn-label" x={n.x} y={n.y - r - 1.6} textAnchor="middle">{n.name}</text>
              </a>
            );
          }
          return (
            <a key={n.id} href={href} className="cn-node"
              onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}
              style={{ opacity: dim(n.id) }}>
              <path className="cn-org" d={orgMark(n.x, n.y, r)} />
              <text className="cn-label" x={n.x} y={n.y - r - 1.6} textAnchor="middle">{n.name}</text>
            </a>
          );
        })}
      </g>
    </svg>
    {selected && (
      <MapSidePanel
        citizenId={selected.id}
        name={selected.name}
        onReplay={(deciderId: string, drivers: SocialDriverView[]) => setReplay(replayEdges(deciderId, drivers))}
        onClose={() => { setSelected(null); setReplay(null); }}
      />
    )}
    </div>
  );
}

// a small upward semicircle (matches the org mark used elsewhere)
function orgMark(cx: number, cy: number, r: number): string {
  const w = r * 1.5;
  return `M ${cx - w} ${cy + r * 0.3} A ${w} ${w} 0 0 1 ${cx + w} ${cy + r * 0.3} Z`;
}

export function Constellation({ worlds }: { worlds: MapWorld[] }) {
  return (
    <div className="cn-grid">
      {worlds.map((w) => {
        const pop = w.citizens.length;
        const empty = pop === 0 && w.orgs.length === 0;
        return (
          <section key={w.id} className={`cn-panel${w.visibility === "private" ? " cn-panel--private" : ""}`}>
            <header className="cn-head">
              <span className="cn-name mono">{w.name}</span>
              <span className="cn-meta mono">
                {w.visibility === "private" && <span className="cn-lock" aria-hidden>🔒 </span>}
                {pop} {pop === 1 ? "citizen" : "citizens"}
                {w.edges.length > 0 ? ` · ${w.edges.length} tie${w.edges.length === 1 ? "" : "s"}` : ""}
              </span>
            </header>
            <div className="cn-field">
              {empty ? <span className="cn-empty mono">empty — no inhabitants yet</span> : <Field world={w} />}
            </div>
          </section>
        );
      })}
    </div>
  );
}
