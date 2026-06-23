import type { Memory } from "@civ/shared";
import type { Embedder } from "@civ/memory";
import type { Intervention } from "@civ/persistence/src/intervention-write";

export interface DrainDeps {
  pending(): Promise<Intervention[]>;
  applyWhisper(iv: Intervention, day: number): Promise<void>;
  markApplied(id: string, day: number): Promise<void>;
  markFailed(id: string): Promise<void>;
}

export async function drainInterventions(deps: DrainDeps, day: number): Promise<{ applied: number; failed: number }> {
  let applied = 0, failed = 0;
  for (const iv of await deps.pending()) {
    if (iv.type !== "whisper") continue; // other types handled by later sub-projects
    try {
      await deps.applyWhisper(iv, day);
      await deps.markApplied(iv.id, day);
      applied++;
    } catch {
      await deps.markFailed(iv.id);
      failed++;
    }
  }
  return { applied, failed };
}

export function makeWhisperApplier(
  repo: { getCitizenWorldId(id: string): Promise<string | null>; addPinnedMemory(m: Memory): Promise<void> },
  embedder: Embedder,
  idgen: () => string,
) {
  return async (iv: Intervention, day: number): Promise<void> => {
    const citizenId = iv.targetCitizenId;
    const text = typeof iv.payload.text === "string" ? iv.payload.text : "";
    if (!citizenId || !text) throw new Error("whisper missing target or text");
    const world = await repo.getCitizenWorldId(citizenId);
    if (world !== iv.worldId) throw new Error("target citizen not in intervention world");
    await repo.addPinnedMemory({
      id: idgen(), citizenId, day, type: "relationship", importance: 10,
      summary: text, embedding: embedder.embed(text), pinned: true,
    });
  };
}
