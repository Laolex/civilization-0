"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function NewCitizenPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", occupation: "", age: "28", tier: "1", backstory: "", goal: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const res = await fetch("/api/citizens", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, age: Number(form.age), tier: Number(form.tier) }) });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "failed"); setBusy(false); return; }
      router.push("/citizens/" + j.id);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(false); }
  }

  const field = { padding: "9px 11px", background: "#0d1424", border: "1px solid #2b3a5c", borderRadius: 6, color: "#cdd9f5", width: "100%" } as const;
  return (
    <main className="world-root" style={{ maxWidth: 560 }}>
      <p className="landing-eyebrow">Create a citizen · civilization-0</p>
      <h1 className="world-h1">New citizen</h1>
      <p className="world-empty" style={{ textAlign: "left" }}>They enter the world immediately and start reasoning on 0G when the scheduler next ticks.</p>
      <form onSubmit={submit} style={{ display: "grid", gap: 12, marginTop: 20 }}>
        <input style={field} placeholder="Name" value={form.name} onChange={set("name")} required />
        <input style={field} placeholder="Occupation" value={form.occupation} onChange={set("occupation")} required />
        <div style={{ display: "flex", gap: 12 }}>
          <input style={field} type="number" placeholder="Age" value={form.age} onChange={set("age")} />
          <select style={field} value={form.tier} onChange={set("tier")}>
            <option value="1">Tier 1 (ticks weekly)</option>
            <option value="2">Tier 2 (every 3rd day)</option>
            <option value="3">Tier 3 (daily)</option>
          </select>
        </div>
        <textarea style={{ ...field, minHeight: 70 }} placeholder="Backstory (becomes their first memory)" value={form.backstory} onChange={set("backstory")} />
        <textarea style={{ ...field, minHeight: 50 }} placeholder="Initial goal" value={form.goal} onChange={set("goal")} />
        {error && <p className="world-error-msg mono">{error}</p>}
        <div className="build-cta-row">
          <button type="submit" className="landing-cta" disabled={busy}>{busy ? "Creating…" : "Create citizen"}</button>
          <Link href="/world" className="build-link">← World</Link>
        </div>
      </form>
    </main>
  );
}
