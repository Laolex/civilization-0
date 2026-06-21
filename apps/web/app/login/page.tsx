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
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form) });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "failed"); setBusy(false); return; }
      router.push("/account");
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(false); }
  }

  const field = { padding: "9px 11px", background: "#0d1424", border: "1px solid #2b3a5c", borderRadius: 6, color: "#cdd9f5", width: "100%" } as const;

  return (
    <main className="world-root" style={{ maxWidth: 760 }}>
      <p className="landing-eyebrow">Log in · civilization-0</p>
      <h1 className="world-h1">Welcome back</h1>
      <p className="world-empty" style={{ textAlign: "left" }}>
        Sign in to manage your worlds, plan, and Research API key — with email, or with your wallet.
      </p>

      <div className="auth-split">
        {/* Email */}
        <section className="auth-panel">
          <h2 className="auth-panel-title">Email</h2>
          <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
            <input style={field} type="email" placeholder="Email" value={form.email} onChange={set("email")} required />
            <input style={field} type="password" placeholder="Password" value={form.password} onChange={set("password")} required />
            {error && <p className="world-error-msg mono">{error}</p>}
            <button type="submit" className="landing-cta" disabled={busy} style={{ width: "100%", justifyContent: "center" }}>
              {busy ? "Signing in…" : "Log in"}
            </button>
            <Link href="/signup" className="build-link" style={{ textAlign: "center" }}>New here? Sign up</Link>
          </form>
        </section>

        {/* Divider */}
        <div className="auth-or"><span>or</span></div>

        {/* Wallet */}
        <section className="auth-panel">
          <h2 className="auth-panel-title">Wallet</h2>
          <WalletLogin />
        </section>
      </div>

      <div className="build-cta-row" style={{ marginTop: 28 }}>
        <Link href="/map" className="build-link">← The living world</Link>
        <Link href="/" className="build-link">Home</Link>
      </div>
    </main>
  );
}
