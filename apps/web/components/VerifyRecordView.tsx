import React from "react";
import type { ProvenanceRecord } from "@civ/provenance/src/record";

export function VerifyRecordView({ record, rootHash }: { record: ProvenanceRecord; rootHash: string }) {
  const verified = record.meta?.verified === true;
  return (
    <div className="vr-root">
      <div className="vr-head">
        <span className="vr-agent mono">{record.agent}</span>
        {verified && (
          <span className="vr-badge mono">✓ Verified on 0G Compute</span>
        )}
      </div>

      <p className="vr-question">{record.question}</p>

      <div className="vr-decision">
        <span className="vr-decision-action mono">{record.decision.action}</span>
        {record.decision.targetId && (
          <span className="vr-decision-target mono">→ {record.decision.targetId}</span>
        )}
      </div>
      <p className="vr-reasoning">{record.decision.reasoning}</p>

      <div className="vr-drivers">
        <span className="vr-drivers-label">Drivers — what actually drove the decision</span>
        <ul className="vr-driver-list">
          {record.drivers.memories.map((d) => (
            <li key={`m-${d.id}`} className="vr-driver">
              <span className="vr-driver-kind mono">memory</span>
              <span className="vr-driver-id mono">{d.id}</span>
              <span className="vr-driver-weight mono">{d.weight.toFixed(2)}</span>
            </li>
          ))}
          {record.drivers.beliefs.map((d) => (
            <li key={`b-${d.id}`} className="vr-driver">
              <span className="vr-driver-kind mono">belief</span>
              <span className="vr-driver-id mono">{d.id}</span>
              <span className="vr-driver-weight mono">{d.weight.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="vr-meta">
        <span className="vr-meta-label">0G Storage root</span>
        <span className="vr-hash mono">{rootHash}</span>
        {record.meta?.model && (
          <>
            <span className="vr-meta-label">model</span>
            <span className="vr-hash mono">{record.meta.model}</span>
          </>
        )}
      </div>
    </div>
  );
}
