import type { Memory } from "@civ/shared";
import type { Embedder } from "@civ/memory";
import type { Intervention } from "@civ/persistence/src/intervention-write";

const MAX_HEADLINE = 140;

export interface DrainDeps {
  pending(): Promise<Intervention[]>;
  applyWhisper(iv: Intervention, day: number): Promise<void>;
  applyWorldEvent?(iv: Intervention, day: number): Promise<void>;
  markApplied(id: string, day: number): Promise<void>;
  markFailed(id: string): Promise<void>;
}

export async function drainInterventions(deps: DrainDeps, day: number): Promise<{ applied: number; failed: number }> {
  let applied = 0, failed = 0;
  for (const iv of await deps.pending()) {
    const applier =
      iv.type === "whisper" ? deps.applyWhisper :
      iv.type === "world_event" ? deps.applyWorldEvent :
      undefined;
    if (!applier) continue; // unknown types left pending for later sub-projects
    try {
      await applier(iv, day);
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
  return { applied, failed };
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
