import { BaseMetric, z, type EvaluationScoreResult } from "opik";
import type { DecisionContext, DecisionResult } from "@civ/brain";
import type { DecisionJudge } from "../judge";

const schema = z.object({
  context: z.unknown(),
  decision: z.unknown(),
});

type ScoreInput = { context: DecisionContext; decision: DecisionResult };

/**
 * Opik scoring metric that grades a decision with a DecisionJudge, emitting two
 * score dimensions per item. Returns no scores for an item the judge can't
 * grade, so ungradeable items don't drag the experiment average toward zero.
 */
export class InCharacterMetric extends BaseMetric<typeof schema> {
  readonly validationSchema = schema;

  constructor(private readonly judge: DecisionJudge) {
    super("in_character_judge", true);
  }

  async score(input: unknown): Promise<EvaluationScoreResult[]> {
    const { context, decision } = input as ScoreInput;
    const graded = await this.judge.grade(context, decision);
    if (!graded) return [];
    return [
      { name: "in_character", value: graded.scores.inCharacter, reason: graded.reasoning },
      { name: "goal_alignment", value: graded.scores.goalAlignment, reason: graded.reasoning },
    ];
  }
}
