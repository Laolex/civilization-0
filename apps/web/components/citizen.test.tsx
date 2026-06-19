// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { loadSnapshot } from "../lib/snapshot";
import { getCitizen, buildStorySummary, getTimeline, getRelationships } from "../lib/world";
import { CitizenView } from "./CitizenView";

const snap = loadSnapshot();
const citizen = getCitizen(snap, "ada")!;
const story = buildStorySummary(snap, "ada");
const timeline = getTimeline(snap, "ada");
const relationships = getRelationships(snap, "ada");

describe("CitizenView — render smoke", () => {
  it("shows Ada and her occupation", () => {
    render(
      <CitizenView
        citizen={citizen}
        relationships={relationships}
        story={story}
        timeline={timeline}
        chains={{}}
        confidenceByDecision={{}}
      />
    );
    expect(screen.getByText("Ada")).toBeDefined();
    expect(screen.getByText(/Engineer/)).toBeDefined();
  });

  it("story mentions 0G Compute and 0G Storage", () => {
    render(
      <CitizenView
        citizen={citizen}
        relationships={relationships}
        story={story}
        timeline={timeline}
        chains={{}}
        confidenceByDecision={{}}
      />
    );
    expect(screen.getByText(/0G Compute/)).toBeDefined();
    expect(screen.getByText(/0G Storage/)).toBeDefined();
  });
});
