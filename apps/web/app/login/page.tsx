"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WalletLogin } from "../../components/WalletLogin";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "failed"); setBusy(false); return; }
      router.push("/account");
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(false); }
  }

  return (
    <main className="board board--mid">
      <header className="board-head">
        <span className="proof-kicker mono">
          <span className="proof-kicker-dot" aria-hidden /> SIGN IN
        </span>
        <h1 className="board-title">Welcome back.</h1>
        <p className="board-sub">
          Manage your worlds, plan, and Research API key — with email, or with your wallet.
        </p>
      </header>

      <div className="auth-split">
        <section className="auth-panel">
          <h2 className="auth-panel-title">Email</h2>
          <form onSubmit={submit} className="form">
            <input className="field" type="email" placeholder="Email" value={form.email} onChange={set("email")} required />
            <input className="field" type="password" placeholder="Password" value={form.password} onChange={set("password")} required />
            {error && <p className="form-error">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: "100%" }}>
              {busy ? "Signing in…" : "Log in"}
            </button>
            <Link href="/signup" className="board-foot-link mono" style={{ textAlign: "center" }}>New here? Sign up →</Link>
          </form>
        </section>

        <div className="auth-or"><span>or</span></div>

        <section className="auth-panel">
          <h2 className="auth-panel-title">Wallet</h2>
          <WalletLogin />
        </section>
      </div>

      <nav className="board-foot" aria-label="Navigation">
        <Link href="/map" className="board-foot-cta board-foot-cta--ghost">◉ The living world</Link>
        <span className="board-foot-spacer" />
        <Link href="/" className="board-foot-link mono">← Home</Link>
      </nav>
    </main>
  );
}
