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
    <main className="verify-page-root">
      <p className="landing-eyebrow">Keyless verification · civ.provenance</p>
      <h1 className="verify-page-h1">Provenance, recovered from 0G.</h1>
      <p className="verify-page-sub">
        This record was downloaded from 0G Storage by its root hash alone — no
        private key, no trust in the operator. Anyone can run this check.
      </p>

      {record ? (
        <VerifyRecordView record={record} rootHash={root} />
      ) : (
        <div className="verify-page-error">
          <p className="vr-badge-fail mono">✕ Could not recover a provenance record</p>
          <p className="vr-hash mono">root {root}</p>
          {error && <p className="verify-page-error-msg mono">{error}</p>}
        </div>
      )}

      <div className="build-cta-row" style={{ marginTop: 32 }}>
        <Link href="/build" className="landing-cta">Add provenance to your agent →</Link>
        <Link href="/" className="build-link">← Home</Link>
      </div>
    </main>
  );
}
