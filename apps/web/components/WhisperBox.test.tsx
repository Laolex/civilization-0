// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WhisperBox } from "./WhisperBox";

beforeEach(() => {
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ id: "iv1" }), { status: 201 })) as never;
});

describe("WhisperBox", () => {
  it("posts the whisper and shows confirmation", async () => {
    render(<WhisperBox worldId="w1" citizenId="ada" citizenName="Ada" />);
    fireEvent.change(screen.getByPlaceholderText(/whisper/i), { target: { value: "trust Marcus less" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(await screen.findByText(/Ada will hear/i)).toBeTruthy();
  });

  it("blocks empty and over-cap input", async () => {
    render(<WhisperBox worldId="w1" citizenId="ada" citizenName="Ada" />);
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
