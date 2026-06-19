"use client";
import { useState, type ReactNode } from "react";
import type { CausalChainView, ChainNode } from "../lib/types";

const ACCENT: Record<string, string> = { compute: "var(--accent)", storage: "var(--accent)" };

function NodeCard({ node, extra }: { node: ChainNode; extra?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const verified = node.detail.verified === "true";
  return (
    <div style={{ width: 380, border: "1px solid var(--slate)", borderRadius: 10, background: "var(--panel)", padding: "14px 16px" }}>
      <button onClick={() => setOpen((v) => !v)} style={{ all: "unset", cursor: "pointer", display: "flex", justifyContent: "space-between", width: "100%", color: ACCENT[node.kind] ?? "var(--fg)", fontWeight: 600 }}>
        <span><span data-title>{node.title}</span>{verified ? <span style={{ marginLeft: 4 }}>✓</span> : null}</span>
        <span style={{ color: "var(--muted)" }}>{typeof node.weight === "number" ? node.weight.toFixed(2) : open ? "−" : "+"}</span>
      </button>
      {open && (
        <dl style={{ margin: "10px 0 0", display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: 13 }}>
          {Object.entries(node.detail).map(([k, v]) => (
            <div key={k} style={{ display: "contents" }}>
              <dt style={{ color: "var(--muted)" }}>{k}</dt>
              <dd className={k.toLowerCase().includes("hash") ? "mono" : undefined} style={{ margin: 0, wordBreak: "break-all" }}>{v}</dd>
            </div>
          ))}
          {extra}
        </dl>
      )}
    </div>
  );
}

export function CausalChain({ chain, storageExtra }: { chain: CausalChainView; storageExtra?: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
      {chain.nodes.map((node, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <NodeCard node={node} extra={node.kind === "storage" ? storageExtra : undefined} />
          {i < chain.nodes.length - 1 && <span style={{ color: "var(--muted)", padding: "6px 0" }}>▼</span>}
        </div>
      ))}
    </div>
  );
}
