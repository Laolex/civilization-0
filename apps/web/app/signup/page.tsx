"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const res = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form) });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "failed"); setBusy(false); return; }
      router.push("/account");
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(false); }
  }

  const field = { padding: "9px 11px", background: "#0d1424", border: "1px solid #2b3a5c", borderRadius: 6, color: "#cdd9f5", width: "100%" } as const;
  return (
    <main className="world-root" style={{ maxWidth: 560 }}>
      <p className="landing-eyebrow">Sign up · civilization-0</p>
      <h1 className="world-h1">Create an account</h1>
      <p className="world-empty" style={{ textAlign: "left" }}>An account lets you create private worlds and access the Research provenance API.</p>
      <form onSubmit={submit} style={{ display: "grid", gap: 12, marginTop: 20 }}>
        <input style={field} type="email" placeholder="Email" value={form.email} onChange={set("email")} required />
        <input style={field} type="password" placeholder="Password (6+ characters)" value={form.password} onChange={set("password")} required />
        {error && <p className="world-error-msg mono">{error}</p>}
        <div className="build-cta-row">
          <button type="submit" className="landing-cta" disabled={busy}>{busy ? "Creating…" : "Sign up"}</button>
          <Link href="/login" className="build-link">Log in</Link>
        </div>
      </form>
    </main>
  );
}
