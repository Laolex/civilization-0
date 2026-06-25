// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WorldEventBox } from "./WorldEventBox";

beforeEach(() => {
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ id: "iv1" }), { status: 201 })) as never;
});

describe("WorldEventBox", () => {
  it("posts the world event and shows confirmation", async () => {
    render(<WorldEventBox worldId="genesis" />);
    fireEvent.change(screen.getByPlaceholderText(/headline/i), { target: { value: "A great flood" } });
    fireEvent.click(screen.getByRole("button", { name: /set/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(await screen.findByText(/the world will feel this/i)).toBeTruthy();
  });

  it("does not post empty input", async () => {
    render(<WorldEventBox worldId="genesis" />);
    fireEvent.click(screen.getByRole("button", { name: /set/i }));
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
