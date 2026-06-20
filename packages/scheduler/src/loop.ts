import type { InMemoryWorldStore } from "@civ/store";
import type { TickDeps } from "@civ/engine";
import { runCitizenTick } from "@civ/engine";
import type { WorldRepository } from "@civ/persistence";
import { selectTickers, type Ticker } from "./select";

export interface DayDeps {
  repo: WorldRepository;
  makeTickDeps: (store: InMemoryWorldStore, day: number) => TickDeps;
  citizens: Ticker[];
}

export async function runDay(deps: DayDeps, day: number): Promise<{ ticked: string[] }> {
  const ids = selectTickers(deps.citizens, day);
  for (const id of ids) {
    const store = await deps.repo.loadContext(id);
    const result = await runCitizenTick(deps.makeTickDeps(store, day), id);
    await deps.repo.persistTick(store, result, id);
  }
  await deps.repo.setDay(day);
  return { ticked: ids };
}
