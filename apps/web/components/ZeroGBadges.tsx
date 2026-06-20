import React from "react";
import Link from "next/link";

export function ZeroGBadges({ rootHash, verified }: { rootHash?: string | null; verified?: boolean }) {
  const showCompute = verified || !!rootHash;
  if (!showCompute && !rootHash) return <></>;
  return (
    <span className="zg-badges">
      {showCompute && <span className="zg-badge zg-badge-compute mono">0G Compute ✓</span>}
      {rootHash && (
        <Link href={`/verify/${rootHash}`} className="zg-badge zg-badge-storage mono">0G Storage ✓</Link>
      )}
    </span>
  );
}
