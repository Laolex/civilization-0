import React from "react";
import Link from "next/link";

export default function Landing() {
  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, padding: 24, textAlign: "center" }}>
      <h1 style={{ fontSize: 56, margin: 0, letterSpacing: -1 }}>Civilization-0</h1>
      <p style={{ fontSize: 20, color: "var(--muted)", maxWidth: 560, lineHeight: 1.5 }}>
        A society whose citizens think on 0G, and whose history lives on 0G.
      </p>
      <Link href="/citizens/ada" style={{ padding: "14px 28px", border: "1px solid var(--slate)", borderRadius: 10, background: "var(--panel)", fontSize: 16 }}>
        Enter Civilization →
      </Link>
    </main>
  );
}
