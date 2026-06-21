# Civilization-0 — 2-minute demo script

**The one line:** *"An AI society that runs itself on 0G — and you can cryptographically verify why any citizen made any decision."*

Lead with the moat (verifiable provenance), use the living world as the proof. Don't open with "it's a simulation" — open with "you can't audit AI agents today; here's how 0G fixes that."

---

## The flow (≈2:00)

**0:00 — Hook (landing `/`)** *(~20s)*
- "Autonomous agents make decisions nobody can audit. We built the provenance layer for agentic AI on 0G."
- Point at the **live proof strip**: *"This isn't a mockup — it's running right now. Day N, N decisions reasoned and verified on 0G Compute, N traces archived on 0G Storage."*

**0:20 — The living world (`/world`)** *(~25s)*
- "A persistent society. It ticks itself forward on real 0G every couple of hours — no one's driving it."
- Scroll the recent events: *"Every one is tagged **0G Compute ✓ / 0G Storage ✓**. The reasoning ran on 0G; the record lives on 0G."*

**0:45 — Why it decided (`/citizens/<id>`)** *(~30s)*
- Click a citizen. "Here's the whole causal chain behind her latest decision."
- Walk the chain: **Memory → Belief → 0G Compute → Decision → Event → 0G Storage.** *"This is the moat: we don't just log what happened — we record what actually drove the decision, the brain-weighted inputs, reasoned on 0G with a cryptographic `verified: true`."*

**1:15 — Verify it yourself (`/verify/<root>`)** *(~30s)* ← **the money shot**
- Click a "0G Storage ✓" badge. "Now the important part. This record gets pulled back from 0G Storage by its hash alone — **no private key, no trust in us.** Anyone can run this."
- "The decision, the reasoning, the verification — recovered straight from the network. That's what 'verifiable' actually means."

**1:45 — The product (`/pricing` + `/api/provenance/records`)** *(~15s)*
- "The civilization is the proof. The product is the provenance layer: a Research API that exports this verifiable, 0G-reasoned decision dataset. Build agents anyone can audit."
- Close: *"Rip out 0G and none of this exists. That's the point."*

---

## Backup talking points (if asked)
- **Why 0G specifically?** Reasoning needs verifiable compute (0G Compute, TEE-attested); the permanent, address-by-hash, keyless-recoverable record needs decentralized storage (0G Storage). No trusted middleman in either half.
- **Is it really autonomous?** A cost-gated systemd scheduler ticks the world on 0G on a timer and survives restarts; a tick log shows it advancing.
- **What's the business?** Verifiable provenance for autonomous agents — strongest where decisions are adversarial, on-chain, multi-party, or regulated and "trust our logs" isn't enough.
- **What's real vs. mocked?** All of it runs on 0G testnet (chainId 16602). Citizens, organizations, and user-created agents have all reasoned on 0G with `verified: true` and been recovered keyless. Plan upgrades are mocked (no payment rail) — everything else is live.

## Pre-record checklist
- [ ] World has advanced recently (`tail /opt/civilization-0/tick.log` shows a recent `result=success`).
- [ ] Landing proof strip shows a healthy day count + a clickable "verify the latest" link.
- [ ] Pick one citizen with a full causal chain + a working `/verify/<root>` badge — rehearse that exact click path.
- [ ] Have a Research API key ready to show `GET /api/provenance/records` returning real records.
