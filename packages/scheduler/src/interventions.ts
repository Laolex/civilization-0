import { ALL_ACTIONS, type ActionType, type Memory } from "@civ/shared";
import type { Embedder } from "@civ/memory";
import type { Intervention } from "@civ/persistence/src/intervention-write";

const MAX_HEADLINE = 140;

export interface DrainDeps {
  pending(): Promise<Intervention[]>;
  applyWhisper(iv: Intervention, day: number): Promise<void>;
  applyWorldEvent?(iv: Intervention, day: number): Promise<void>;
  applyDilemma?(iv: Intervention, day: number): Promise<void>;
  applyTickRequest?(iv: Intervention, day: number): Promise<void>;
  markApplied(id: string, day: number): Promise<void>;
  markFailed(id: string): Promise<void>;
}

export async function drainInterventions(deps: DrainDeps, day: number): Promise<{ applied: number; failed: number; targets: string[] }> {
  let applied = 0, failed = 0;
  // Citizens named by a just-applied whisper/dilemma. The caller force-ticks
  // these THIS day so the intervention lands on the target's very next tick
  // instead of waiting for their tier cadence to bring them up (tier-2 = every
  // 3 days, tier-1 = every 7) — which made a single forced tick look inert.
  const targets = new Set<string>();
  for (const iv of await deps.pending()) {
    const applier =
      iv.type === "whisper" ? deps.applyWhisper :
      iv.type === "world_event" ? deps.applyWorldEvent :
      iv.type === "dilemma" ? deps.applyDilemma :
      iv.type === "tick_request" ? deps.applyTickRequest :
      undefined;
    if (!applier) continue; // unknown types left pending for later sub-projects
    try {
      await applier(iv, day);
      if ((iv.type === "whisper" || iv.type === "dilemma") && iv.targetCitizenId) {
        targets.add(iv.targetCitizenId);
      }
      try {
        await deps.markApplied(iv.id, day);
        applied++;
      } catch (err) {
        console.warn(`Failed to mark intervention ${iv.id} as applied:`, err);
        applied++;
      }
    } catch {
      try {
        await deps.markFailed(iv.id);
        failed++;
      } catch (err) {
        console.warn(`Failed to mark intervention ${iv.id} as failed:`, err);
        failed++;
      }
    }
  }
  return { applied, failed, targets: [...targets] };
}

export function makeWhisperApplier(
  repo: { getCitizenWorldId(id: string): Promise<string | null>; addPinnedMemory(m: Memory): Promise<void> },
  embedder: Embedder,
) {
  return async (iv: Intervention, day: number): Promise<void> => {
    const citizenId = iv.targetCitizenId;
    const text = typeof iv.payload.text === "string" ? iv.payload.text : "";
    if (!citizenId || !text) throw new Error("whisper missing target or text");
    const world = await repo.getCitizenWorldId(citizenId);
    if (world !== iv.worldId) throw new Error("target citizen not in intervention world");
    await repo.addPinnedMemory({
      // Deterministic id keyed off the intervention so a re-apply (e.g. if
      // markApplied failed and the row stayed pending) collides on the PK and
      // is dropped by addPinnedMemory's ON CONFLICT (id) DO NOTHING — a whisper
      // is force-included into exactly one decision.
      id: `wh-${iv.id}`, citizenId, day, type: "relationship", importance: 10,
      summary: text, embedding: embedder.embed(text), pinned: true,
    });
  };
}

export function makeWorldEventApplier(
  repo: { setWorldHeadline(worldId: string, headline: string): Promise<void> },
) {
  return async (iv: Intervention, _day: number): Promise<void> => {
    const raw = typeof iv.payload.headline === "string" ? iv.payload.headline : "";
    const headline = raw.trim();
    if (!headline) throw new Error("world_event missing headline");
    if (headline.length > MAX_HEADLINE) throw new Error(`world_event headline exceeds ${MAX_HEADLINE} chars`);
    await repo.setWorldHeadline(iv.worldId, headline);
  };
}

export function makeDilemmaApplier(
  repo: {
    getCitizenWorldId(id: string): Promise<string | null>;
    setForcedActions(citizenId: string, actions: ActionType[]): Promise<void>;
    addPinnedMemory(m: Memory): Promise<void>;
  },
  embedder: Embedder,
) {
  return async (iv: Intervention, day: number): Promise<void> => {
    const citizenId = iv.targetCitizenId;
    const text = typeof iv.payload.text === "string" ? iv.payload.text.trim() : "";
    const rawActions = iv.payload.actions;
    if (!citizenId || !text) throw new Error("dilemma missing target or text");
    if (!Array.isArray(rawActions)) throw new Error("dilemma missing actions");
    const actions = rawActions.filter(
      (a): a is ActionType => typeof a === "string" && (ALL_ACTIONS as string[]).includes(a));
    // A real choice means 2+ valid verbs, and no junk verbs slipped through.
    if (actions.length < 2 || actions.length !== rawActions.length) {
      throw new Error("dilemma actions must be 2+ valid action verbs");
    }
    const world = await repo.getCitizenWorldId(citizenId);
    if (world !== iv.worldId) throw new Error("target citizen not in intervention world");
    await repo.setForcedActions(citizenId, actions);
    await repo.addPinnedMemory({
      // Deterministic id keyed off the intervention so a re-apply collides on the
      // PK and is dropped by addPinnedMemory's ON CONFLICT (id) DO NOTHING.
      id: `dl-${iv.id}`, citizenId, day, type: "relationship", importance: 10,
      summary: text, embedding: embedder.embed(text), pinned: true,
    });
  };
}

/** A tick_request's only job is to cause the scheduler run; applying it is a no-op. */
export function makeTickRequestApplier() {
  return async (_iv: Intervention, _day: number): Promise<void> => {};
}
