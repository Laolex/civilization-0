// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
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

  it("re-enables the button only after the cooldown elapses", async () => {
    vi.useFakeTimers();
    try {
      global.fetch = vi.fn(async () =>
        new Response(JSON.stringify({ error: "cooldown", retryAfterMs: 2000 }), { status: 429 })) as never;
      render(<AdvanceWorldButton worldId="w1" />);
      fireEvent.click(screen.getByRole("button", { name: /advance the world/i }));
      // Wait for the 429 response to be processed (real promise resolution)
      await act(async () => { await Promise.resolve(); });
      const btn = screen.getByRole("button", { name: /advance the world/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      expect(screen.getByText(/wait/i)).toBeTruthy();
      // Advance one tick at a time so React re-renders between each timeout
      await act(async () => { vi.advanceTimersByTime(1000); });
      await act(async () => { vi.advanceTimersByTime(1100); });
      expect((screen.getByRole("button", { name: /advance the world/i }) as HTMLButtonElement).disabled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
