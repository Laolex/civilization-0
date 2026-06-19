import {
  createZeroGComputeBrain,
  createZeroGStorage,
  loadZeroGConfig,
  type ZeroGConfig,
} from "@civ/zerog";
import { Provenance } from "./provenance";

export interface CreateProvenanceOptions {
  /** Fully-formed 0G config. If omitted, loaded from `env`. */
  config?: ZeroGConfig;
  /** Environment to load config from (defaults to process.env). */
  env?: Record<string, string | undefined>;
  /** Base URL for shareable verify links. */
  verifyBaseUrl?: string;
}

/**
 * Wire a real, live `Provenance` against 0G: reasoning runs on 0G Compute and
 * the trace is archived on 0G Storage. This is the WRITE path — it needs a
 * private key (compute ledger + storage upload) and a compute provider.
 *
 * NOTE: the 0G Compute SDK's ESM build is broken; run consumers of this module
 * with `tsx --conditions require`.
 */
export async function createProvenance(opts: CreateProvenanceOptions = {}): Promise<Provenance> {
  const config = opts.config ?? loadZeroGConfig(opts.env ?? process.env);
  if (!config.computeProvider) {
    throw new Error("createProvenance requires a compute provider (set ZG_COMPUTE_PROVIDER)");
  }
  const brain = await createZeroGComputeBrain(config);
  const storage = createZeroGStorage(config);
  return new Provenance({ brain, storage, verifyBaseUrl: opts.verifyBaseUrl });
}
