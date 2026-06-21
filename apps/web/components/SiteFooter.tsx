import React from "react";
import Link from "next/link";

// Secondary, exhaustive navigation — the full sitemap so nothing is orphaned.
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-cols">
        <div className="site-footer-col">
          <span className="site-footer-head">Explore</span>
          <Link href="/map" className="site-footer-link">Living map</Link>
          <Link href="/world" className="site-footer-link">World dashboard</Link>
          <Link href="/worlds" className="site-footer-link">All worlds</Link>
          <Link href="/orgs" className="site-footer-link">Organizations</Link>
          <Link href="/history" className="site-footer-link">History</Link>
        </div>
        <div className="site-footer-col">
          <span className="site-footer-head">Citizens</span>
          <Link href="/citizens/ada" className="site-footer-link">Ada's story</Link>
          <Link href="/citizens/new" className="site-footer-link">Create a citizen</Link>
        </div>
        <div className="site-footer-col">
          <span className="site-footer-head">Build</span>
          <Link href="/build" className="site-footer-link">Provenance SDK</Link>
          <Link href="/pricing" className="site-footer-link">Pricing &amp; API</Link>
        </div>
        <div className="site-footer-col">
          <span className="site-footer-head">Account</span>
          <Link href="/login" className="site-footer-link">Sign in</Link>
          <Link href="/signup" className="site-footer-link">Sign up</Link>
          <Link href="/account" className="site-footer-link">Your account</Link>
        </div>
      </div>
      <div className="site-footer-base">
        <span className="mono">Civilization-0</span>
        <span className="site-footer-muted">Reasoned on 0G Compute · Archived on 0G Storage · Verifiable by anyone</span>
      </div>
    </footer>
  );
}
