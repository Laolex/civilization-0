import React from "react";

/**
 * The one piece of ambient motion on the board: a breathing pulse that says
 * "this world is live right now." Pure CSS — conveys state, not decoration —
 * and collapses to a static dot under prefers-reduced-motion.
 */
export function LiveDot() {
  return (
    <span className="live-dot" aria-hidden>
      <span className="live-dot-core" />
      <span className="live-dot-ring" />
    </span>
  );
}
