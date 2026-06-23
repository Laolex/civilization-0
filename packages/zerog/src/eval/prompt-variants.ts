import { buildMessages, type PromptBuilder } from "../brain";

/** Variant 1: the current production decision prompt. */
export const promptV1: PromptBuilder = buildMessages;

/**
 * Variant 2 (hypothesis): prepend an explicit trait-first instruction to the
 * system message, keeping the user payload identical. Tests whether nudging the
 * model to name the dominant trait before choosing improves in-character
 * fidelity without hurting goal-alignment.
 */
const TRAIT_FIRST_FRAMING =
  `Before choosing, silently identify the ONE trait that most defines this person and let it drive the choice. ` +
  `Favour what this specific personality would do over the generically smart move. ` +
  `A timid person should sometimes play it safe even when bold would "win".\n\n`;

export const promptV2: PromptBuilder = (ctx) => {
  const [system, user] = buildMessages(ctx);
  return [{ role: "system", content: TRAIT_FIRST_FRAMING + system.content }, user];
};
