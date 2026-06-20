"use client";
// apps/web/components/AccountActions.tsx — plan upgrade + API key minting (mock, no payment)
import { useState } from "react";

const PLANS = ["free", "pro", "research"] as const;

export function AccountActions({ plan, apiEligible }: { plan: string; apiEligible: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function changePlan(next: string) {
    setBusy(next);
    setError(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: next }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `HTTP ${res.status}`);
        setBusy(null);
        return;
      }
      location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  async function mintKey() {
    setBusy("key");
    setError(null);
    try {
      const res = await fetch("/api/keys", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { key?: string; error?: string };
      if (!res.ok || !j.key) {
        setError(j.error ?? `HTTP ${res.status}`);
        setBusy(null);
        return;
      }
      setKey(j.key);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
  }

  return (
    <section className="world-section">
      <h2 className="world-section-h2">Plan & API</h2>
      <div className="build-cta-row">
        {PLANS.map((p) =>
          p === plan ? (
            <span key={p} className="landing-cta" aria-disabled style={{ opacity: 0.6 }}>
              {p} (current)
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className="build-link"
              disabled={busy !== null}
              onClick={() => changePlan(p)}
            >
              {busy === p ? "Switching…" : `Switch to ${p}`}
            </button>
          )
        )}
      </div>

      {apiEligible && (
        <div className="build-cta-row" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="landing-cta"
            disabled={busy !== null}
            onClick={mintKey}
          >
            {busy === "key" ? "Minting…" : "Mint API key"}
          </button>
        </div>
      )}

      {key && (
        <div style={{ marginTop: 16 }}>
          <p className="world-empty">Copy this key now — it is shown only once.</p>
          <pre className="verify-pre mono">{key}</pre>
        </div>
      )}

      {error && <p className="world-empty" style={{ marginTop: 12 }}>Error: {error}</p>}
    </section>
  );
}
