"use client";
import React from "react";

type State = "idle" | "posting" | "queued" | "running" | "done" | "cooldown" | "error";

export function AdvanceWorldButton({ worldId }: { worldId: string }) {
  const [state, setState] = React.useState<State>("idle");
  const [rowId, setRowId] = React.useState<string | null>(null);
  const [day, setDay] = React.useState<number | null>(null);
  const [cooldownMs, setCooldownMs] = React.useState(0);

  // Tick down the cooldown countdown.
  React.useEffect(() => {
    if (state !== "cooldown" || cooldownMs <= 0) return;
    const t = setTimeout(() => setCooldownMs((m) => Math.max(0, m - 1000)), 1000);
    if (cooldownMs - 1000 <= 0) setState("idle");
    return () => clearTimeout(t);
  }, [state, cooldownMs]);

  // Poll for the request to be applied.
  React.useEffect(() => {
    if ((state !== "queued" && state !== "running") || !rowId) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/interventions?worldId=${encodeURIComponent(worldId)}`);
        if (!res.ok) return;
        const rows: { id: string; status: string; appliedDay: number | null }[] = await res.json();
        const row = rows.find((r) => r.id === rowId);
        if (row && row.status === "applied") {
          setDay(row.appliedDay);
          setState("done");
        } else if (row && row.status === "pending") {
          setState("running");
        }
      } catch { /* keep polling */ }
    }, 4000);
    return () => clearInterval(poll);
  }, [state, rowId, worldId]);

  async function advance() {
    setState("posting");
    try {
      const res = await fetch("/api/interventions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worldId, type: "tick_request" }),
      });
      if (res.status === 429) {
        const j = await res.json().catch(() => ({}));
        setCooldownMs(Number(j.retryAfterMs ?? 120000));
        setState("cooldown");
        return;
      }
      if (!res.ok) { setState("error"); return; }
      const row = await res.json();
      setRowId(row.id);
      setState("queued");
    } catch { setState("error"); }
  }

  const busy = state === "posting" || state === "queued" || state === "running";
  return (
    <div className="advance-world">
      <button onClick={advance} disabled={busy || state === "cooldown"}>
        Advance the world now
      </button>
      <span className="advance-cost mono">Forces a real tick · ~0.017 OG · 1 credit (free in preview)</span>
      {state === "queued" && <p className="advance-status">Queued — a tick is on the way.</p>}
      {state === "running" && <p className="advance-status">Ticking on 0G…</p>}
      {state === "done" && <p className="advance-status">The world advanced to day {day}.</p>}
      {state === "cooldown" && <p className="advance-status">Just ticked — wait {Math.ceil(cooldownMs / 1000)}s.</p>}
      {state === "error" && <p className="advance-error">Couldn&apos;t request a tick — you may not have rights here.</p>}
    </div>
  );
}
