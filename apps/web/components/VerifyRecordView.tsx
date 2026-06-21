import React from "react";
import type { ProvenanceRecord } from "@civ/provenance/src/record";

function Driver({ kind, id, weight }: { kind: "memory" | "belief"; id: string; weight: number }) {
  const pct = Math.max(0, Math.min(1, weight)) * 100;
  return (
    <li className="driver">
      <span className={`driver-kind mono driver-kind--${kind}`}>{kind}</span>
      <span className="driver-id mono">{id}</span>
      <span className="driver-bar" aria-hidden>
        <span className={`driver-bar-fill driver-bar-fill--${kind}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="driver-weight mono">{weight.toFixed(2)}</span>
    </li>
  );
}

export function VerifyRecordView({ record, rootHash }: { record: ProvenanceRecord; rootHash: string }) {
  const verified = record.meta?.verified === true;
  const drivers = [
    ...record.drivers.memories.map((d) => ({ kind: "memory" as const, ...d })),
    ...record.drivers.beliefs.map((d) => ({ kind: "belief" as const, ...d })),
  ];

  return (
    <div className="proof-root">
      {/* ── Verdict: the earned money-shot ─────────────────────────────── */}
      <div className={`proof-verdict ${verified ? "proof-verdict--ok" : "proof-verdict--plain"}`}>
        <span className="proof-verdict-mark" aria-hidden>{verified ? "✓" : "◆"}</span>
        <div className="proof-verdict-text">
          <span className="proof-verdict-title">
            {verified ? "Verified on 0G Compute" : "Recovered from 0G Storage"}
          </span>
          <span className="proof-verdict-sub">
            {verified
              ? "TEE-attested reasoning, pulled back from 0G Storage by root hash alone."
              : "Record recovered keyless from 0G Storage; no compute attestation on this trace."}
          </span>
        </div>
        <span className="proof-agent mono">{record.agent}</span>
      </div>

      {/* ── The decision, as evidence ──────────────────────────────────── */}
      <div className="proof-block">
        <span className="proof-block-label">The question it faced</span>
        <p className="proof-question">{record.question}</p>

        <div className="proof-decision">
          <span className="proof-decision-action mono">{record.decision.action}</span>
          {record.decision.targetId && (
            <span className="proof-decision-target mono">→ {record.decision.targetId}</span>
          )}
        </div>
        <p className="proof-reasoning">{record.decision.reasoning}</p>
      </div>

      {/* ── Drivers: the moat, made visual ─────────────────────────────── */}
      <div className="proof-block">
        <span className="proof-block-label">What actually drove it</span>
        <span className="proof-block-note">
          the brain-weighted subset the decision hinged on — not everything retrieved
        </span>
        {drivers.length === 0 ? (
          <p className="proof-empty mono">no weighted drivers recorded for this decision</p>
        ) : (
          <ul className="driver-list">
            {drivers.map((d) => (
              <Driver key={`${d.kind}-${d.id}`} kind={d.kind} id={d.id} weight={d.weight} />
            ))}
          </ul>
        )}
      </div>

      {/* ── Cryptographic footer ───────────────────────────────────────── */}
      <dl className="proof-crypto">
        <div className="proof-crypto-row">
          <dt className="proof-crypto-key mono">0G Storage root</dt>
          <dd className="proof-crypto-val mono">{rootHash}</dd>
        </div>
        {record.meta?.provider && (
          <div className="proof-crypto-row">
            <dt className="proof-crypto-key mono">compute provider</dt>
            <dd className="proof-crypto-val mono">{record.meta.provider}</dd>
          </div>
        )}
        {record.meta?.model && (
          <div className="proof-crypto-row">
            <dt className="proof-crypto-key mono">model</dt>
            <dd className="proof-crypto-val mono">{record.meta.model}</dd>
          </div>
        )}
        {record.meta?.requestId && (
          <div className="proof-crypto-row">
            <dt className="proof-crypto-key mono">request</dt>
            <dd className="proof-crypto-val mono">{record.meta.requestId}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
