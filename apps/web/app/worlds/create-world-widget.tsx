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
      const res = await fetch("/api/worlds", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), visibility }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "failed"); setBusy(false); return; }
      setName("");
      router.refresh();
      setBusy(false);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(false); }
  }

  return (
    <section className="panel wl-create">
      <div className="section-head"><h2 className="section-title">Create a world</h2></div>
      <form onSubmit={submit} className="wl-create-form">
        <input
          className="field"
          placeholder="New world name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          aria-label="World name"
        />
        <select className="field field-select" value={visibility} onChange={(e) => setVisibility(e.target.value)} aria-label="Visibility">
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create world"}</button>
        {error && <p className="form-error wl-create-error">{error}</p>}
      </form>
    </section>
  );
}
