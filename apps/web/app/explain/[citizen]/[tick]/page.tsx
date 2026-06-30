import Link from "next/link";
import { getPool } from "@civ/persistence/src/pool";
import { buildExplainView } from "@civ/history/src/explainView";
import { ExplainPanel } from "../../ExplainPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ExplainPage({
  params, searchParams,
}: { params: { citizen: string; tick: string }; searchParams: { world?: string } }) {
  const world = searchParams.world ?? "default";
  const view = await buildExplainView(getPool(), world, params.citizen, Number(params.tick));

  return (
    <main className="board">
      <header className="board-head">
        <h1 className="board-title">Why this decision happened</h1>
        <p className="board-sub">
          An authenticated cognitive trace, reconstructed and chain-verified from the history log.
        </p>
      </header>

      {view ? (
        <section className="cz-section panel">
          <ExplainPanel view={view} />
        </section>
      ) : (
        <section className="cz-section">
          <p className="board-empty-body">
            No authenticated transition recorded for citizen{" "}
            <span className="mono">{params.citizen}</span> at tick{" "}
            <span className="mono">{params.tick}</span> in world <span className="mono">{world}</span>.
          </p>
        </section>
      )}

      <nav className="board-foot" aria-label="Navigation">
        <Link href={`/citizens/${params.citizen}`} className="board-foot-cta">◉ Citizen</Link>
        <span className="board-foot-spacer" />
        <Link href="/" className="board-foot-link mono">← Home</Link>
      </nav>
    </main>
  );
}
