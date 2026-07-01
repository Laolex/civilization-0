# Civilization-0 — 2-minute demo (shot-list + voiceover)

**The one line:** *"An AI society that runs itself on 0G — and you can cryptographically verify why any citizen made any decision, with nothing but a hash."*

Lead with the moat (verifiable provenance); the living world is the proof, not the pitch. The whole demo builds to **one unbroken click** — a "0G Storage ✓" badge in the live feed pulls its own decision back out of 0G Storage, keyless, on camera. Don't paste a pre-saved hash; click the badge the world just wrote.

> **Why this version:** the world archives every decision as a `civ.provenance/v0` record now, so *any* badge in the feed verifies keyless. The money shot is no longer a rehearsed URL — it's whatever the world decided last tick. That's the proof that it's live.

---

## Shot-list

Format — **[time] SCREEN — what's on camera** · then **VO:** the line.

### 1 · Hook — landing `/` · ~0:00–0:18
**SCREEN:** Open on the landing hero, full-bleed living world. Let the **live proof strip** breathe for a beat — cursor idle, nothing clicked.
**VO:** *"Autonomous agents are making real decisions right now — and nobody can audit why. This is the provenance layer for agentic AI, running live on 0G."*
**SCREEN:** Slow-point the cursor along the strip: *Day · decisions reasoned on 0G Compute · traces archived on 0G Storage.*
**VO:** *"Not a mockup. A society that's been running autonomously for months of in-world time — every decision reasoned and recorded on-chain."* (The strip shows the real count — it's on day 87 as of submission; say the live number.)

### 2 · The living world — `/world` · ~0:18–0:42
**SCREEN:** Click through to `/world`. Scroll the recent-events feed once, unhurried. Hover one row so the **0G Compute ✓ / 0G Storage ✓** chips light.
**VO:** *"It ticks itself forward on 0G every couple of hours — no one's driving it. Every event carries two stamps: the reasoning ran on 0G Compute, the record lives on 0G Storage."*
**SCREEN:** Stop on a concrete, human row — e.g. *"Ada invested in Marcus."* Hold.
**VO:** *"Take this one. Ada just chose to back Marcus. The obvious question — why? — is usually where AI goes dark. Watch."*

### 3 · Why it decided — causal chain · ~0:42–1:05
**SCREEN:** Click that citizen → their profile. The causal chain renders: **Memory → Belief → 0G Compute → Decision → Event → 0G Storage.**
**VO:** *"Here's the whole chain. A memory she retrieved, a belief it fed — 'Marcus is trustworthy' — the brain-weighted inputs that actually drove the call, reasoned on 0G with a cryptographic `verified: true`. Not a log of what happened. A record of what moved the decision."*

### 4 · Verify it yourself — **the money shot** · ~1:05–1:38
**SCREEN:** Back to the live feed. **Click the "0G Storage ✓" badge on that very row.** It routes to `/verify/<root>`. Let the page resolve on camera — spinner → the recovered record.
**VO:** *"Now the part that matters. I'm not loading our database. That badge is a hash — and this pulls the record straight back out of 0G Storage by that hash alone. No private key. No trusting us. Anyone, anywhere, runs the exact same call."*
**SCREEN:** The recovered panel fills in: action, target, reasoning, `verified: true`, root + tx hash.
**VO:** *"The decision, the reasoning, the verification — recovered from the network itself. That's what 'verifiable' is supposed to mean, and almost nothing in AI clears that bar."*

### 5 · The product — `/pricing` + Research API · ~1:38–2:00
**SCREEN:** Cut to `/pricing`, then a terminal: `GET /api/provenance/records` returning real records (or the export view).
**VO:** *"The civilization is the demo. The product is this layer underneath it — a Research API that exports every 0G-reasoned, keyless-verifiable decision as a dataset. Build agents people can actually audit."*
**SCREEN:** Land back on the verified record. Hold for the close.
**VO:** *"Rip out 0G and none of this exists — not the reasoning, not the proof. That's the whole point."*

---

## The single rehearsed path (memorize this, not a URL)
1. `/world` → scroll → land on a **real, human-readable row** (an `invest` / `partner` / `start_company` from the latest day reads best).
2. Click the citizen → confirm the **causal chain renders** with a belief in it.
3. Back → **click that same row's "0G Storage ✓" badge** → confirm `/verify/<root>` resolves to `verified: true`.

Because every new tick re-archives in the verifiable shape, pick the row **live** — but only from a **recent day** (older pre-fix traces won't verify). `tail tick.log` for the current day, then choose a row from it.

## Pre-record checklist
- [ ] Recent tick landed: `tail /opt/civilization-0/tick.log` shows a fresh `result=success` and the current day.
- [ ] Pull a fresh, verifiable hash to rehearse the exact click:
  - `psql "$PSQL_URL" -tAc "SELECT t.zg_root_hash, d.action, d.citizen_id FROM traces t JOIN decisions d ON t.decision_id=d.id WHERE d.day=(SELECT max(day) FROM decisions) AND t.zg_root_hash IS NOT NULL"`
  - Sanity-check one: `curl -s "https://civilization-0.vercel.app/api/verify?root=<hash>"` → expect `"ok":true` with the record nested under `excerpt`, including `"excerpt":{…,"verified":true}`.
- [ ] The citizen on that row has a **belief** in their causal chain (makes shot 3 land).
- [ ] Landing proof strip shows a healthy day count.
- [ ] Research API key ready for shot 5.

## Backup talking points (if asked)
- **Why 0G specifically?** Reasoning needs verifiable compute (0G Compute, TEE-attested); a permanent, address-by-hash, keyless-recoverable record needs decentralized storage (0G Storage). No trusted middleman in either half.
- **Is it really autonomous?** A cost-gated systemd scheduler ticks the world on 0G on a timer and survives restarts (~0.0024 OG/tick); the tick log shows it advancing.
- **What's the business?** Verifiable provenance for autonomous agents — strongest where decisions are adversarial, on-chain, multi-party, or regulated and "trust our logs" isn't enough.
- **What's real vs. mocked?** All of it runs on 0G testnet (chainId 16602). Citizens, organizations, and user-created agents have all reasoned on 0G with `verified: true` and been recovered keyless. Plan upgrades are mocked (no payment rail) — everything else is live.
