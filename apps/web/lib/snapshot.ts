import type { WorldSnapshot } from "@civ/shared";
import world from "../data/world.json";

export function loadSnapshot(): WorldSnapshot {
  return world as unknown as WorldSnapshot;
}
