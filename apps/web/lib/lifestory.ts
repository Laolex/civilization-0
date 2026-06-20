export interface LifeEvent { day: number; type: string; targetId: string | null; reasoning: string | null; }
export interface LifeStoryInput { name: string; occupation: string; events: LifeEvent[]; }

export function buildLifeStory(input: LifeStoryInput): string[] {
  const lines: string[] = [];
  lines.push(`${input.name}, a ${input.occupation}, lives a recorded life on the persistent world.`);
  const ordered = [...input.events].sort((a, b) => a.day - b.day);
  for (const e of ordered) {
    const target = e.targetId ? ` ${e.targetId}` : "";
    const why = e.reasoning ? ` — "${e.reasoning}".` : ".";
    lines.push(`On day ${e.day}, ${input.name} chose to ${e.type}${target}${why}`);
  }
  const n = ordered.length;
  lines.push(n === 0
    ? `${input.name} has yet to act — but every future decision will be reasoned on 0G and kept on the permanent record.`
    : `${n} ${n === 1 ? "decision is" : "decisions are"} on the permanent 0G record, each reasoned and verifiable.`);
  return lines;
}
