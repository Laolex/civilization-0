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
      const res = await fetch("/api/auth/signup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "failed"); setBusy(false); return; }
      router.push("/account");
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(false); }
  }

  return (
    <main className="board board--narrow">
      <header className="board-head">
        <span className="proof-kicker mono">
          <span className="proof-kicker-dot" aria-hidden /> CREATE ACCOUNT
        </span>
        <h1 className="board-title">Run your own worlds.</h1>
        <p className="board-sub">
          An account lets you create private worlds and, on Research, access the verifiable
          provenance API.
        </p>
      </header>

      <form onSubmit={submit} className="form">
        <input className="field" type="email" placeholder="Email" value={form.email} onChange={set("email")} required />
        <input className="field" type="password" placeholder="Password — 6+ characters" value={form.password} onChange={set("password")} required />
        {error && <p className="form-error">{error}</p>}
        <div className="btn-row">
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Sign up"}</button>
          <Link href="/login" className="btn btn-subtle">Have an account? Log in</Link>
        </div>
      </form>
    </main>
  );
}
