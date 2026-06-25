import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPool, closePool } from "./pool";
import {
  enqueueIntervention, pendingInterventions, listInterventions,
  markInterventionApplied,
} from "./intervention-write";

const wid = "itest-world", uid = "itest-user";

beforeAll(async () => {
  await getPool().query("DELETE FROM interventions WHERE world_id = $1", [wid]);
});
afterAll(async () => {
  await getPool().query("DELETE FROM interventions WHERE world_id = $1", [wid]);
  await closePool();
});

describe("intervention persistence", () => {
  it("enqueues, lists pending, and marks applied", async () => {
    const row = await enqueueIntervention({ id: `iv-${Date.now()}`, worldId: wid, userId: uid,
      type: "whisper", targetCitizenId: "ada", payload: { text: "trust Marcus less" } });
    expect(row.status).toBe("pending");
    expect(row.payload.text).toBe("trust Marcus less");

    const pend = await pendingInterventions();
    expect(pend.some((p) => p.id === row.id)).toBe(true);

    await markInterventionApplied(row.id, 7);
    const listed = await listInterventions(wid, 10);
    const found = listed.find((p) => p.id === row.id)!;
    expect(found.status).toBe("applied");
    expect(found.appliedDay).toBe(7);
  });
});
