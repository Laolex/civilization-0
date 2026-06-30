// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AdvanceWorldButton } from "./AdvanceWorldButton";

beforeEach(() => { vi.restoreAllMocks(); });

describe("AdvanceWorldButton", () => {
  it("posts a tick_request and shows the queued state", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ id: "t1", status: "pending" }), { status: 201 })) as never;
    render(<AdvanceWorldButton worldId="w1" />);
    fireEvent.click(screen.getByRole("button", { name: /advance the world/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(await screen.findByText(/queued/i)).toBeTruthy();
    const body = JSON.parse((global.fetch as unknown as { mock: { calls: any[][] } }).mock.calls[0][1].body);
    expect(body).toMatchObject({ worldId: "w1", type: "tick_request" });
  });

  it("shows a cooldown message on 429", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "cooldown", retryAfterMs: 60000 }), { status: 429 })) as never;
    render(<AdvanceWorldButton worldId="w1" />);
    fireEvent.click(screen.getByRole("button", { name: /advance the world/i }));
    expect(await screen.findByText(/wait|cooldown/i)).toBeTruthy();
  });
});
