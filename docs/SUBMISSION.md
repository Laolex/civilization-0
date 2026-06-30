# Civilization-0 — Zero Cup Round-of-32 Submission

**One line:** *A verifiable provenance layer for agentic AI on 0G — every decision is reasoned on 0G Compute and archived on 0G Storage, where anyone can recover and verify it by hash alone, with no trust in the operator.*

- **Live app:** https://civilization-0.vercel.app
- **Public repo:** (this repo)
- **Demo video:** _<link>_
- **Network:** 0G testnet (chainId 16602) — 0G Compute + 0G Storage, both live.

---

## Judge-facing description (paste into the submission form)

> Autonomous agents make decisions nobody can audit — you're asked to trust the operator's logs. **Civilization-0 is a verifiable provenance layer for agentic AI, built on 0G.** Every decision is *reasoned on 0G Compute* (TEE-attested, `verified: true`) and its full causal chain — Memory → Belief → Decision → Event → Trace — is *archived on 0G Storage*, addressable by root hash. Anyone can recover that record straight from the network **by hash alone — no private key, no trust in us** — and confirm the reasoning was real and verified.
>
> We prove it with the hardest possible demo: a **persistent AI society that runs itself on 0G.** Seven AI citizens (and organizations) think on 0G Compute and their entire history lives on 0G Storage; a cost-gated scheduler ticks the world every two hours and survives restarts. It's on **day 87**, with **269 of 269 decisions independently verifiable**. Rip out 0G and the product doesn't exist — the reasoning and the proof both live on the network. The civilization is Exhibit A; the verifiable provenance layer is the product.

*(~150 words. Trim the second paragraph if the form has a tight limit — the first paragraph is the load-bearing claim.)*

---

## Verify it yourself in 10 seconds (do this, judges)

A **real, live decision** — Atlas Zoe choosing `start_company` on day 87, reasoned and archived on 0G:

```bash
curl -s "https://civilization-0.vercel.app/api/verify?root=0x6ac4a4994439c1ca4da1e932c9db4d562cfc640afa241935582ace0bf2bdfb52"
```

Returns the record **recovered from 0G Storage by its hash** — note `verified: true`:

```json
{ "ok": true, "key": "trace/...", "bytes": 732,
  "excerpt": { "decision": { "action": "start_company",
                             "reasoning": "Atlas Zoe's ambition ... make starting a company an ideal choice." },
               "verified": true } }
```

Or in the browser: **https://civilization-0.vercel.app/verify/0x6ac4a4994439c1ca4da1e932c9db4d562cfc640afa241935582ace0bf2bdfb52**

The verifier holds **no private key** — it reads from a public 0G Storage indexer. That's the whole point: you didn't trust us, you checked the network.

> Every "0G Storage ✓" badge in the live app is one of these links. Pick any decision on `/world` and click its badge — it pulls *that* decision back out of 0G.

---

## Why 0G is load-bearing (the #1 submission criterion)

0G's top disqualifier: *"if it runs the same without it, that's a bolt-on."* Civilization-0 fails closed without 0G:

| Half of the product | Without 0G | With 0G |
|---|---|---|
| **Reasoning** | a self-reported string in our DB you must trust | runs on **0G Compute**, TEE-attested `verified: true` — *we can't fake it* |
| **The record** | a row we can edit, drop, or fabricate after the fact | archived to **0G Storage**, address-by-hash, tamper-evident |
| **Verification** | "trust our API" | **keyless** recovery from a public 0G indexer — no signer, no operator trust |
| **Delete our servers** | the proof is gone | **the proof still stands** |

Both halves — verifiable compute *and* permanent, keyless-recoverable storage — require 0G specifically. There is no trusted middleman in either half.

---

## 90-second demo cut (R32 — judged, optimize for the rubric)

Tighter than the 2-minute `DEMO.md` cut. Lead with the moat; the world is the proof.

| Time | Screen | Say |
|---|---|---|
| 0:00–0:12 | Landing `/` — living world, proof strip idle | "Autonomous agents decide things right now and nobody can audit why. This is the provenance layer for agentic AI, live on 0G — not a mockup, a society that's run itself for **87 days**." |
| 0:12–0:32 | `/world` — scroll feed, hover a row so **0G Compute ✓ / 0G Storage ✓** light. Land on a human row (e.g. an `invest`/`start_company`). | "It ticks itself on 0G every two hours. Every event carries two stamps — reasoned on 0G Compute, recorded on 0G Storage. Take this one: why did it decide that? That's where AI normally goes dark." |
| 0:32–0:52 | Click the citizen → causal chain renders: Memory → Belief → **Social** → 0G Compute → Decision → 0G Storage | "The whole chain — the memory it retrieved, the belief it fed, the *brain-weighted* inputs that actually drove the call, reasoned on 0G with a cryptographic verified-true. Not a log of what happened — a record of what moved the decision." |
| 0:52–1:18 | Back → **click that row's "0G Storage ✓" badge** → `/verify/<root>` resolves live | "Now the part that matters. I'm not loading our database. That badge is a hash, and this pulls the record straight back out of 0G Storage by that hash alone — no private key, no trusting us. Anyone runs the exact same call." |
| 1:18–1:30 | Recovered panel: action, reasoning, `verified: true`, root + tx | "Recovered from the network itself, verified. Rip out 0G and none of this exists — not the reasoning, not the proof. That's the whole point." |

**Rehearse the path, not a URL** (every fresh tick re-archives in verifiable shape):
1. `/world` → land on a **recent-day** human-readable row.
2. Click the citizen → confirm the **causal chain renders with a belief**.
3. Back → click that row's **"0G Storage ✓"** badge → confirm `/verify/<root>` resolves to `verified: true`.

---

## What's real vs mocked (state it — honesty scores)

- **Real on 0G testnet:** all reasoning (0G Compute, TEE `verified: true`), all archival (0G Storage), keyless verification, the autonomous scheduler (~0.0024 OG/tick, survives restarts), citizens + organizations + user-created agents.
- **Mocked:** plan-tier upgrades (no payment rail wired). Everything else is live.

---

## Pre-submission checklist (lock by **Wed Jul 1, 10:00 UTC**)

The deadline freezes a snapshot of the **public repo** — that exact commit is what's judged. Push before the lock or the prior snapshot carries forward.

- [ ] **Repo is public and opens** — judges can't score what they can't open.
- [ ] **README first screen** sells it in 20 seconds (the load-bearing 0G claim up top). ✓ already strong.
- [ ] **Live app reachable** — `/`, `/world`, `/verify/<root>` all load.
- [ ] **A fresh verifiable hash works** — re-run the curl above against a **current-day** root the morning of submission (older pre-fix traces won't verify). Pull one:
  ```bash
  # against the prod DB
  psql "$DB" -tAc "SELECT t.zg_root_hash FROM traces t JOIN decisions d ON t.decision_id=d.id \
    WHERE t.zg_root_hash IS NOT NULL ORDER BY d.day DESC LIMIT 1"
  ```
- [ ] **Demo video linked** and the demo **matches the code** (faking it = disqualification).
- [ ] **Scheduler healthy** — `tail tick.log` shows a recent `result=success`. *(The Jun 29 12:00–18:00 UTC stall — 4 ticks lost to a transient 0G RPC `TIMEOUT` at broker creation — is fixed in this PR via retry-with-backoff in `@civ/zerog`. **Deploy note:** the live tick runs `tsx` from source at `/opt/civilization-0`, so the fix only takes effect after master is pulled into that checkout; it applies on the next tick, no restart needed.)*
- [ ] **Description** (above) pasted into the form.
- [ ] One team, one project; no `.env` or secrets committed.
