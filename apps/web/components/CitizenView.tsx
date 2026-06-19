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
    <main className="citizen-root">
      <header>
        <h1 className="citizen-header-name">{citizen.name}</h1>
        <p className="citizen-header-meta">
          {citizen.occupation} &middot; age {citizen.age} &middot; wealth {citizen.wealth}
        </p>
      </header>

      <section className="story-panel">
        <h2 className="label">Story</h2>
        <p className="story-text">{story}</p>
      </section>

      <section className="decision-grid">
        <div>
          <h2 className="label" style={{ marginBottom: 8 }}>Timeline</h2>
          <ol className="timeline-list">
            {timeline.map((t) => {
              const active = !!(t.decisionId && t.decisionId === selected);
              const clickable = !!t.decisionId;
              return (
                <li key={t.eventId}>
                  <button
                    onClick={() => t.decisionId && setSelected(t.decisionId)}
                    disabled={!t.decisionId}
                    className={`timeline-item-btn${clickable ? " clickable" : ""}${active ? " active" : ""}`}
                  >
                    <div className="timeline-day">Day {t.day}</div>
                    <div className="timeline-label">
                      <span>{t.label}</span>
                      {t.decisionId && <span className="timeline-why">Why? →</span>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <div>
          <div className="chain-panel-header">
            <h2 className="label">Causal chain</h2>
            {selected && confidenceByDecision[selected] !== undefined && (
              <span className="confidence-badge">{confidenceByDecision[selected]}% confidence</span>
            )}
          </div>
          {chain
            ? <CausalChain chain={chain} storageExtra={<VerifyOnZeroG rootHash={chain.rootHash ?? ""} />} />
            : <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>Select a decision event to trace its causal chain.</p>
          }
        </div>
      </section>

      {relationships.length > 0 && (
        <section>
          <h2 className="label" style={{ marginBottom: 8 }}>Relationships</h2>
          <ul className="relationships-list">
            {relationships.map((r) => (
              <li key={r.otherId}>{r.otherId} — trust {r.trust} · friendship {r.friendship}</li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
