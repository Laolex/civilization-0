import type { ExecutionMeta } from "@civ/shared";

// Pure data types for the provenance record. Deliberately free of any
// @civ/brain dependency so the keyless read/verify path (and the web app that
// uses it) never pulls the compute-coupled orchestrator into its bundle.

export interface TraceMemory {
  id: string;
  summary: string;
  importance?: number;
}

export interface TraceBelief {
  id: string;
  statement: string;
  confidence?: number;
}

export interface TraceInput {
  /** Stable id for the agent making the decision. */
  agent: string;
  /** The question the agent is deciding on. */
  question: string;
  /** Candidate memories the agent retrieved as context. */
  memories?: TraceMemory[];
  /** Candidate beliefs that form the agent's worldview. */
  beliefs?: TraceBelief[];
  /** The action space the agent may choose from. */
  actions: string[];
  /** Optional role framing for the reasoning prompt. */
  occupation?: string;
}

export interface Driver {
  id: string;
  weight: number;
}

export interface TraceDrivers {
  memories: Driver[];
  beliefs: Driver[];
}

export interface ProvenanceDecision {
  action: string;
  targetId: string | null;
  reasoning: string;
}

/** The exact JSON envelope archived to 0G Storage and recovered on verify. */
export interface ProvenanceRecord {
  schema: "civ.provenance/v0";
  agent: string;
  question: string;
  decision: ProvenanceDecision;
  drivers: TraceDrivers;
  meta?: ExecutionMeta;
}

export interface TraceResult {
  decision: ProvenanceDecision;
  drivers: TraceDrivers;
  verified: boolean;
  rootHash: string;
  txHash: string;
  verifyUrl: string;
  record: ProvenanceRecord;
}
