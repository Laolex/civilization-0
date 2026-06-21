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
      const res = await fetch("/api/citizens", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, age: Number(form.age), tier: Number(form.tier) }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "failed"); setBusy(false); return; }
      router.push("/citizens/" + j.id);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(false); }
  }

  return (
    <main className="board board--narrow">
      <header className="board-head">
        <span className="proof-kicker mono">
          <span className="proof-kicker-dot" aria-hidden /> NEW CITIZEN
        </span>
        <h1 className="board-title">Drop a mind into the world.</h1>
        <p className="board-sub">
          They enter immediately and start reasoning on <span className="ink">0G Compute</span> when
          the scheduler next ticks. Their backstory becomes their first memory.
        </p>
      </header>

      <form onSubmit={submit} className="form">
        <input className="field" placeholder="Name" value={form.name} onChange={set("name")} required />
        <input className="field" placeholder="Occupation" value={form.occupation} onChange={set("occupation")} required />
        <div className="form-row">
          <input className="field" type="number" placeholder="Age" value={form.age} onChange={set("age")} aria-label="Age" />
          <select className="field field-select" value={form.tier} onChange={set("tier")} aria-label="Tier">
            <option value="1">Tier 1 — ticks weekly</option>
            <option value="2">Tier 2 — every 3rd day</option>
            <option value="3">Tier 3 — daily</option>
          </select>
        </div>
        <textarea className="field" style={{ minHeight: 78, resize: "vertical" }} placeholder="Backstory — becomes their first memory" value={form.backstory} onChange={set("backstory")} />
        <textarea className="field" style={{ minHeight: 54, resize: "vertical" }} placeholder="Initial goal" value={form.goal} onChange={set("goal")} />
        {error && <p className="form-error">{error}</p>}
        <div className="btn-row">
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create citizen"}</button>
          <Link href="/world" className="btn btn-subtle">← The world</Link>
        </div>
      </form>
    </main>
  );
}
