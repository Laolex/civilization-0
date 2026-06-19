import type { WorldSnapshot, WorldEvent } from "@civ/shared";
import type { CausalChainView, ChainNode, TimelineEntry } from "./types";

export function getCitizen(s: WorldSnapshot, id: string) {
  return s.citizens.find((c) => c.id === id);
}
export function getRelationships(s: WorldSnapshot, id: string) {
  return s.relationships.filter((r) => r.citizenId === id);
}

function eventLabel(s: WorldSnapshot, e: WorldEvent): string {
  const payloadLabel = (e.payload as Record<string, unknown>)?.label;
  if (typeof payloadLabel === "string") return payloadLabel;
  const target = e.targetId ? getCitizen(s, e.targetId)?.name ?? e.targetId : null;
  const verb = e.type.replace(/_/g, " ");
  return target ? `${verb[0].toUpperCase()}${verb.slice(1)} ${target}` : `${verb[0].toUpperCase()}${verb.slice(1)}`;
}

export function getTimeline(s: WorldSnapshot, citizenId: string): TimelineEntry[] {
  return s.events
    .filter((e) => e.actorId === citizenId)
    .slice()
    .sort((a, b) => a.day - b.day)
    .map((e) => ({ eventId: e.id, day: e.day, label: eventLabel(s, e), decisionId: e.decisionId }));
}

export function getCausalChain(s: WorldSnapshot, decisionId: string): CausalChainView {
  const decision = s.decisions.find((d) => d.id === decisionId);
  if (!decision) throw new Error(`unknown decision ${decisionId}`);
  const event = s.events.find((e) => e.decisionId === decisionId);
  const trace = s.traces.find((t) => t.decisionId === decisionId);

  const nodes: ChainNode[] = [];

  for (const dm of s.decisionMemories.filter((r) => r.decisionId === decisionId)) {
    const m = s.memories.find((x) => x.id === dm.memoryId);
    if (m) nodes.push({ kind: "memory", title: `Memory ${m.id}`, weight: dm.weight, detail: { summary: m.summary, weight: dm.weight.toFixed(2), day: String(m.day) } });
  }
  for (const db of s.decisionBeliefs.filter((r) => r.decisionId === decisionId)) {
    const b = s.beliefs.find((x) => x.id === db.beliefId);
    if (b) nodes.push({ kind: "belief", title: `Belief ${b.id}`, weight: db.weight, detail: { statement: b.statement, weight: db.weight.toFixed(2), confidence: b.confidence.toFixed(2) } });
  }
  const meta = decision.meta;
  nodes.push({ kind: "compute", title: "0G Compute", detail: { provider: meta?.provider ?? decision.brainProvider, model: meta?.model ?? decision.brainModel, verified: String(meta?.verified ?? false) } });
  nodes.push({ kind: "decision", title: "Decision", detail: { action: decision.action, target: decision.targetId ?? "—", reasoning: decision.reasoning } });
  nodes.push({ kind: "event", title: "Event", detail: { label: event ? eventLabel(s, event) : "—", day: event ? String(event.day) : "—" } });
  nodes.push({ kind: "storage", title: "0G Storage", detail: { rootHash: trace?.zgRootHash ?? "—", txHash: trace?.zgTxHash ?? "—" } });

  return { decisionId, nodes, rootHash: trace?.zgRootHash, txHash: trace?.zgTxHash };
}

export function buildStorySummary(s: WorldSnapshot, citizenId: string): string {
  const c = getCitizen(s, citizenId);
  if (!c) return "";
  const decision = s.decisions.find((d) => d.citizenId === citizenId);
  const target = decision?.targetId ? getCitizen(s, decision.targetId)?.name ?? decision.targetId : "someone";
  const keyMemory = s.memories.filter((m) => m.citizenId === citizenId).sort((a, b) => b.importance - a.importance)[0];
  const belief = s.beliefs.find((b) => b.citizenId === citizenId);
  const parts = [
    keyMemory ? `${keyMemory.summary}.` : "",
    belief ? `Over time ${c.name} formed the belief that ${belief.statement.toLowerCase()}.` : "",
    `That belief fed into a decision reasoned and cryptographically verified on 0G Compute.`,
    decision ? `${c.name} ultimately chose to ${decision.action} ${decision.targetId ? `with ${target}` : ""} — and the complete reasoning trace was archived on 0G Storage, where anyone can replay and verify it.` : "",
  ];
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export function decisionConfidence(chain: CausalChainView): number {
  const weights = chain.nodes.map((n) => n.weight).filter((w): w is number => typeof w === "number");
  if (weights.length === 0) return 0;
  const mean = weights.reduce((a, b) => a + b, 0) / weights.length;
  return Math.round(mean * 100);
}
