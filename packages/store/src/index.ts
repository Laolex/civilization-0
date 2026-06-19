import type {
  Belief, Citizen, Decision, DecisionBelief, DecisionMemory, DecisionTrace,
  Goal, Memory, Relationship, WorldEvent, WorldState, WorldSnapshot,
} from "@civ/shared";

export interface WorldStore {
  getCitizen(id: string): Citizen | undefined;
  upsertCitizen(c: Citizen): void;
  getActiveGoal(citizenId: string): Goal | undefined;
  upsertGoal(g: Goal): void;
  getRelationships(citizenId: string): Relationship[];
  upsertRelationship(r: Relationship): void;
  getMemories(citizenId: string): Memory[];
  addMemory(m: Memory): void;
  updateMemoryArchive(id: string, rootHash: string, txHash: string): void;
  getBeliefs(citizenId: string): Belief[];
  upsertBelief(b: Belief): void;
  addDecision(d: Decision): void;
  addDecisionMemories(rows: DecisionMemory[]): void;
  addDecisionBeliefs(rows: DecisionBelief[]): void;
  getDecisionMemories(decisionId: string): DecisionMemory[];
  getDecisionBeliefs(decisionId: string): DecisionBelief[];
  addEvent(e: WorldEvent): void;
  getEvent(id: string): WorldEvent | undefined;
  updateEventArchive(id: string, rootHash: string, txHash: string): void;
  addTrace(t: DecisionTrace): void;
  getTrace(decisionId: string): DecisionTrace | undefined;
  updateTraceArchive(id: string, rootHash: string, txHash: string): void;
  getWorldState(): WorldState;
  setWorldState(w: WorldState): void;
  snapshot(): WorldSnapshot;
}

export class InMemoryWorldStore implements WorldStore {
  private citizens = new Map<string, Citizen>();
  private goals = new Map<string, Goal>();
  private relationships: Relationship[] = [];
  private memories: Memory[] = [];
  private beliefs = new Map<string, Belief>();
  private decisions: Decision[] = [];
  private decisionMemories: DecisionMemory[] = [];
  private decisionBeliefs: DecisionBelief[] = [];
  private events = new Map<string, WorldEvent>();
  private traces: DecisionTrace[] = [];
  private world: WorldState = { day: 0, economy: {}, headline: "" };

  getCitizen(id: string) { return this.citizens.get(id); }
  upsertCitizen(c: Citizen) { this.citizens.set(c.id, c); }
  getActiveGoal(citizenId: string) {
    return [...this.goals.values()].find((g) => g.citizenId === citizenId && g.active);
  }
  upsertGoal(g: Goal) { this.goals.set(g.id, g); }
  getRelationships(citizenId: string) { return this.relationships.filter((r) => r.citizenId === citizenId); }
  upsertRelationship(r: Relationship) {
    const i = this.relationships.findIndex((x) => x.citizenId === r.citizenId && x.otherId === r.otherId);
    if (i >= 0) this.relationships[i] = r; else this.relationships.push(r);
  }
  getMemories(citizenId: string) { return this.memories.filter((m) => m.citizenId === citizenId); }
  addMemory(m: Memory) { this.memories.push(m); }
  updateMemoryArchive(id: string, rootHash: string, txHash: string) {
    const m = this.memories.find((x) => x.id === id);
    if (m) { m.zgRootHash = rootHash; m.zgTxHash = txHash; }
  }
  getBeliefs(citizenId: string) { return [...this.beliefs.values()].filter((b) => b.citizenId === citizenId); }
  upsertBelief(b: Belief) { this.beliefs.set(b.id, b); }
  addDecision(d: Decision) { this.decisions.push(d); }
  addDecisionMemories(rows: DecisionMemory[]) { this.decisionMemories.push(...rows); }
  addDecisionBeliefs(rows: DecisionBelief[]) { this.decisionBeliefs.push(...rows); }
  getDecisionMemories(decisionId: string) { return this.decisionMemories.filter((r) => r.decisionId === decisionId); }
  getDecisionBeliefs(decisionId: string) { return this.decisionBeliefs.filter((r) => r.decisionId === decisionId); }
  addEvent(e: WorldEvent) { this.events.set(e.id, e); }
  getEvent(id: string) { return this.events.get(id); }
  updateEventArchive(id: string, rootHash: string, txHash: string) {
    const e = this.events.get(id);
    if (e) { e.zgRootHash = rootHash; e.zgTxHash = txHash; }
  }
  addTrace(t: DecisionTrace) { this.traces.push(t); }
  getTrace(decisionId: string) { return this.traces.find((t) => t.decisionId === decisionId); }
  updateTraceArchive(id: string, rootHash: string, txHash: string) {
    const t = this.traces.find((x) => x.id === id);
    if (t) { t.zgRootHash = rootHash; t.zgTxHash = txHash; }
  }
  getWorldState() { return this.world; }
  setWorldState(w: WorldState) { this.world = w; }
  snapshot(): WorldSnapshot {
    return {
      capturedAt: new Date().toISOString(),
      citizens: [...this.citizens.values()],
      goals: [...this.goals.values()],
      relationships: [...this.relationships],
      memories: [...this.memories],
      beliefs: [...this.beliefs.values()],
      decisions: [...this.decisions],
      decisionMemories: [...this.decisionMemories],
      decisionBeliefs: [...this.decisionBeliefs],
      events: [...this.events.values()],
      traces: [...this.traces],
      worldState: { ...this.world },
    };
  }
}
