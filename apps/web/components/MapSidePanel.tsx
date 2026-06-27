"use client";
import { useEffect, useState } from "react";
import type { CausalChainView, SocialDriverView } from "../lib/types";
import { CausalChain } from "./CausalChain";

type Loaded = { chain: CausalChainView | null };

export function MapSidePanel({
  citizenId, name, onReplay, onClose,
}: {
  citizenId: string; name: string;
  onReplay: (deciderId: string, drivers: SocialDriverView[]) => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<"loading" | "error" | Loaded>("loading");

  useEffect(() => {
    let alive = true;
    setState("loading");
    fetch(`/api/citizen-chain?id=${encodeURIComponent(citizenId)}`)
      .then((r) => r.json())
      .then((j: { ok: boolean; chain: CausalChainView | null }) => {
        if (!alive) return;
        setState(j.ok ? { chain: j.chain } : "error");
      })
      .catch(() => { if (alive) setState("error"); });
    return () => { alive = false; };
  }, [citizenId]);

  const chain = typeof state === "object" ? state.chain : null;
  const social = chain?.nodes.find((n) => n.kind === "social");
  const drivers = social?.socialDrivers ?? [];

  return (
    <aside className="map-panel">
      <header className="map-panel-head">
        <span className="map-panel-name">{name}</span>
        <div className="map-panel-actions">
          {drivers.length > 0 && (
            <button className="map-panel-replay" onClick={() => onReplay(citizenId, drivers)}>
              ▸ Replay last decision
            </button>
          )}
          <a className="map-panel-open" href={`/citizens/${citizenId}`}>open profile →</a>
          <button className="map-panel-close" onClick={onClose} aria-label="Close">×</button>
        </div>
      </header>
      {state === "loading" && <p className="map-panel-status mono">loading reasoning…</p>}
      {state === "error" && <p className="map-panel-status mono">could not load this citizen&apos;s reasoning</p>}
      {chain === null && typeof state === "object" && <p className="map-panel-status mono">no decision recorded yet</p>}
      {chain && <CausalChain chain={chain} />}
    </aside>
  );
}
