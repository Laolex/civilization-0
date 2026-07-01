import React from "react";
import Link from "next/link";
// Deep import: keyless verifier only — never pulls the compute SDK.
import { createVerifier } from "@civ/provenance/src/real-verify";
import type { ProvenanceRecord } from "@civ/provenance/src/record";
import { VerifyRecordView } from "../../../components/VerifyRecordView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INDEXER =
  process.env.ZG_STORAGE_INDEXER ?? "https://indexer-storage-testnet-turbo.0g.ai";

export default async function VerifyPage({ params }: { params: { root: string } }) {
  const root = params.root;
  let record: ProvenanceRecord | null = null;
  let error: string | null = null;
  try {
    record = await createVerifier(INDEXER)(root);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <main className="proof-page">
      <header className="proof-page-head">
        <span className="proof-kicker mono">
          <span className="proof-kicker-dot" aria-hidden /> KEYLESS VERIFICATION · 0G STORAGE
        </span>
        <h1 className="proof-page-h1">Provenance, recovered from 0G.</h1>
        <p className="proof-page-sub">
          This record was pulled from 0G Storage by its root hash alone — no private key, no
          trust in the operator. The same check runs anywhere, against the public network.
          Outcome registries score an agent&rsquo;s track record; this is the other half —
          the reasoning itself, Memory → Belief → Decision, recovered and recomputable.
        </p>
      </header>

      {/* Show the recovery path as evidence in its own right. */}
      <div className="proof-trail mono" aria-hidden>
        <span className="proof-trail-step">root&nbsp;hash</span>
        <span className="proof-trail-arrow">→</span>
        <span className="proof-trail-step">0G&nbsp;Storage&nbsp;indexer</span>
        <span className="proof-trail-arrow">→</span>
        <span className={`proof-trail-step ${record ? "proof-trail-step--ok" : "proof-trail-step--fail"}`}>
          {record ? "record recovered" : "recovery failed"}
        </span>
      </div>

      {record ? (
        <VerifyRecordView record={record} rootHash={root} />
      ) : (
        <div className="proof-fault">
          <span className="proof-fault-label mono">✕ could not recover a provenance record</span>
          <p className="proof-fault-hash mono">root {root}</p>
          {error && <code className="proof-fault-msg mono">{error}</code>}
          <p className="proof-fault-help">
            The hash may be malformed, or the record isn’t on this indexer. Recovery is keyless —
            anyone can retry against another 0G Storage endpoint.
          </p>
        </div>
      )}

      <nav className="proof-foot" aria-label="Next">
        <Link href="/build" className="board-foot-cta">Add provenance to your agent</Link>
        <Link href="/world" className="board-foot-cta board-foot-cta--ghost">The world</Link>
        <span className="board-foot-spacer" />
        <Link href="/" className="board-foot-link mono">← Home</Link>
      </nav>
    </main>
  );
}
