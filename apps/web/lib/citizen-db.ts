import type { CausalChainView, ChainNode, SocialDriverView, OrgDriverView } from "./types";

export interface RawChainInput {
  decisionId: string; action: string; targetId: string | null; reasoning: string;
  provider: string; model: string; verified: boolean;
  memories: { id: string; summary: string; day: number; weight: number }[];
  beliefs: { id: string; statement: string; confidence: number; weight: number }[];
  event: { id: string; day: number; type: string; targetId: string | null } | null;
  rootHash: string | null; txHash: string | null;
  socialDrivers?: SocialDriverView[];
  socialQuery?: string;
  orgDriver?: OrgDriverView;
}

export function socialNode(
  drivers: SocialDriverView[] | undefined,
  socialQuery: string | undefined,
  orgDriver: OrgDriverView | undefined,
): ChainNode | null {
  const hasSocial = (drivers?.length ?? 0) > 0 || !!orgDriver;
  if (!hasSocial) return null;
  return {
    kind: "social",
    title: "Social context",
    weight: drivers?.length ? Math.max(...drivers.map((d) => d.blendedScore)) : undefined,
    detail: {
      query: socialQuery ?? "—",
      neighbors: String(drivers?.length ?? 0),
      ...(orgDriver ? { org: orgDriver.name } : {}),
    },
    socialDrivers: drivers ?? [],
    socialQuery,
    orgDriver,
  };
}

export function toCausalChain(raw: RawChainInput): CausalChainView {
  const nodes: ChainNode[] = [];
  for (const m of raw.memories)
    nodes.push({ kind: "memory", title: `Memory ${m.id}`, weight: m.weight, detail: { summary: m.summary, weight: m.weight.toFixed(2), day: String(m.day) } });
  for (const b of raw.beliefs)
    nodes.push({ kind: "belief", title: `Belief ${b.id}`, weight: b.weight, detail: { statement: b.statement, weight: b.weight.toFixed(2), confidence: b.confidence.toFixed(2) } });
  const social = socialNode(raw.socialDrivers, raw.socialQuery, raw.orgDriver);
  if (social) nodes.push(social);
  nodes.push({ kind: "compute", title: "0G Compute", detail: { provider: raw.provider, model: raw.model, verified: String(raw.verified) } });
  nodes.push({ kind: "decision", title: "Decision", detail: { action: raw.action, target: raw.targetId ?? "—", reasoning: raw.reasoning } });
  nodes.push({ kind: "event", title: "Event", detail: { type: raw.event?.type ?? "—", day: raw.event ? String(raw.event.day) : "—" } });
  nodes.push({ kind: "storage", title: "0G Storage", detail: { rootHash: raw.rootHash ?? "—", txHash: raw.txHash ?? "—" } });
  return { decisionId: raw.decisionId, nodes, rootHash: raw.rootHash ?? undefined, txHash: raw.txHash ?? undefined };
}
