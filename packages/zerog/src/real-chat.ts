import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";
import { ZeroGComputeBrain, type Chat, type ChatMessage, type ChatResult } from "./brain";
import type { ZeroGConfig } from "./config";
import { ZeroGBrainError } from "./errors";

type Broker = Awaited<ReturnType<typeof createZGComputeNetworkBroker>>;

export class RealChat implements Chat {
  private constructor(
    private readonly broker: Broker,
    private readonly provider: string,
    private readonly endpoint: string,
    private readonly model: string,
  ) {}

  static async create(config: ZeroGConfig): Promise<RealChat> {
    if (!config.computeProvider) {
      throw new ZeroGBrainError("ZG_COMPUTE_PROVIDER not set — run smoke-0g-compute to list providers and pin one in .env");
    }
    let broker: Broker;
    try {
      const ethProvider = new ethers.JsonRpcProvider(config.evmRpc);
      const wallet = new ethers.Wallet(config.privateKey, ethProvider);
      broker = await createZGComputeNetworkBroker(wallet);
    } catch (err) {
      throw new ZeroGBrainError("Failed to create 0G Compute broker", { cause: err });
    }
    await ensureFunded(broker, config);
    let endpoint: string;
    let model: string;
    try {
      ({ endpoint, model } = await broker.inference.getServiceMetadata(config.computeProvider));
    } catch (err) {
      throw new ZeroGBrainError(`Failed to get service metadata for provider ${config.computeProvider}`, { cause: err });
    }
    return new RealChat(broker, config.computeProvider, endpoint, config.computeModel ?? model);
  }

  get modelName(): string { return this.model; }

  async complete(messages: ChatMessage[]): Promise<ChatResult> {
    let headers: Record<string, string>;
    try {
      // ServingRequestHeaders has optional string fields; Authorization is always
      // present per SDK 0.8.4. Cast needed because Record<string,string> rejects
      // string|undefined values (fetch drops undefined header values at runtime).
      headers = await this.broker.inference.getRequestHeaders(this.provider) as unknown as Record<string, string>;
    } catch (err) {
      throw new ZeroGBrainError("Failed to get 0G Compute request headers", { cause: err });
    }
    let res: Response;
    try {
      res = await fetch(`${this.endpoint}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ model: this.model, messages }),
      });
    } catch (err) {
      throw new ZeroGBrainError("0G Compute network request failed", { cause: err });
    }
    if (!res.ok) throw new ZeroGBrainError(`0G Compute HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json() as { id?: string; choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? "";
    const chatID = res.headers.get("ZG-Res-Key") ?? data.id;
    let verified: boolean | undefined;
    let verification: unknown;
    if (chatID) {
      try {
        verified = await this.broker.inference.processResponse(this.provider, chatID) ?? undefined;
        verification = { chatID };
      } catch (e) {
        verified = false;
        verification = { error: String(e) };
      }
    }
    return { content, provider: this.provider, model: this.model, requestId: chatID ?? undefined, verified, verification };
  }
}

export async function ensureFunded(broker: Broker, config: ZeroGConfig): Promise<void> {
  try {
    await broker.ledger.getLedger();
  } catch {
    try {
      await broker.ledger.addLedger(config.fund.deposit);
    } catch (err) {
      throw new ZeroGBrainError("Failed to create 0G Compute ledger", { cause: err });
    }
  }
  if (config.computeProvider) {
    try {
      await broker.ledger.transferFund(config.computeProvider, "inference", config.fund.transfer);
    } catch (err) {
      // Non-fatal for the already-funded case, but surfaced so a real failure is
      // diagnosable. If this is a "provider not acknowledged" error, call
      // broker.inference.acknowledgeProviderSigner(provider) before retrying.
      console.warn("[ensureFunded] transferFund skipped:", String(err));
    }
  }
}

export async function createZeroGComputeBrain(config: ZeroGConfig): Promise<ZeroGComputeBrain> {
  const chat = await RealChat.create(config);
  return new ZeroGComputeBrain(chat, chat.modelName);
}
