"use client";
import React from "react";

const MAX = 280;

export function WhisperBox({ worldId, citizenId, citizenName }: { worldId: string; citizenId: string; citizenName: string }) {
  const [text, setText] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "sending" | "sent" | "error">("idle");

  async function send() {
    const t = text.trim();
    if (!t || t.length > MAX) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/interventions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worldId, type: "whisper", targetCitizenId: citizenId, text: t }),
      });
      if (!res.ok) { setStatus("error"); return; }
      setText(""); setStatus("sent");
    } catch { setStatus("error"); }
  }

  return (
    <div className="whisper-box">
      <label className="whisper-label">Whisper to {citizenName}</label>
      <textarea className="whisper-input" placeholder={`Whisper a suggestion to ${citizenName}…`}
        maxLength={MAX} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="whisper-actions">
        <span className="whisper-count mono">{text.length}/{MAX}</span>
        <button onClick={send} disabled={status === "sending"}>Send</button>
      </div>
      {status === "sent" && <p className="whisper-sent">{citizenName} will hear this on their next day.</p>}
      {status === "error" && <p className="whisper-error">Couldn&apos;t send — you may not have rights on this world.</p>}
    </div>
  );
}
