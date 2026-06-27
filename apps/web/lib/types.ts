export type ChainNodeKind = "memory" | "belief" | "social" | "compute" | "decision" | "event" | "storage";

export interface SocialDriverView {
  id: string; name: string;
  relationshipStrength: number; relevance: number; blendedScore: number;
  trust: number; influence: number; neighborText: string;
}
export interface OrgDriverView { id: string; name: string; action?: string; reasoning?: string; }

export interface ChainNode {
  kind: ChainNodeKind;
  title: string;
  detail: Record<string, string>;
  weight?: number;
  /** Present only on the "social" node. */
  socialDrivers?: SocialDriverView[];
  socialQuery?: string;
  orgDriver?: OrgDriverView;
}

export interface CausalChainView {
  decisionId: string;
  nodes: ChainNode[];
  rootHash?: string;
  txHash?: string;
}

export interface TimelineEntry {
  eventId: string;
  day: number;
  label: string;
  decisionId: string | null;
}
