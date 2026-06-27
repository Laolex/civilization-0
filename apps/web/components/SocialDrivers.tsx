"use client";
import { useState } from "react";
import type { SocialDriverView, OrgDriverView } from "../lib/types";

function Bar({ value }: { value: number }) {
  return (
    <span className="sd-bar" aria-hidden="true">
      <span className="sd-bar-fill" style={{ width: `${Math.round(Math.min(1, value) * 100)}%` }} />
    </span>
  );
}

export function SocialDrivers({
  drivers, socialQuery, orgDriver,
}: { drivers: SocialDriverView[]; socialQuery?: string; orgDriver?: OrgDriverView }) {
  const [open, setOpen] = useState(false);
  const sorted = [...drivers].sort((a, b) => b.blendedScore - a.blendedScore);
  return (
    <div className="sd-root">
      {socialQuery && (
        <p className="sd-query mono">
          <span className="sd-query-label">social query</span> &ldquo;{socialQuery}&rdquo;
        </p>
      )}
      <ul className="sd-list">
        {sorted.map((d) => (
          <li key={d.id} className="sd-row">
            <span className="sd-name">{d.name}</span>
            <span className="sd-math mono">
              {d.relationshipStrength.toFixed(2)} <span className="sd-x">×</span> {d.relevance.toFixed(2)} <span className="sd-arrow">→</span>
            </span>
            <span className="sd-blended mono">{d.blendedScore.toFixed(2)}</span>
            <Bar value={d.blendedScore} />
          </li>
        ))}
      </ul>
      {orgDriver && (
        <p className="sd-org mono">
          <span className="sd-org-mark" aria-hidden>◠</span> {orgDriver.name}
          {orgDriver.reasoning ? <span className="sd-org-reason"> &mdash; &ldquo;{orgDriver.reasoning}&rdquo;</span> : null}
        </p>
      )}
      <button className="sd-recompute" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? "− hide raw inputs" : "▸ recompute yourself"}
      </button>
      {open && (
        <div className="sd-raw">
          <p className="sd-raw-note mono">
            strength = clamp((trust+influence)/200) · relevance = clamp(cosine(embed(neighborText), embed(socialQuery)))
          </p>
          <dl className="sd-raw-grid">
            {sorted.map((d) => (
              <div key={d.id} className="sd-raw-item">
                <dt className="sd-raw-key mono">{d.name}</dt>
                <dd className="sd-raw-val mono">trust {d.trust} · influence {d.influence} · &ldquo;<span>{d.neighborText}</span>&rdquo;</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
