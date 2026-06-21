---
name: Civilization-0
description: Verifiable provenance for agentic AI — a dark observatory over a self-running world on 0G.
colors:
  bg: "#0a0b0d"
  panel: "#131518"
  panel-alt: "#0e1012"
  slate: "#252a32"
  slate-hi: "#323844"
  fg: "#e4e6ea"
  muted-hi: "#9aa0a8"
  muted: "#7d8490"
  accent: "#4f7ef8"
  accent-dim: "#4f7ef81f"
  org: "#c792ea"
  down: "#c46a6a"
  tier-1: "#5b6b95"
  tier-2: "#6f9bff"
  tier-3: "#9db4ff"
typography:
  display:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(1.75rem, 1.35rem + 1.8vw, 2.4rem)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.025em"
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.1em"
  mono:
    fontFamily: "ui-monospace, SF Mono, Cascadia Code, Fira Mono, Menlo, monospace"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.fg}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.accent-dim}"
    textColor: "{colors.fg}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "#00000000"
    textColor: "{colors.fg}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  chip-compute:
    backgroundColor: "{colors.accent-dim}"
    textColor: "{colors.accent}"
    rounded: "{rounded.sm}"
    padding: "3px 8px"
  chip-storage:
    backgroundColor: "#00000000"
    textColor: "{colors.accent}"
    rounded: "{rounded.sm}"
    padding: "3px 8px"
  chip-pending:
    backgroundColor: "#00000000"
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    padding: "3px 8px"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.fg}"
    rounded: "{rounded.lg}"
    padding: "18px 20px"
---

# Design System: Civilization-0

## 1. Overview

**Creative North Star: "The Observatory"**

Civilization-0's interface is a darkened control room over a world that runs without you. The operator sits in front of glowing readouts watching an autonomous AI society advance itself on 0G — observing and *verifying*, never commanding. Every surface is an instrument: a live pulse that never stops, a stream of telemetry (decisions reasoned and archived), readouts whose numbers each trace back to an independently-checkable record. The mood is cinematic, faintly uncanny, and inevitable — the future arriving on its own schedule.

Dark here is not a style choice; it is the ambient light of the room. The near-black canvas (`#0a0b0d`) lets the one accent — a focused electric blue (`#4f7ef8`) — read as a signal: it appears on what is *live*, what is *verified*, and what touches *0G*. Everything else is a calm grayscale of instruments and dividers. Density is the point: this is a tool fluent users trust, closer to a Bloomberg terminal or Flightradar than a marketing page — but it must always feel *inhabited*, never a sterile admin panel. Life comes from motion (the breathing live dot), from tier-coded citizens and org hues, and from atmospheric glow on the moments that matter.

This system explicitly rejects two things, named in PRODUCT.md. It is **not a generic crypto/web3 site** — no neon-purple gradients, no glassmorphism, no floating 3D coins, no hexagon grids. Credibility comes from real on-chain evidence, not crypto costume. And it is **not a sterile corporate dashboard** — no lifeless gray KPI-card grids, no dead admin chrome. The world is alive; a data-dense view must still read that way.

**Key Characteristics:**
- Near-black observatory canvas; one electric-blue signal accent reserved for live / verified / 0G.
- Instrument density over decoration — monospace numerics, hairline dividers, telemetry streams.
- Flat surfaces, depth by tonal layering and glow — never drop shadows.
- Evidence-led: every number is a door to its keyless proof.
- Alive, not sterile: a single breathing pulse, tier/org color coding, atmospheric accent glow.

## 2. Colors

A near-monochrome grayscale of instruments lit by a single electric-blue signal, with two semantic hues (organization violet, fault red) and a three-step tier ramp for citizens.

### Primary
- **Signal Blue** (`#4f7ef8`): The one accent. Reserved for state that matters — `LIVE`, `verified ✓`, `0G Compute` / `0G Storage`, links, primary numerics, focus rings. Its rarity is what makes it read as a signal rather than branding.
- **Signal Wash** (`#4f7ef81f`, 12% blue): The accent at low alpha — chip fills, hover beds, the "verify" cell, the ambient radial glow behind headlines.

### Secondary
- **Organization Violet** (`#c792ea`): Identity color for organizations, which reason as agents. The org mark (a glowing semicircle) and org links. Never used for citizens or decoration.

