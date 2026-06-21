"use client";
import { useState } from "react";
import type { Citizen, Relationship } from "@civ/shared";
import type { CausalChainView, TimelineEntry } from "../lib/types";
import { CausalChain } from "./CausalChain";
import { VerifyOnZeroG } from "./VerifyOnZeroG";
import { LiveDot } from "./LiveDot";

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

export function CitizenView({ citizen, relationships, story, timeline, chains, confidenceByDecision }: {
  citizen: Citizen; relationships: Relationship[]; story: string;
  timeline: TimelineEntry[]; chains: Record<string, CausalChainView>;
  confidenceByDecision: Record<string, number>;
}) {
  const firstDecision = timeline.find((t) => t.decisionId)?.decisionId ?? null;
  const [selected, setSelected] = useState<string | null>(firstDecision);
  const chain = selected ? chains[selected] : null;

  return (
    <main className="board">
      <header className="board-head">
        <div className="board-live">
          <LiveDot />
          <span className="board-live-label mono">LIVE on 0G</span>
          <span className="board-live-cadence">reasoning live on 0G · pick a decision to trace it</span>
        </div>
        <h1 className="board-title">{citizen.name}</h1>
        <p className="cz-meta mono">
          <span>{citizen.occupation}</span>
          <span>· age {citizen.age}</span>
          <span>· wealth {money(citizen.wealth)}</span>
        </p>
      </header>

      <section className="cz-section panel">
        <div className="section-head"><h2 className="section-title">Story</h2></div>
        <p className="life-line">{story}</p>
      </section>

      <section className="cz-section">
        <div className="section-head">
          <h2 className="section-title">The decision trace</h2>
          <span className="section-meta mono">click a moment → see why</span>
        </div>
        <div className="decision-grid">
          <div>
            <span className="cz-col-label mono">Timeline</span>
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
              <span className="cz-col-label mono">Causal chain</span>
              {selected && confidenceByDecision[selected] !== undefined && (
                <span className="confidence-badge">{confidenceByDecision[selected]}% confidence</span>
              )}
            </div>
            {chain
              ? <CausalChain chain={chain} storageExtra={<VerifyOnZeroG rootHash={chain.rootHash ?? ""} />} />
              : <p className="cz-col-empty">Select a decision event to trace its causal chain.</p>
            }
          </div>
        </div>
      </section>

      {relationships.length > 0 && (
        <section className="cz-section">
          <div className="section-head"><h2 className="section-title">Relationships</h2></div>
          <ul className="rel-list">
            {relationships.map((r) => (
              <li key={r.otherId}>
                <div className="rel-row">
                  <span className="rel-name">{r.otherId}</span>
                  <span className="rel-stats">
                    <span>trust {r.trust}</span>
                    <span>friendship {r.friendship}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
