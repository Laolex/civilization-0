"use client";
import type { ExplainView } from "@civ/history/src/types";
import { SocialDrivers } from "../../components/SocialDrivers";

const short = (h: string) => (h.length > 14 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h);

/**
 * Presentational view of a single authenticated cognitive trace, folded from the history log.
 * Invariant #1: candidates/beliefΔ are NEVER fabricated — when the runtime did not record them
 * (always, in Phase 1A) they project to the literal "unavailable" and we render exactly that.
 */
export function ExplainPanel({ view }: { view: ExplainView }) {
  return (
    <div className="explain">
      <header className="explain-head">
        <span className="explain-title mono">
          citizen {view.citizen} · tick {view.tick} · world {view.world}
        </span>
        <span className={`explain-chain mono ${view.chainVerified ? "is-ok" : "is-broken"}`}>
          {view.chainVerified ? "chain verified ✓" : "chain broken ✗"} · {short(view.eventHash)}
        </span>
      </header>

      <ol className="explain-steps">
        <li className="explain-step"><span className="explain-k mono">① observe</span> {view.observation.query}</li>

        <li className="explain-step">
          <span className="explain-k mono">② social</span>
          {view.socialDrivers.length === 0
            ? <span className="explain-empty"> none</span>
            : <SocialDrivers drivers={view.socialDrivers} />}
        </li>

        <li className="explain-step">
          <span className="explain-k mono">③ available</span> {view.availableActions.join(", ")}
        </li>

        <li className="explain-step">
          <span className="explain-k mono">④ candidates</span>{" "}
          {view.candidates === "unavailable"
            ? <span className="explain-unavailable">unavailable</span>
            : view.candidates.map((c) => c.action).join(", ")}
        </li>

        <li className="explain-step" data-testid="explain-selected">
          <span className="explain-k mono">⑤ choose</span> {view.selectedAction}
        </li>

        <li className="explain-step"><span className="explain-k mono">⑥ reasoning</span> {view.reasoning}</li>

        <li className="explain-step">
          <span className="explain-k mono">⑦ beliefΔ</span>{" "}
          {view.beliefDelta === "unavailable"
            ? <span className="explain-unavailable">unavailable</span>
            : <span className="mono">{JSON.stringify(view.beliefDelta)}</span>}
        </li>

        <li className="explain-step">
          <span className="explain-k mono">⑧ execution</span>{" "}
          {view.execution.provider}/{view.execution.modelId} · verified={String(view.execution.verified)}
        </li>

        <li className="explain-step">
          <span className="explain-k mono">⑨ anchor</span>{" "}
          {view.anchor
            ? <span className="mono">merkle {short(view.anchor.merkleRoot)}{view.anchor.zgTxHash ? ` · 0G ${short(view.anchor.zgTxHash)}` : ""}</span>
            : <span className="explain-empty">not anchored</span>}
        </li>
      </ol>
    </div>
  );
}
