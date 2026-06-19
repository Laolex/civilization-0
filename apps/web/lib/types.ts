export type ChainNodeKind = "memory" | "belief" | "compute" | "decision" | "event" | "storage";

export interface ChainNode {
  kind: ChainNodeKind;
  title: string;
  detail: Record<string, string>;
  weight?: number;
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
