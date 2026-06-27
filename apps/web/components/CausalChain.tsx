"use client";
import { useState, type ReactNode } from "react";
import type { CausalChainView, ChainNode } from "../lib/types";
import { SocialDrivers } from "./SocialDrivers";

const ACCENT_KINDS = new Set(["compute", "storage", "social"]);

function NodeCard({ node, extra }: { node: ChainNode; extra?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const verified = node.detail.verified === "true";
  const isAccent = ACCENT_KINDS.has(node.kind);

  return (
    <div
      className={`node-card${verified ? " verified" : ""}`}
      style={{ maxWidth: 480, width: "100%" }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="node-card-trigger"
        aria-expanded={open}
      >
        <div className="node-card-left">
          <span className={`node-kind-tag${isAccent ? " accent" : ""}`}>
            {node.kind}
          </span>
          <span data-title className="node-title">{node.title}</span>
          {verified && (
            <span className="node-verified-mark">
              <svg className="node-verified-icon" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M2 6.5L4.5 9L10 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Verified
            </span>
          )}
        </div>
        <div className="node-card-right">
          {typeof node.weight === "number" && (
            <span className="node-weight">{node.weight.toFixed(2)}</span>
          )}
          <span className="node-toggle" aria-hidden="true">{open ? "−" : "+"}</span>
        </div>
      </button>

      {open && node.kind === "social" ? (
        <div className="node-detail">
          <SocialDrivers drivers={node.socialDrivers ?? []} socialQuery={node.socialQuery} orgDriver={node.orgDriver} />
        </div>
      ) : open ? (
        <div className="node-detail">
          <dl className="node-detail-grid">
            {Object.entries(node.detail).map(([k, v]) => {
              const isMono = k.toLowerCase().includes("hash") || k.toLowerCase().includes("tx") || k.toLowerCase() === "provider" || k.toLowerCase() === "model";
              return (
                <div key={k} style={{ display: "contents" }}>
                  <dt className="node-detail-key">{k}</dt>
                  <dd className={`node-detail-val${isMono ? " mono-val" : ""}`}>{v}</dd>
                </div>
              );
            })}
            {extra}
          </dl>
        </div>
      ) : null}
    </div>
  );
}

export function CausalChain({ chain, storageExtra }: { chain: CausalChainView; storageExtra?: ReactNode }) {
  return (
    <div className="chain-root chain-animated">
      {chain.nodes.map((node, i) => (
        <div
          key={node.kind}
          className={`chain-node-wrap kind-${node.kind}`}
          style={{ ["--i" as string]: i }}
        >
          <NodeCard node={node} extra={node.kind === "storage" ? storageExtra : undefined} />
          {i < chain.nodes.length - 1 && (
            <div className="chain-connector">
              <div className="chain-connector-line" />
              <div className="chain-connector-arrow" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
