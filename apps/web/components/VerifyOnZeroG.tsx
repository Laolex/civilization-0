"use client";
// apps/web/components/VerifyOnZeroG.tsx — live /api/verify integration
import { useState } from "react";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; key: string; bytes: number; excerpt: { decision: unknown; verified: unknown } }
  | { status: "error"; error: string };

export function VerifyOnZeroG({ rootHash }: { rootHash: string }) {
  const [s, setS] = useState<State>({ status: "idle" });

  async function verify() {
    setS({ status: "loading" });
    try {
      const res = await fetch(`/api/verify?root=${encodeURIComponent(rootHash)}`);
      if (res.ok === false) {
        setS({ status: "error", error: `HTTP ${res.status}` });
        return;
      }
      const j = (await res.json()) as {
        ok: boolean;
        key?: string;
        bytes?: number;
        excerpt?: { decision: unknown; verified: unknown };
        error?: string;
      };
      if (!j.ok || !j.key || !j.excerpt) {
        setS({ status: "error", error: j.error ?? "unknown error" });
        return;
      }
      setS({ status: "ok", key: j.key, bytes: j.bytes ?? 0, excerpt: j.excerpt });
    } catch (e) {
      setS({ status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div className="verify-root" style={{ gridColumn: "1 / -1" }}>
      <div className="verify-btn-row">
        <button
          onClick={verify}
          disabled={s.status === "loading"}
          className="verify-btn"
        >
          {s.status === "loading" ? "Retrieving from 0G…" : "Verify on 0G"}
        </button>
        {s.status === "loading" && (
          <span className="verify-status-text">Contacting 0G Storage…</span>
        )}
      </div>

      {s.status === "ok" && (
        <div className="verify-evidence">
          <div className="verify-evidence-header">
            <span className="verify-ok-badge">
              ✓ Verified on 0G Testnet
            </span>
            <span className="verify-bytes">{s.bytes} bytes retrieved</span>
          </div>
          <div className="verify-hash">
            <span className="verify-hash-label">root hash</span>
            {rootHash}
          </div>
          <pre className="verify-pre">
            {JSON.stringify(s.excerpt, null, 2)}
          </pre>
        </div>
      )}

      {s.status === "error" && (
        <div className="verify-error">
          Could not reach 0G Storage: {s.error}
        </div>
      )}
    </div>
  );
}
