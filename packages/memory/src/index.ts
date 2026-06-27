import { cosineSimilarity, type Memory } from "@civ/shared";
import type { WorldStore } from "@civ/store";

export interface Embedder { embed(text: string): number[]; }

const DIM = 64;

function tokenBucket(token: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) { h ^= token.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) % DIM;
}

/** Deterministic bag-of-tokens embedding — no network, stable across runs. */
export class FakeEmbedder implements Embedder {
  embed(text: string): number[] {
    const v = new Array<number>(DIM).fill(0);
    for (const raw of text.toLowerCase().split(/\W+/)) {
      if (!raw) continue;
      v[tokenBucket(raw)] += 1;
    }
    return v;
  }
}

export class MemoryIndex {
  constructor(private readonly store: WorldStore, private readonly embedder: Embedder) {}

  retrieve(citizenId: string, queryText: string, k: number): Memory[] {
    const q = this.embedder.embed(queryText);
    return this.store
      .getMemories(citizenId)
      .map((m) => ({ m, score: cosineSimilarity(q, m.embedding) * (1 + m.importance / 10) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map((x) => x.m);
  }
}

export { GraphRetriever } from "./graph-retriever";
