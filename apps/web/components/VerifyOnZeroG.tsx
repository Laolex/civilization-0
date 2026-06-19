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
    <div
      style={{
        gridColumn: "1 / -1",
        marginTop: 12,
        padding: "10px 14px",
        background: "#111317",
        border: "1px solid #2a2d35",
        borderRadius: 8,
      }}
    >
      <button
        onClick={verify}
        disabled={s.status === "loading"}
        style={{
          all: "unset",
          cursor: s.status === "loading" ? "wait" : "pointer",
          padding: "6px 14px",
          border: "1px solid var(--accent, #7aa2f7)",
          borderRadius: 6,
          color: "var(--accent, #7aa2f7)",
          fontSize: 13,
          fontFamily: "monospace",
          opacity: s.status === "loading" ? 0.7 : 1,
        }}
      >
        {s.status === "loading" ? "Retrieving from 0G…" : "Verify on 0G"}
      </button>

      {s.status === "ok" && (
        <div style={{ marginTop: 10 }}>
          <div
            style={{
              color: "var(--accent, #7aa2f7)",
              fontSize: 13,
              fontFamily: "monospace",
              marginBottom: 6,
            }}
          >
            ✓ Verified on 0G Testnet ({s.bytes} bytes retrieved)
          </div>
          <div
            style={{
              color: "#8b949e",
              fontSize: 11,
              fontFamily: "monospace",
              wordBreak: "break-all",
              marginBottom: 8,
            }}
          >
            {rootHash}
          </div>
          <pre
            style={{
              margin: 0,
              padding: 12,
              background: "#0d0f12",
              border: "1px solid #2a2d35",
              borderRadius: 6,
              fontSize: 12,
              fontFamily: "monospace",
              color: "#c9d1d9",
              overflowX: "auto",
            }}
          >
            {JSON.stringify(s.excerpt, null, 2)}
          </pre>
        </div>
      )}

      {s.status === "error" && (
        <div
          style={{
            marginTop: 8,
            color: "#cc6666",
            fontSize: 13,
            fontFamily: "monospace",
          }}
        >
          Could not reach 0G Storage: {s.error}
        </div>
      )}
    </div>
  );
}
