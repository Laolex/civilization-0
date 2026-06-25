"use client";
import React from "react";
import { ALL_ACTIONS } from "@civ/shared";

const MAX = 280;

export function DilemmaBox({ worldId, citizenId, citizenName }: { worldId: string; citizenId: string; citizenName: string }) {
  const [text, setText] = React.useState("");
  const [actions, setActions] = React.useState<string[]>([]);
  const [status, setStatus] = React.useState<"idle" | "sending" | "sent" | "error">("idle");

  function toggle(a: string) {
    setActions((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  }

  const ready = text.trim().length > 0 && text.trim().length <= MAX && actions.length >= 2;

  async function send() {
    if (!ready) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/interventions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worldId, type: "dilemma", targetCitizenId: citizenId, text: text.trim(), actions }),
      });
      if (!res.ok) { setStatus("error"); return; }
      setText(""); setActions([]); setStatus("sent");
    } catch { setStatus("error"); }
  }

  return (
    <div className="whisper-box">
      <label className="whisper-label">Force a dilemma on {citizenName}</label>
      <textarea className="whisper-input" placeholder={`Frame the choice for ${citizenName}…`}
        maxLength={MAX} value={text} onChange={(e) => setText(e.target.value)} />
      <fieldset className="dilemma-actions">
        <legend className="whisper-label">Allowed actions (pick 2 or more)</legend>
        {ALL_ACTIONS.map((a) => (
          <label key={a} className="dilemma-action mono">
            <input type="checkbox" aria-label={a} checked={actions.includes(a)} onChange={() => toggle(a)} /> {a}
          </label>
        ))}
      </fieldset>
      <div className="whisper-actions">
        <span className="whisper-count mono">{text.length}/{MAX} · {actions.length} action{actions.length === 1 ? "" : "s"}</span>
        <button onClick={send} disabled={!ready || status === "sending"}>Force dilemma</button>
      </div>
      {status === "sent" && <p className="whisper-sent">{citizenName} will face this on their next day.</p>}
      {status === "error" && <p className="whisper-error">Couldn&apos;t send — you may not have rights on this world.</p>}
    </div>
  );
}
