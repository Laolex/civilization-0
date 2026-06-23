import type { DecisionContext } from "@civ/brain";

export interface DecisionScenario {
  id: string;
  context: DecisionContext;
}

/**
 * A small curated set of decision situations that probe distinct trait/goal
 * combinations. Deterministic and committed in code so prompt changes can be
 * regression-tested. Grow this set (or harvest real decisions) over time.
 */
export const SEED_SCENARIOS: DecisionScenario[] = [
  {
    id: "ambitious-engineer-recession",
    context: {
      citizen: { id: "ada", name: "Ada", occupation: "Engineer", age: 29,
        traits: { ambition: 92, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 78 },
        wealth: 0, reputation: 50, tier: 3, createdDay: 0 },
      goal: { id: "g1", citizenId: "ada", kind: "wealth", description: "financial independence", progress: 0.1, active: true },
      memories: [
        { id: "m1", citizenId: "ada", day: 1, type: "event", importance: 8, summary: "lost job during the recession", embedding: [] },
        { id: "m2", citizenId: "ada", day: 2, type: "relationship", importance: 7, summary: "Marcus offered seed funding for a company", embedding: [] },
      ],
      beliefs: [{ id: "b1", citizenId: "ada", statement: "Marcus is trustworthy", confidence: 0.75, sourceMemoryIds: ["m2"], updatedDay: 2 }],
      relationships: [{ citizenId: "ada", otherId: "marcus", trust: 0.7, friendship: 0.4, influence: 0.5 }],
      worldState: { day: 3, economy: { inflation: 8 }, headline: "Recession deepens" },
      availableActions: ["work", "start_company", "invest", "partner"],
    },
  },
  {
    id: "loyal-clerk-tempted-to-betray",
    context: {
      citizen: { id: "ben", name: "Ben", occupation: "Clerk", age: 45,
        traits: { ambition: 25, empathy: 75, loyalty: 90, curiosity: 30, discipline: 70, riskTolerance: 20 },
        wealth: 5000, reputation: 60, tier: 2, createdDay: 0 },
      goal: { id: "g2", citizenId: "ben", kind: "stability", description: "keep a stable, respectable life", progress: 0.6, active: true },
      memories: [{ id: "m3", citizenId: "ben", day: 5, type: "relationship", importance: 6, summary: "a rival offered money to betray his employer", embedding: [] }],
      beliefs: [{ id: "b2", citizenId: "ben", statement: "loyalty is who I am", confidence: 0.9, sourceMemoryIds: ["m3"], updatedDay: 5 }],
      relationships: [{ citizenId: "ben", otherId: "rival", trust: 0.2, friendship: 0.1, influence: 0.3 }],
      worldState: { day: 6, economy: {}, headline: "Quiet season in town" },
      availableActions: ["work", "betray", "quit_job", "friend"],
    },
  },
  {
    id: "social-curious-newcomer",
    context: {
      citizen: { id: "cleo", name: "Cleo", occupation: "Artist", age: 24,
        traits: { ambition: 55, empathy: 85, loyalty: 50, curiosity: 95, discipline: 35, riskTolerance: 60 },
        wealth: 200, reputation: 30, tier: 3, createdDay: 0 },
      goal: { id: "g3", citizenId: "cleo", kind: "belonging", description: "build a community of collaborators", progress: 0.05, active: true },
      memories: [{ id: "m4", citizenId: "cleo", day: 2, type: "relationship", importance: 5, summary: "met a collective of artists forming an org", embedding: [] }],
      beliefs: [{ id: "b3", citizenId: "cleo", statement: "people are worth knowing", confidence: 0.8, sourceMemoryIds: ["m4"], updatedDay: 2 }],
      relationships: [{ citizenId: "cleo", otherId: "collective", trust: 0.5, friendship: 0.5, influence: 0.4 }],
      worldState: { day: 3, economy: {}, headline: "Arts district revival" },
      availableActions: ["meet", "friend", "join", "create_org", "work"],
    },
  },
  {
    id: "disciplined-founder-scaling",
    context: {
      citizen: { id: "dia", name: "Dia", occupation: "Founder", age: 38,
        traits: { ambition: 88, empathy: 55, loyalty: 60, curiosity: 65, discipline: 92, riskTolerance: 70 },
        wealth: 250000, reputation: 78, tier: 1, createdDay: 0 },
      goal: { id: "g4", citizenId: "dia", kind: "growth", description: "scale the company without losing the team", progress: 0.4, active: true },
      memories: [{ id: "m5", citizenId: "dia", day: 10, type: "relationship", importance: 7, summary: "a strong candidate wants to join the leadership team", embedding: [] }],
      beliefs: [{ id: "b4", citizenId: "dia", statement: "a great team beats a great idea", confidence: 0.85, sourceMemoryIds: ["m5"], updatedDay: 10 }],
      relationships: [{ citizenId: "dia", otherId: "candidate", trust: 0.6, friendship: 0.3, influence: 0.5 }],
      worldState: { day: 11, economy: { inflation: 3 }, headline: "Tech hiring rebounds" },
      availableActions: ["hire", "partner", "invest", "work", "create_org"],
    },
  },
  {
    id: "risk-averse-saver-volatile-market",
    context: {
      citizen: { id: "eve", name: "Eve", occupation: "Accountant", age: 52,
        traits: { ambition: 35, empathy: 50, loyalty: 65, curiosity: 40, discipline: 88, riskTolerance: 15 },
        wealth: 80000, reputation: 55, tier: 2, createdDay: 0 },
      goal: { id: "g5", citizenId: "eve", kind: "security", description: "protect retirement savings", progress: 0.7, active: true },
      memories: [{ id: "m6", citizenId: "eve", day: 8, type: "observation", importance: 8, summary: "a high-return but volatile investment is being pitched", embedding: [] }],
      beliefs: [{ id: "b5", citizenId: "eve", statement: "slow and safe wins", confidence: 0.92, sourceMemoryIds: ["m6"], updatedDay: 8 }],
      relationships: [{ citizenId: "eve", otherId: "broker", trust: 0.4, friendship: 0.2, influence: 0.3 }],
      worldState: { day: 9, economy: { inflation: 6 }, headline: "Markets swing wildly" },
      availableActions: ["work", "invest", "partner", "friend"],
    },
  },
];
