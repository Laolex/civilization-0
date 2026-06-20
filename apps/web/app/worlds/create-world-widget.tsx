"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateWorldWidget() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const res = await fetch("/api/worlds", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), visibility }) });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "failed"); setBusy(false); return; }
      setName("");
      router.refresh();
      setBusy(false);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(false); }
  }

  const field = { padding: "9px 11px", background: "#0d1424", border: "1px solid #2b3a5c", borderRadius: 6, color: "#cdd9f5" } as const;
  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap", alignItems: "center" }}>
      <input style={{ ...field, flex: "1 1 200px" }} placeholder="New world name" value={name} onChange={(e) => setName(e.target.value)} required />
      <select style={field} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
        <option value="public">Public</option>
        <option value="private">Private</option>
      </select>
      <button type="submit" className="landing-cta" disabled={busy}>{busy ? "Creating…" : "Create world"}</button>
      {error && <p className="world-error-msg mono" style={{ flexBasis: "100%", margin: 0 }}>{error}</p>}
    </form>
  );
}
