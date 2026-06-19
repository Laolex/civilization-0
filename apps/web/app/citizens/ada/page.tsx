import { loadSnapshot } from "../../../lib/snapshot";
import { getCitizen, getRelationships, getTimeline, getCausalChain, buildStorySummary, decisionConfidence } from "../../../lib/world";
import { CitizenView } from "../../../components/CitizenView";
import type { CausalChainView } from "../../../lib/types";

export default function AdaPage() {
  const snap = loadSnapshot();
  const citizen = getCitizen(snap, "ada");
  if (!citizen) return <main style={{ padding: 48 }}>No citizen data. Run the seed script.</main>;

  const timeline = getTimeline(snap, "ada");
  const chains: Record<string, CausalChainView> = {};
  const confidenceByDecision: Record<string, number> = {};
  for (const t of timeline) {
    if (t.decisionId && !chains[t.decisionId]) {
      const c = getCausalChain(snap, t.decisionId);
      chains[t.decisionId] = c;
      confidenceByDecision[t.decisionId] = decisionConfidence(c);
    }
  }

  return (
    <CitizenView
      citizen={citizen}
      relationships={getRelationships(snap, "ada")}
      story={buildStorySummary(snap, "ada")}
      timeline={timeline}
      chains={chains}
      confidenceByDecision={confidenceByDecision}
    />
  );
}
