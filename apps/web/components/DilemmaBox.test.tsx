// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DilemmaBox } from "./DilemmaBox";

beforeEach(() => {
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ id: "iv1" }), { status: 201 })) as never;
});

describe("DilemmaBox", () => {
  it("does not post until 2+ actions are selected", async () => {
    render(<DilemmaBox worldId="genesis" citizenId="ada" citizenName="Ada" />);
    fireEvent.change(screen.getByPlaceholderText(/frame the choice/i), { target: { value: "Stay or go?" } });
    fireEvent.click(screen.getByLabelText("work")); // only one action → button stays disabled
    fireEvent.click(screen.getByRole("button", { name: /force dilemma/i }));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("posts the framing text + selected actions and shows confirmation", async () => {
    render(<DilemmaBox worldId="genesis" citizenId="ada" citizenName="Ada" />);
    fireEvent.change(screen.getByPlaceholderText(/frame the choice/i), { target: { value: "Stay or go?" } });
    fireEvent.click(screen.getByLabelText("work"));
    fireEvent.click(screen.getByLabelText("quit_job"));
    fireEvent.click(screen.getByRole("button", { name: /force dilemma/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const fetchMock = global.fetch as unknown as { mock: { calls: unknown[][] } };
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.type).toBe("dilemma");
    expect(body.text).toBe("Stay or go?");
    expect(body.actions).toEqual(["work", "quit_job"]);
    expect(await screen.findByText(/will face this/i)).toBeTruthy();
  });
});
