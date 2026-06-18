import { describe, it, expect } from "vitest";
import { InMemoryWorldStore } from "@civ/store";
import { FakeEmbedder, MemoryIndex } from "./index";

describe("MemoryIndex", () => {
  it("retrieves the most relevant memories first", () => {
    const store = new InMemoryWorldStore();
    const emb = new FakeEmbedder();
    const add = (id: string, summary: string, importance: number) =>
      store.addMemory({ id, citizenId: "ada", day: 1, type: "event", importance, summary, embedding: emb.embed(summary) });
    add("m1", "lost job during recession", 8);
    add("m2", "ate lunch at a cafe", 2);
    add("m3", "marcus offered funding for a company", 9);

    const index = new MemoryIndex(store, emb);
    const top = index.retrieve("ada", "should I start a company with funding", 2);
    expect(top).toHaveLength(2);
    expect(top.map((m) => m.id)).toContain("m3");
    expect(top[0].id).toBe("m3"); // funding/company is most relevant + high importance
  });

  it("only returns the citizen's own memories", () => {
    const store = new InMemoryWorldStore();
    const emb = new FakeEmbedder();
    store.addMemory({ id: "x", citizenId: "bob", day: 1, type: "event", importance: 9, summary: "company funding", embedding: emb.embed("company funding") });
    const index = new MemoryIndex(store, emb);
    expect(index.retrieve("ada", "company funding", 5)).toHaveLength(0);
  });
});