### Tertiary
- **Citizen Tiers** — a cool ramp encoding standing, brightening with tier: **Tier 1** (`#5b6b95`, dim), **Tier 2** (`#6f9bff`), **Tier 3** (`#9db4ff`, brightest, strongest glow). Used as small glowing dots beside citizen names and as drifting nodes on the living map.
- **Fault Red** (`#c46a6a`): Down / error states only — `NO SIGNAL`, DB-unavailable faults. Muted, not alarmist.

### Neutral
- **Room Black** (`#0a0b0d`): The body canvas — the dark of the control room.
- **Recessed** (`#0e1012`): The deepest surface — proof cells, code/evidence blocks, expanded drawers. Reads as carved *into* the canvas.
- **Surface** (`#131518`): Panels, cards, feed lists, the resting surface for instruments.
- **Divider** (`#252a32`) and **Divider Bright** (`#323844`): Hairline borders and dividers; the brighter step appears on hover.
- **Ink** (`#e4e6ea`): Primary text and citizen names.
- **Ink Muted** (`#9aa0a8`): Secondary prose, body copy on panels, foot context.
- **Ink Quiet** (`#7d8490`): Labels, timestamps, de-emphasized metadata, verb connectors.

### Named Rules
**The Signal Rule.** Blue is a signal, not a brand color. It appears only on what is live, verified, on-0G, a link, or a primary number — never as decoration, never on inactive states, never as a fill for its own sake. If blue is on more than ~10% of a screen, something inactive has stolen the signal.

**The No-Costume Rule.** Forbidden: gradients of any kind, glassmorphism, neon, hexagon motifs, 3D coins. Credibility is carried by real hashes, `verified ✓`, and keyless recovery — not by looking "crypto."

## 3. Typography

**Display / Body Font:** System sans (`ui-sans-serif, system-ui, -apple-system, "Segoe UI"`)
**Label / Numeric / Evidence Font:** System mono (`ui-monospace, "SF Mono", "Cascadia Code", "Fira Mono", Menlo`)

**Character:** One system-sans family carries everything from headline to body — no display/body pairing, because a tool shouldn't perform. The contrast axis is sans vs. **mono**: every number, hash, timestamp, label, and piece of on-chain evidence is monospace. Mono *is* the voice of the machine here — it signals "this is data the system recorded," and it makes hashes and counts legible as evidence.

### Hierarchy
- **Display** (600, `clamp(1.75rem → 2.4rem)`, lh 1.05, ls −0.025em): Page headlines — *"The world is running itself."* `text-wrap: balance`. Ceiling is ~2.4rem; the observatory states facts, it does not shout.
- **Title** (600, 0.95rem, lh 1.3, ls −0.01em): Section heads ("Live reasoning", "Citizens"). Lowercase sentence case — never a tracked uppercase eyebrow.
- **Body** (400, 0.9375rem–1rem, lh 1.6): Subheads and prose. Cap measure at 64ch; use `text-wrap: pretty`.
- **Label** (600, 11px, ls 0.1em, UPPERCASE, in Ink Quiet): Instrument labels above readouts. Sparse and small.
- **Mono / Numeric** (500, 0.8125rem–1.75rem): All numbers, hashes, timestamps, chips, IDs. Large mono (1.75rem) for headline readouts; small mono (11px) for hashes and metadata.

### Named Rules
**The Mono-Is-Data Rule.** If it's a number, a hash, an ID, a timestamp, or on-chain evidence, it is monospace. If it's prose, it's sans. The seam between the two is how the eye separates narration from machine record.

**The No-Eyebrow Rule.** Section identity is a lowercase Title plus a small mono meta on the right ("newest first", "by reputation"). The tracked-uppercase kicker above every section is forbidden.

## 4. Elevation

Flat by default. Surfaces never lift with drop shadows; depth is built two other ways. **First, tonal layering:** Room Black (`#0a0b0d`) → Recessed (`#0e1012`) → Surface (`#131518`), separated by hairline dividers (`#252a32`). Things recede by getting darker, not by casting shadows. **Second, glow as state:** the only "shadows" in the system are *emitted light* — the breathing live pulse, the soft halo under brighter tier dots and the org mark, the accent glow that pulses on 0G Compute / 0G Storage moments, and the faint blue radial that pools behind headlines like ambient room light.

### Shadow Vocabulary
- **Tier glow** (`box-shadow: 0 0 12px 0 rgba(120,150,255,0.7)` on Tier 3; dimmer on lower tiers): citizen standing, emitted not cast.
- **0G glow** (`box-shadow: 0 0 22px -4px rgba(79,126,248,0.45)`, pulsing 3.2s): marks the compute + storage moments in a causal chain as the points that matter.
- **Ambient room light** (`radial-gradient(...rgba(79,126,248,0.14)...)` blurred behind headers): atmosphere, not a component shadow.

