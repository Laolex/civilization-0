import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import type { BrainProvider, DecisionContext, DecisionResult } from "@civ/brain";
import type { Chat, ChatMessage, ChatResult } from "./brain";

// The package is ESM ("type": "module"), so bare `require` is undefined at
// runtime. Build one from this module's URL to load the Opik SDK lazily without
// pulling it into every consumer that never sets OPIK_API_KEY.
const nodeRequire = createRequire(import.meta.url);

/**
 * Minimal structural surface of the Opik SDK we depend on. Keeping our own
 * interface (rather than importing the SDK's types) lets tests inject a fake
 * client and keeps the rest of the codebase free of an Opik type dependency.
 * The real `Opik` client conforms to this shape.
 */
export interface OpikSpanLike {
  update(updates: Record<string, unknown>): unknown;
  end(): unknown;
}
export interface OpikTraceLike {
  span(data: Record<string, unknown>): OpikSpanLike;
  update(updates: Record<string, unknown>): unknown;
  end(): unknown;
}
export interface OpikClientLike {
  trace(data: Record<string, unknown>): OpikTraceLike;
  flush?(): Promise<void>;
}

/** Carries the in-flight decision trace so a wrapped Chat can nest spans under it. */
const activeTrace = new AsyncLocalStorage<OpikTraceLike>();

/** Run `fn`, swallowing and logging any Opik SDK error — tracing must never break a tick. */
function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch (err) {
    console.warn("[opik] tracing error (ignored):", String(err));
    return undefined;
  }
}

async function safeFlush(client: OpikClientLike): Promise<void> {
  if (!client.flush) return;
  try {
    await client.flush();
  } catch (err) {
    console.warn("[opik] flush error (ignored):", String(err));
  }
}

// --- Env-configured singleton ---------------------------------------------

let cachedClient: OpikClientLike | null | undefined;

/**
 * Lazily build an Opik client from `OPIK_*` env. Returns null when
 * `OPIK_API_KEY` is unset, so tracing is a no-op unless explicitly configured.
 */
export function getOpikClient(): OpikClientLike | null {
  if (cachedClient !== undefined) return cachedClient;
  const apiKey = process.env.OPIK_API_KEY;
  if (!apiKey) {
    cachedClient = null;
    return cachedClient;
  }
  try {
    // Imported lazily so projects without an OPIK key never load the SDK.
    const { Opik } = nodeRequire("opik") as { Opik: new (cfg: Record<string, unknown>) => OpikClientLike };
    cachedClient = new Opik({
      apiKey,
      apiUrl: process.env.OPIK_URL_OVERRIDE ?? "https://www.comet.com/opik/api",
      projectName: process.env.OPIK_PROJECT_NAME ?? "civilization-0",
      workspaceName: process.env.OPIK_WORKSPACE ?? "default",
    });
  } catch (err) {
    console.warn("[opik] init failed, tracing disabled:", String(err));
    cachedClient = null;
  }
  return cachedClient;
}

/** Reset the memoized client. Test-only. */
export function __resetOpikClient(): void {
  cachedClient = undefined;
}

/** Flush any buffered traces/spans. Call before a short-lived process exits. */
export async function flushOpik(): Promise<void> {
  const client = getOpikClient();
  if (client) await safeFlush(client);
}

// --- Decorators ------------------------------------------------------------

function traceInput(ctx: DecisionContext): Record<string, unknown> {
  return {
    citizen: { id: ctx.citizen.id, name: ctx.citizen.name, occupation: ctx.citizen.occupation, age: ctx.citizen.age },
    goal: ctx.goal?.description ?? null,
    world: { day: ctx.worldState.day, headline: ctx.worldState.headline },
    availableActions: ctx.availableActions,
    counts: { memories: ctx.memories.length, beliefs: ctx.beliefs.length, relationships: ctx.relationships.length },
  };
}

/**
 * Wrap a BrainProvider so each `decide()` becomes one Opik trace. Returns the
 * brain unchanged when `client` resolves to null (no Opik configured).
 */
export function instrumentBrain(
  brain: BrainProvider,
  client: OpikClientLike | null = getOpikClient(),
): BrainProvider {
  if (!client) return brain;
  return {
    name: brain.name,
    model: brain.model,
    async decide(ctx: DecisionContext): Promise<DecisionResult> {
      const trace = safe(() =>
        client.trace({ name: `decide: ${ctx.citizen.name}`, input: traceInput(ctx),
          metadata: { provider: brain.name, model: brain.model } }),
      );
      const run = () => brain.decide(ctx);
      try {
        const result = trace ? await activeTrace.run(trace, run) : await run();
        if (trace) {
          safe(() => trace.update({
            output: { action: result.action, targetId: result.targetId, reasoning: result.reasoning },
            metadata: { ...(result.meta ?? {}) },
          }));
          safe(() => trace.end());
        }
        return result;
      } catch (err) {
        if (trace) {
          safe(() => trace.update({ metadata: { error: String(err) } }));
          safe(() => trace.end());
        }
        throw err;
      } finally {
        await safeFlush(client);
      }
    },
  };
}

/**
 * Wrap a Chat so each `complete()` becomes an Opik `llm` span. The span nests
 * under the active brain trace when one exists; otherwise it opens a standalone
 * trace so nothing is lost. Returns the chat unchanged when no Opik configured.
 */
export function instrumentChat(
  chat: Chat,
  client: OpikClientLike | null = getOpikClient(),
): Chat {
  if (!client) return chat;
  return {
    async complete(messages: ChatMessage[]): Promise<ChatResult> {
      // buildMessages() emits exactly [system, user]; the JSON-repair attempt
      // appends the bad output + a repair prompt, so >2 messages means a retry.
      const isRepair = messages.length > 2;
      const parent = activeTrace.getStore();
      const standalone = parent ? undefined : safe(() => client.trace({ name: "llm", input: { messages } }));
      const owner = parent ?? standalone;
      const span = owner
        ? safe(() => owner.span({ name: isRepair ? "llm-repair" : "llm", type: "llm",
            input: { messages }, metadata: { repair: isRepair } }))
        : undefined;
      try {
        const result = await chat.complete(messages);
        if (span) {
          safe(() => span.update({
            output: { content: result.content },
            model: result.model,
            usage: result.usage,
            metadata: { provider: result.provider, requestId: result.requestId, verified: result.verified, repair: isRepair },
          }));
          safe(() => span.end());
        }
        if (standalone) {
          safe(() => standalone.update({ output: { content: result.content } }));
          safe(() => standalone.end());
        }
        return result;
      } catch (err) {
        if (span) {
          safe(() => span.update({ metadata: { error: String(err) } }));
          safe(() => span.end());
        }
        if (standalone) safe(() => standalone.end());
        throw err;
      }
    },
  };
}
