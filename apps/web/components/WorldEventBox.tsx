"use client";
import React from "react";

const MAX = 140;

export function WorldEventBox({ worldId }: { worldId: string }) {
  const [headline, setHeadline] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "sending" | "sent" | "error">("idle");

  async function send() {
    const h = headline.trim();
    if (!h || h.length > MAX) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/interventions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worldId, type: "world_event", headline: h }),
      });
      if (!res.ok) { setStatus("error"); return; }
      setHeadline(""); setStatus("sent");
    } catch { setStatus("error"); }
  }

  return (
    <div className="whisper-box">
      <label className="whisper-label">Set the world headline</label>
      <input className="whisper-input" placeholder="A new headline for the world…"
        maxLength={MAX} value={headline} onChange={(e) => setHeadline(e.target.value)} />
      <div className="whisper-actions">
        <span className="whisper-count mono">{headline.length}/{MAX}</span>
        <button onClick={send} disabled={status === "sending"}>Set headline</button>
      </div>
      {status === "sent" && <p className="whisper-sent">The world will feel this on the next day.</p>}
      {status === "error" && <p className="whisper-error">Couldn&apos;t set it — you may not have rights on this world.</p>}
    </div>
  );
}
