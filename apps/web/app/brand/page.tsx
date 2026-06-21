import React from "react";
import Link from "next/link";

export const dynamic = "force-static";

const RAW = "https://raw.githubusercontent.com/Laolex/civilization-0/master/apps/web/public";

export default function BrandPage() {
  return (
    <main className="board board--mid">
      <header className="board-head">
        <span className="proof-kicker mono">
          <span className="proof-kicker-dot" aria-hidden /> SUBMISSION ASSETS
        </span>
        <h1 className="board-title">Brand assets.</h1>
        <p className="board-sub">Project logo and cover thumbnail for the submission page — preview before you paste the URLs.</p>
      </header>

      <section className="cz-section">
        <div className="section-head">
          <h2 className="section-title">Logo</h2>
          <span className="section-meta mono">1200×1200 · square</span>
        </div>
        <div className="brand-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Civilization-0 logo" width={260} height={260} className="brand-logo-img" />
          <div className="brand-info">
            <p className="board-empty-body">The provenance constellation — a glowing social graph with a violet verified node.</p>
            <code className="brand-url mono">{RAW}/logo.png</code>
          </div>
        </div>
      </section>

      <section className="cz-section">
        <div className="section-head">
          <h2 className="section-title">Cover thumbnail</h2>
          <span className="section-meta mono">1200×630 · card</span>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/thumbnail.png" alt="Civilization-0 cover" className="brand-thumb-img" />
        <code className="brand-url mono" style={{ marginTop: 12, display: "inline-block" }}>{RAW}/thumbnail.png</code>
      </section>

      <nav className="board-foot" aria-label="Navigation">
        <a href="/logo.png" className="board-foot-cta">Open logo.png</a>
        <a href="/thumbnail.png" className="board-foot-cta board-foot-cta--ghost">Open thumbnail.png</a>
        <span className="board-foot-spacer" />
        <Link href="/" className="board-foot-link mono">← Home</Link>
      </nav>
    </main>
  );
}
