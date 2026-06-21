# Product

## Register

product

> The project is mixed: `/` and `/build` and `/pricing` are brand surfaces (the pitch);
> `/world`, `/citizens`, `/orgs`, `/history`, `/map`, `/verify` are product surfaces.
> The default register is **product** — most routes serve data and the active work is the
> dashboard. When working a marketing surface, override to `brand` for that task.

## Users

Two audiences, both technical:

- **Agent builders / developers** evaluating Civilization-0 as a verifiable-provenance layer
  for their own autonomous agents. They arrive skeptical ("trust our logs" is exactly what
  they're tired of) and are convinced by evidence they can independently check, not claims.
- **Hackathon judges and crypto-native observers** auditing whether 0G is genuinely
  load-bearing. Their job-to-be-done: confirm in under a minute that the AI reasoning is
  real, the record is on-chain, and verification is keyless.

Context of use: desktop, focused, reading dense technical evidence. They want to *catch the
product lying* and should fail to.

## Product Purpose

Civilization-0 is a **verifiable provenance layer for agentic AI on 0G**. Every decision is
reasoned on 0G Compute (TEE-verified, `verified: true`) and its full causal chain
(Memory → Belief → Decision → Event → Trace) is archived to 0G Storage, where **anyone can
recover and verify it keyless — no trust in the operator**. It proves this with the hardest
possible demo: a **persistent AI society that runs itself** on real 0G testnet, advancing
autonomously every 2 hours.

The `/world` dashboard is mission control for that living society: the current day,
population, the density of on-0G proof, and the stream of decisions citizens and orgs are
actually making. Success = a visitor watches the world be alive and verifiable at a glance,
and trusts that every number traces back to a real, independently-checkable record.

## Brand Personality

**Cinematic · uncanny · inevitable.** A society that runs itself with no human in the loop
is quietly unsettling and feels like the future arriving — atmospheric and dramatic, never a
sterile admin panel. Voice is precise and confident; the evidence carries the drama, so the
copy stays terse and technical. The world is *alive* and the interface should read that way
even when it's data-dense: motion is breath, not decoration.

## Anti-references

- **Generic crypto/web3 sites.** No neon-purple gradients, glassmorphism, floating 3D coins,
  hexagon grids, or "Web3" clip-art. The credibility comes from real on-chain evidence, not
  crypto costume.
- **Sterile corporate dashboards.** No lifeless gray admin-panel feel, no identical KPI-card
  grids. The world is alive; a data-dense view must still feel inhabited and in motion.
- (Cross-register bans still apply: no gradient text, no side-stripe borders, no
  hero-metric template, no tracked-uppercase eyebrow on every section.)

## Design Principles

1. **Evidence over assertion.** Never tell the user the world is real and verified — show the
   record, the hash, the `verified ✓`, and let them click through to check. Every stat is a
   door to its proof.
2. **The world is alive.** The interface should breathe — autonomous, in motion, evolving —
   so the autonomy is felt, not described. Stillness reads as a screenshot; this is not one.
3. **0G is load-bearing, so make it visible.** 0G Compute and 0G Storage are the moat. Surface
   them as first-class, earned moments — not badges sprinkled for branding.
4. **Density without sterility.** Technical, data-rich, terminal-native — but inhabited.
   Atmosphere and rhythm keep dense data from feeling like an admin panel.
5. **Keyless or it didn't happen.** Anything presented as proof must be independently
   recoverable. The product's integrity is that it doesn't ask to be trusted.

## Accessibility & Inclusion

- Target WCAG 2.1 AA. Body text ≥ 4.5:1 against its (dark) background; the muted grays on the
  near-black panels must be audited, not assumed — `--muted` on `--panel` is the risk.
- Every animation needs a `prefers-reduced-motion: reduce` alternative (the existing chain
  reveal and drift already do; new motion must match).
- Color is never the sole signal for `verified` / failed states — pair with text and icon.
- Keyboard-navigable: tables, expandable nodes, and verify actions reachable and focus-visible.
