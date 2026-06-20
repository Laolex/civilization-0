import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool } from "./pool";
import { migrate } from "./migrate";
import { resetWorld } from "./testutil";
import { NarrativeRepository } from "./narrative-repository";
import { readNarrative } from "./read";

const repo = new NarrativeRepository();
beforeAll(async () => { await migrate(); await resetWorld(); });
afterAll(async () => { await closePool(); });

describe("NarrativeRepository + readNarrative", () => {
  it("saves a narrative and reads back the newest", async () => {
    await repo.saveNarrative({ id: "n1", subjectId: "ada", kind: "life_story", day: 5, text: "Old.", rootHash: "0x1" });
    await repo.saveNarrative({ id: "n2", subjectId: "ada", kind: "life_story", day: 12, text: "Newest.", rootHash: "0x2", txHash: "0xtx" });
    const v = await readNarrative(getPool(), "ada", "life_story");
    expect(v).toMatchObject({ id: "n2", text: "Newest.", rootHash: "0x2", day: 12 });
  });
  it("returns null when none exist", async () => {
    expect(await readNarrative(getPool(), "nobody", "life_story")).toBeNull();
  });
});
