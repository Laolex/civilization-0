"use client";
// Placeholder — Task 11 will replace this with the live /api/verify integration.
export function VerifyOnZeroG({ rootHash }: { rootHash: string }) {
  const short = rootHash.length > 10 ? rootHash.slice(0, 6) + "…" + rootHash.slice(-4) : rootHash;
  return (
    <button
      style={{
        marginTop: 12,
        padding: "6px 14px",
        background: "transparent",
        border: "1px solid var(--slate)",
        borderRadius: 6,
        color: "var(--fg)",
        cursor: "pointer",
        fontFamily: "monospace",
        fontSize: 12,
      }}
    >
      Verify on 0G ({short})
    </button>
  );
}
