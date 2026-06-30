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

## What's new since the group stage

The group-stage snapshot locked **Jun 24**. Everything below landed after that — visible iteration is what the R32 rubric rewards:

| Since group stage | What it adds | Where to see it |
|---|---|---|
| **Player interventions** (whisper · dilemma · world headline) | A human can **step into the autonomous world** at two scopes — *whisper* a ≤280-char suggestion to one citizen (or pose a forced-choice *dilemma*), or set a *world headline* (e.g. "A plague sweeps the land") that the **whole population** reasons against. Each is an input agents weigh on their next tick — never an override. Persisted with per-world authorization. | per-citizen: `/citizens/[id]` → *Whisper* / *Dilemma* box · world-wide: `/world` → *World Event* box |
| **GraphRAG social reasoning** | Each decision is now partly driven by the citizens it trusts (`trust × relevance → blended score`). The raw inputs are archived with the trace, so anyone can **recompute the scores from scratch** — verifiable retrieval, not a stored answer. | causal chain *Social* node; `/map` → click a citizen → **Replay last decision** lights the exact edges retrieved |
| **Reliability hardening** | The autonomous loop survived a 6h 0G-RPC wobble that previously froze it: **retry-with-backoff** on transient RPC timeouts + **multi-endpoint RPC failover**. | `tick.log` ticking clean; `@civ/zerog` retry/failover (+16 tests) |

These turn the pitch from "a world that runs itself" into "a world that runs itself, **that you can steer, and still verify** — even the part you steered."

---

## R32 demo script (v2 — built around what's new)

~2 minutes. Same spine as `DEMO.md` but it now shows the **intervention → social reasoning → verify** loop end-to-end. Lead with the moat; the world is the proof.

| Time | Screen | Say |
|---|---|---|
| 0:00–0:15 | Landing `/` — living world, proof strip idle | "Autonomous agents decide things right now and nobody can audit why. This is the provenance layer for agentic AI, live on 0G — not a mockup, a society that's run itself for **87 days**." |
| 0:15–0:33 | `/world` — scroll feed, hover a row so **0G Compute ✓ / 0G Storage ✓** light | "It ticks itself on 0G every two hours. Every event carries two stamps — reasoned on 0G Compute, recorded on 0G Storage. But here's what's new since the group stage: you're not just watching." |
| 0:33–0:50 | Open a citizen → **Whisper box**. Type a suggestion (e.g. *"Marcus can't be trusted — be careful"*). Send → "*{name} will hear this on their next day.*" | "I can step in at two scales. First, one citizen: I whisper a suggestion — not a command, an *input*. They'll weigh it, on 0G, like any other memory." |
| 0:50–1:05 | `/world` → **World Event box**. Set a headline (e.g. *"A plague sweeps the land"*). | "And I can steer the *whole world* — one headline every citizen now reasons against. Whisper is a nudge to one mind; a headline is a shock to all seven. So: does my input actually move the decisions — and can I prove it did?" |
| 1:05–1:30 | After the next tick, the citizen's **causal chain** → the **Social node** shows neighbors + my whisper (and the world headline) weighted `trust × relevance`. Hit "recompute yourself". | "Here's the chain for the call they just made. The social node names exactly who — and what — drove it, each weight shown. My input is in there, weighed against what they already believed. And this isn't 'trust our number': you can recompute every score from the raw inputs we archived." |
| 1:30–1:45 | `/map` → click that citizen → **Replay last decision** lights the retrieved relationship edges | "On the map, replaying that decision lights up the exact relationships the reasoning pulled — the retrieval itself, made visible." |
| 1:45–2:08 | Back to the live feed → **click that decision's "0G Storage ✓" badge** → `/verify/<root>` resolves live to action, reasoning, `verified: true`, root + tx | "Now the part that matters. That badge is a hash — this pulls the record straight back out of 0G Storage by that hash alone. No private key, no trusting us. The decision I just influenced, recovered from the network itself, verified." |
| 2:08–2:20 | `/pricing` + terminal `GET /api/provenance/records` | "The civilization is the demo; the product is this layer — a Research API that exports every 0G-reasoned, keyless-verifiable decision. Rip out 0G and none of it exists — not the reasoning, not the proof. That's the whole point." |

**Honesty note (don't fake the loop):** both a whisper and a world headline take effect on the **next tick** (the world ticks every 2h) — they're *queued*, then a tick drains and applies them. To show it on camera, either intervene *before* recording and let a scheduled tick land, or run one tick manually (`run-scheduler.ts --days 1`) between the intervention and the causal-chain shot. Never paste a pre-saved result as if it were live.

**Forcing a tick does not reset the world** — it's strictly forward/append-only: the day counter advances by one (irreversibly), all pending interventions for that day drain together, and it spends ~0.017 testnet OG (self-stops below the balance floor). It only *advances* the world, never wipes it — so it's safe to use live, but point `DATABASE_URL` at the **prod (Supabase)** world or you'll tick the stale dev DB instead of the judged one. Don't run it while the systemd 2h timer could also fire, or alongside the web server (OOM).

**If you only have ~90 seconds**, drop the headline beat (0:50–1:05) and the `/map` beat (1:30–1:45): Hook → Whisper → Social node → Verify → one product line. (Keep whisper *or* headline, not both, if time is tight.)

**Rehearse the path, not a URL** (every fresh tick re-archives in verifiable shape):
1. Whisper to a citizen, then ensure a tick has landed (`tail tick.log`).
2. `/citizens/[id]` → confirm the **causal chain renders with the Social node** (whisper visible).
3. Back to `/world` → click that decision's **"0G Storage ✓"** badge → confirm `/verify/<root>` resolves to `verified: true`.

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
- [ ] **Scheduler healthy** — `tail tick.log` shows a recent `result=success`. *(The Jun 29 12:00–18:00 UTC stall — 4 ticks lost to a transient 0G RPC `TIMEOUT` at broker creation — is fixed in this PR: retry-with-backoff **plus** multi-endpoint RPC failover in `@civ/zerog`.)*

**Deploy note (do these together — order matters):** the live tick runs `tsx` from source at `/opt/civilization-0`, so the fix only takes effect once master is pulled in. The RPC-failover change reads `ZG_EVM_RPC` as a **comma-separated list**, so the old code and the new `.env` value are incompatible — don't change `.env` before the code is deployed or the next tick breaks.
```bash
# after PR #8 is merged:
cd /opt/civilization-0 && git pull
# then enable failover (pick one):
#   a) remove the ZG_EVM_RPC line from .env  → uses the new default (official + drpc fallback), or
#   b) set ZG_EVM_RPC=https://evmrpc-testnet.0g.ai,https://0g-galileo-testnet.drpc.org
# applies on the next scheduled tick — no restart needed.
```
- [ ] **Description** (above) pasted into the form.
- [ ] One team, one project; no `.env` or secrets committed.
