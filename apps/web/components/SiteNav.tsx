"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// The single source of truth for primary navigation. Every page renders this
// (via the root layout) so the whole app is reachable from anywhere, with a
// clear active state — no more island pages with ad-hoc bottom links.
const PRIMARY: { href: string; label: string }[] = [
  { href: "/map", label: "Map" },
  { href: "/world", label: "Dashboard" },
  { href: "/orgs", label: "Organizations" },
  { href: "/history", label: "History" },
  { href: "/build", label: "Build" },
  { href: "/pricing", label: "Pricing" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function SiteNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname() || "/";
  return (
    <header className="site-nav">
      <Link href="/" className="site-nav-brand">
        <span className="site-nav-dot" aria-hidden />
        Civilization-0
      </Link>
      <nav className="site-nav-links">
        {PRIMARY.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={isActive(pathname, l.href) ? "site-nav-link is-active" : "site-nav-link"}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="site-nav-auth">
        {signedIn ? (
          <Link href="/account" className={isActive(pathname, "/account") ? "site-nav-link is-active" : "site-nav-link"}>
            Account
          </Link>
        ) : (
          <Link href="/login" className="site-nav-cta">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
