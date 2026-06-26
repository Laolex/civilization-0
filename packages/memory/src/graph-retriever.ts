import { cosineSimilarity, type NeighborSummary, type ScoredNeighbor } from "@civ/shared";
import type { Embedder } from "./index";

const RELEVANCE_FLOOR = Number(process.env.RELEVANCE_FLOOR ?? "0.1");

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

function neighborText(n: NeighborSummary): string {
  return [n.name, n.latestAction, n.latestReasoning, n.topGoal, n.strongestBelief]
    .filter(Boolean).join(" ");
}

/** Pure, deterministic query-aware 1-hop neighbor selection. No network. */
export class GraphRetriever {
  constructor(private readonly embedder: Embedder) {}

  selectNeighbors(candidates: NeighborSummary[], query: string, k: number): ScoredNeighbor[] {
    if (candidates.length === 0 || k <= 0) return [];
    const q = this.embedder.embed(query);
    const scored: ScoredNeighbor[] = candidates.map((summary) => {
      const relationshipStrength = clamp01((summary.relationship.trust + summary.relationship.influence) / 200);
      const raw = cosineSimilarity(this.embedder.embed(neighborText(summary)), q);
      const relevance = Math.max(RELEVANCE_FLOOR, Math.min(1, raw));
      return { summary, relationshipStrength, relevance, blendedScore: relationshipStrength * relevance };
    });
    scored.sort((a, b) =>
      b.blendedScore - a.blendedScore ||
      b.relationshipStrength - a.relationshipStrength ||
      a.summary.id.localeCompare(b.summary.id));
    return scored.slice(0, k);
  }
}
