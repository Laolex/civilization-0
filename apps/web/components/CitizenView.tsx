"use client";
import { useState } from "react";
import type { Citizen, Relationship } from "@civ/shared";
import type { CausalChainView, TimelineEntry } from "../lib/types";
import { CausalChain } from "./CausalChain";
import { VerifyOnZeroG } from "./VerifyOnZeroG";

export function CitizenView({ citizen, relationships, story, timeline, chains, confidenceByDecision }: {
  citizen: Citizen; relationships: Relationship[]; story: string;
  timeline: TimelineEntry[]; chains: Record<string, CausalChainView>;
  confidenceByDecision: Record<string, number>;
}) {
  const firstDecision = timeline.find((t) => t.decisionId)?.decisionId ?? null;
  const [selected, setSelected] = useState<string | null>(firstDecision);
  const chain = selected ? chains[selected] : null;

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "48px 24px", display: "flex", flexDirection: "column", gap: 32 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 40 }}>{citizen.name}</h1>
        <p style={{ color: "var(--muted)", margin: "6px 0 0" }}>{citizen.occupation} · age {citizen.age} · wealth {citizen.wealth}</p>
      </header>

      <section style={{ border: "1px solid var(--slate)", borderRadius: 12, background: "var(--panel)", padding: 20 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 14, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1 }}>Story</h2>
        <p style={{ margin: 0, lineHeight: 1.6, fontSize: 17 }}>{story}</p>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 32 }}>
        <div>
          <h2 style={{ fontSize: 14, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1 }}>Timeline</h2>
          <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {timeline.map((t) => {
              const active = t.decisionId && t.decisionId === selected;
              return (
                <li key={t.eventId}>
                  <button
                    onClick={() => t.decisionId && setSelected(t.decisionId)}
                    disabled={!t.decisionId}
                    style={{ all: "unset", cursor: t.decisionId ? "pointer" : "default", display: "block", padding: "8px 12px", borderRadius: 8, border: `1px solid ${active ? "var(--accent)" : "var(--slate)"}`, background: active ? "rgba(91,140,255,0.08)" : "transparent", width: "100%" }}>
                    <span style={{ color: "var(--muted)", fontSize: 12 }}>Day {t.day}</span>
                    <div style={{ fontSize: 15 }}>{t.label}{t.decisionId ? " →" : ""}</div>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <div>
          <h2 style={{ fontSize: 14, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, display: "flex", justifyContent: "space-between" }}>
            <span>Why this decision</span>
            {selected && <span style={{ color: "var(--accent)" }}>Confidence {confidenceByDecision[selected]}%</span>}
          </h2>
          {chain
            ? <CausalChain chain={chain} storageExtra={<VerifyOnZeroG rootHash={chain.rootHash ?? ""} />} />
            : <p style={{ color: "var(--muted)" }}>Select a decision event to see its causal chain.</p>}
        </div>
      </section>

      {relationships.length > 0 && (
        <section>
          <h2 style={{ fontSize: 14, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1 }}>Relationships</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {relationships.map((r) => <li key={r.otherId}>{r.otherId}: trust {r.trust}, friendship {r.friendship}</li>)}
          </ul>
        </section>
      )}
    </main>
  );
}
