import { describe, it, expect, vi, beforeEach } from "vitest";

const user = { id: "u1", plan: "free", email: null, wallet: null, hasApiKey: false };
vi.mock("../../../lib/auth", () => ({ getCurrentUser: vi.fn(async () => user) }));
vi.mock("@civ/persistence/src/read", () => ({ readWorld: vi.fn(async () => ({ id: "w1", ownerId: "u1", name: "W", visibility: "private", populationCap: 50, population: 1 })) }));
const enqueue = vi.fn(async (i) => ({ ...i, status: "pending", appliedDay: null, payload: i.payload }));
vi.mock("@civ/persistence/src/intervention-write", () => ({ enqueueIntervention: (i: unknown) => enqueue(i), listInterventions: vi.fn(async () => []) }));
vi.mock("@civ/persistence/src/pool", () => ({ getPool: () => ({ query: async () => ({ rows: [{ world_id: "w1" }] }) }) }));

import { POST, GET } from "./route";
const req = (body: unknown) => new Request("http://x/api/interventions", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => { enqueue.mockClear(); });

describe("POST /api/interventions", () => {
  it("enqueues a valid whisper (201)", async () => {
    const res = await POST(req({ worldId: "w1", type: "whisper", targetCitizenId: "ada", text: "trust Marcus less" }));
    expect(res.status).toBe(201);
    expect(enqueue).toHaveBeenCalledOnce();
  });
  it("rejects empty text (400)", async () => {
    const res = await POST(req({ worldId: "w1", type: "whisper", targetCitizenId: "ada", text: "" }));
    expect(res.status).toBe(400);
  });
  it("rejects over-cap text (400)", async () => {
    const res = await POST(req({ worldId: "w1", type: "whisper", targetCitizenId: "ada", text: "x".repeat(281) }));
    expect(res.status).toBe(400);
  });
  it("returns 403 for non-owner on private world", async () => {
    const { getCurrentUser } = await import("../../../lib/auth");
    vi.mocked(getCurrentUser).mockResolvedValueOnce({ id: "u2", plan: "free", email: null, wallet: null, hasApiKey: false });
    const res = await POST(req({ worldId: "w1", type: "whisper", targetCitizenId: "ada", text: "trust Marcus less" }));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/interventions — world_event", () => {
  it("enqueues a valid world_event (201) with no targetCitizenId", async () => {
    const res = await POST(req({ worldId: "w1", type: "world_event", headline: "A great flood" }));
    expect(res.status).toBe(201);
    expect(enqueue).toHaveBeenCalledOnce();
    const arg = enqueue.mock.calls[0][0];
    expect(arg.type).toBe("world_event");
    expect(arg.payload).toEqual({ headline: "A great flood" });
    expect(arg.targetCitizenId ?? null).toBeNull();
  });
  it("rejects empty headline (400)", async () => {
    const res = await POST(req({ worldId: "w1", type: "world_event", headline: "" }));
    expect(res.status).toBe(400);
  });
  it("rejects over-cap headline (400)", async () => {
    const res = await POST(req({ worldId: "w1", type: "world_event", headline: "x".repeat(141) }));
    expect(res.status).toBe(400);
  });
  it("rejects an unknown type (400)", async () => {
    const res = await POST(req({ worldId: "w1", type: "dilemma", headline: "x" }));
    expect(res.status).toBe(400);
  });
  it("returns 404 when world is missing (world_event)", async () => {
    const { readWorld } = await import("@civ/persistence/src/read");
    vi.mocked(readWorld).mockResolvedValueOnce(null);
    const res = await POST(req({ worldId: "w1", type: "world_event", headline: "A great flood" }));
    expect(res.status).toBe(404);
    expect(enqueue).not.toHaveBeenCalled();
  });
  it("returns 403 when user is not authorized (world_event)", async () => {
    const { getCurrentUser } = await import("../../../lib/auth");
    vi.mocked(getCurrentUser).mockResolvedValueOnce({ id: "u2", plan: "free", email: null, wallet: null, hasApiKey: false });
    const res = await POST(req({ worldId: "w1", type: "world_event", headline: "A great flood" }));
    expect(res.status).toBe(403);
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe("GET /api/interventions", () => {
  it("returns 200 with list for authorized user", async () => {
    const res = await GET(new Request("http://x/api/interventions?worldId=w1"));
    expect(res.status).toBe(200);
  });
  it("returns 400 when worldId missing", async () => {
    const res = await GET(new Request("http://x/api/interventions"));
    expect(res.status).toBe(400);
  });
});