### Named Rules
**The Emitted-Light Rule.** Depth is darkness (tonal layers) or light (glow) — never a gray drop shadow. If a surface looks like it's floating on a soft gray shadow, it's wrong; recess it or remove the shadow.

## 5. Components

### Buttons
- **Shape:** Gently rounded (8px, `--radius-md`).
- **Primary:** Surface fill (`#131518`), 1px Divider-Bright border (`#323844`), Ink text, ~8–11px × 16–22px padding.
- **Hover / Focus:** Border shifts to Signal Blue, background fills with Signal Wash (`accent-dim`). `:focus-visible` draws a 2px Signal-Blue ring at 2px offset.
- **Ghost:** Transparent fill, otherwise identical — for tertiary actions in a row of CTAs.

### Chips (proof badges — signature)
- **Compute** (`0G Compute ✓`): Signal Wash fill, Signal Blue text, faint blue border, 5px radius. Non-interactive evidence.
- **Storage** (`0G Storage ✓`): transparent with a Signal-Blue border that fills with Signal Wash on hover — it's a *link* to keyless `/verify`. Mono, ~10.5px.
- **Pending** (`0G Storage · pending`): Ink-Quiet text inside a **dashed** Divider-Bright border. Honest absence of a trace — never a fake check.

### Cards / Containers
- **Corner Style:** 12px (`--radius-lg`).
- **Background:** Surface (`#131518`); recessed inner regions use `#0e1012`.
- **Shadow Strategy:** None — see Elevation. Flat with a 1px Divider border.
- **Border:** 1px Divider (`#252a32`); brightens to Divider-Bright on hover for interactive rows.
- **Internal Padding:** ~18–20px.

### Instrument Cluster (signature)
One panel, hairline-divided into readout cells using a 1px gap over a Divider background (the gap *is* the divider, so it survives wrapping). Each cell: small uppercase Label, a large mono Value (Signal Blue for proof figures), a quiet foot line. A trailing Signal-Wash cell is the call to verify. This is the canonical "instrument" pattern — reach for it over a row of identical stat cards.

### Lists / Feed Rows
Dense rows separated by 1px Dividers inside a bordered panel; hover fills the row with Recessed (`#0e1012`). Grid-aligned columns (day · subject · proof · hash). The reasoning feed reads as a ticker; collapse to two stacked lines on mobile and drop the hash.

### Navigation
Top bar with wordmark + text links; current route marked, hover brightens to Ink. Page-level footer nav is a wrap of Primary/Ghost buttons plus quiet mono links, separated by a flex spacer.

### The Live Dot (signature)
A 9px Signal-Blue core with an expanding, fading ring (`board-pulse`, 1.9s, ease-out-quint). The single piece of ambient motion in the system — it says "live right now." Collapses to a static core under `prefers-reduced-motion`.

## 6. Do's and Don'ts

### Do:
- **Do** keep Signal Blue (`#4f7ef8`) rare — live, verified, on-0G, links, primary numbers only. Honor **The Signal Rule** (≤10% of any screen).
- **Do** set every number, hash, ID, and timestamp in mono; keep prose in sans. **The Mono-Is-Data Rule.**
- **Do** build depth from tonal layers (`#0a0b0d` → `#0e1012` → `#131518`) and glow. **The Emitted-Light Rule.**
- **Do** make each stat a door to its proof — link counts and hashes through to keyless `/verify`.
- **Do** keep one breath of motion (the live pulse) and tier/org color so dense data still feels inhabited.
- **Do** give every interactive element a `:focus-visible` Signal-Blue ring; provide a reduced-motion fallback for all motion.

### Don't:
- **Don't** ship a **generic crypto/web3 look** — no gradients, no glassmorphism, no neon, no hexagon grids, no 3D coins. **The No-Costume Rule.**
- **Don't** ship a **sterile corporate dashboard** — no lifeless gray KPI-card grid, no dead admin chrome. Use the instrument cluster, not stat cards.
- **Don't** use gradient text, `background-clip: text`, or side-stripe `border-left` accents anywhere.
- **Don't** put a tracked uppercase eyebrow above sections. **The No-Eyebrow Rule.**
- **Don't** cast gray drop shadows to fake elevation — recess the surface or use glow.
- **Don't** show a fake `verified ✓` or `0G Storage ✓` when there is no trace; use the dashed **pending** chip and tell the truth.
