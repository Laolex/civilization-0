"use client";
import React from "react";

type State = "idle" | "posting" | "queued" | "running" | "done" | "cooldown" | "error";

export function AdvanceWorldButton({ worldId }: { worldId: string }) {
  const [state, setState] = React.useState<State>("idle");
  const [rowId, setRowId] = React.useState<string | null>(null);
  const [day, setDay] = React.useState<number | null>(null);
  const [cooldownMs, setCooldownMs] = React.useState(0);
  const [cooldownTotal, setCooldownTotal] = React.useState(0);

  // Tick down the cooldown countdown.
  React.useEffect(() => {
    if (state !== "cooldown" || cooldownMs <= 0) return;
    const t = setTimeout(() => {
      const next = Math.max(0, cooldownMs - 1000);
      setCooldownMs(next);
      if (next <= 0) setState("idle");
    }, 1000);
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
        const total = Number(j.retryAfterMs ?? 120000);
        setCooldownTotal(total);
        setCooldownMs(total);
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
  // Fraction of the cooldown still remaining; drives the depleting bar on the button.
  const frac = cooldownTotal > 0 ? cooldownMs / cooldownTotal : 1;

  return (
    <div className="advance-world" data-state={state} style={{ "--frac": frac } as React.CSSProperties}>
      {/* tick-propagation sweep along the top edge while a tick is in flight */}
      <span className="advance-sweep" aria-hidden="true" />
      <button onClick={advance} disabled={busy || state === "cooldown"}>
        Advance the world now
      </button>
      <span className="advance-cost mono">Forces a real tick · ~0.017 OG · 1 credit (free in preview)</span>
      <div className="advance-statusline" role="status" aria-live="polite">
        {state === "queued" && <p className="advance-status">Queued — a tick is on the way.</p>}
        {state === "running" && <p className="advance-status">Ticking on 0G<span className="advance-ellipsis" aria-hidden="true" /></p>}
        {state === "done" && <p className="advance-status">The world advanced to day {day}.</p>}
        {state === "cooldown" && <p className="advance-status">Just ticked — wait {Math.ceil(cooldownMs / 1000)}s.</p>}
        {state === "error" && <p className="advance-error">Couldn&apos;t request a tick — you may not have rights here.</p>}
      </div>
    </div>
  );
}
