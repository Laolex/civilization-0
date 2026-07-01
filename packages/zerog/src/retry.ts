// Bounded retry-with-backoff for transient 0G testnet RPC failures.
//
// Why this exists: scheduler ticks were dying at startup with
//   ZeroGBrainError: Failed to create 0G Compute broker
//   [cause]: ethers { code: 'TIMEOUT', shortMessage: 'request timeout' }
// — a single transient RPC timeout against the 0G EVM RPC failed the *whole*
// tick (no retry), stalling autonomy for hours until the RPC recovered. Wrapping
// the network-bound setup calls in withRetry turns a momentary blip into a brief
// pause instead of a lost tick. Pure + injectable sleep, so it's unit-tested
// without real waits or a live network.

export interface RetryOptions {
  /** Total attempts including the first (default 5). */
  attempts?: number;
  /** Backoff before the first retry, in ms (default 1000). */
  baseMs?: number;
  /** Upper bound on any single backoff, in ms (default 20000). */
  maxMs?: number;
  /** Exponential growth factor (default 2). */
  factor?: number;
  /** Decide whether an error is worth retrying (default: isTransientError). */
  isRetryable?: (err: unknown) => boolean;
  /** Injectable delay — overridden in tests to avoid real waits. */
  sleep?: (ms: number) => Promise<void>;
  /** Side-channel for logging each retry. */
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
}

const TRANSIENT =
  /\btimeout\b|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EPIPE|socket hang up|network error|SERVER_ERROR|NETWORK_ERROR|\b50[234]\b|\b429\b/i;

/**
 * True for the classes of failure that a momentary 0G RPC / network blip
 * produces — timeouts, dropped connections, 5xx/429 — and false for clearly
 * permanent errors (bad config, insufficient funds) so those fail fast.
 * Walks `cause` because ethers v6 (and our ZeroGBrainError) nest the root cause.
 */
export function isTransientError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown; shortMessage?: unknown; cause?: unknown };
  if (typeof e.code === "string" && e.code.toUpperCase() === "TIMEOUT") return true;
  const text = [e.message, e.shortMessage, e.code].filter((v) => typeof v === "string").join(" ");
  if (text && TRANSIENT.test(text)) return true;
  if (e.cause && e.cause !== err) return isTransientError(e.cause);
  return false;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn`, retrying transient failures with exponential backoff. Re-throws
 * immediately on a non-retryable error or once attempts are exhausted.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 5;
  const baseMs = opts.baseMs ?? 1000;
  const maxMs = opts.maxMs ?? 20000;
  const factor = opts.factor ?? 2;
  const isRetryable = opts.isRetryable ?? isTransientError;
  const sleep = opts.sleep ?? defaultSleep;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= attempts || !isRetryable(err)) throw err;
      const delay = Math.min(maxMs, Math.round(baseMs * factor ** (attempt - 1)));
      opts.onRetry?.(err, attempt, delay);
      await sleep(delay);
    }
  }
  throw lastErr; // unreachable, but satisfies the type checker
}
