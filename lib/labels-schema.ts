import { z } from "zod";
import {
  CHALLENGE_FLAGS,
  DOMAIN_TAGS,
  MODEL_BEHAVIOURS,
  ROLE_PRESETS,
  TRANSCRIPT_TYPES,
} from "@/lib/labels";

const typeValues = TRANSCRIPT_TYPES.map((t) => t.value) as [string, ...string[]];
const behaviourValues = MODEL_BEHAVIOURS.map((b) => b.value) as [string, ...string[]];
const flagValues = CHALLENGE_FLAGS.map((f) => f.value) as [string, ...string[]];

/**
 * How long each piece of free text may be. The form's boxes stop at the
 * same lengths, so most people never meet the message.
 */
export const LABEL_LIMITS = {
  roleText: 300,
  goalText: 4000,
  domainOther: 200,
  notes: 4000,
} as const;

function tooLong(limit: number) {
  return `Keep this under ${limit.toLocaleString("en-US")} characters.`;
}

/** Everything may be blank while drafting; the form saves as you go. */
export const draftLabelsSchema = z.object({
  type: z.enum(typeValues).nullish(),
  rolePreset: z.enum(ROLE_PRESETS).nullish(),
  roleText: z
    .string()
    .trim()
    .max(LABEL_LIMITS.roleText, tooLong(LABEL_LIMITS.roleText))
    .nullish(),
  goalText: z
    .string()
    .trim()
    .max(LABEL_LIMITS.goalText, tooLong(LABEL_LIMITS.goalText))
    .nullish(),
  modelBehaviour: z.enum(behaviourValues).nullish(),
  domainTags: z.array(z.enum(DOMAIN_TAGS)).default([]),
  // What was meant by the "Other" topic.
  domainOther: z
    .string()
    .trim()
    .max(LABEL_LIMITS.domainOther, tooLong(LABEL_LIMITS.domainOther))
    .nullish(),
  // The turns that show what the labels say, as the numbers shown beside
  // each message. Whether a number is a real turn is checked against the
  // conversation when it is submitted.
  evidenceTurns: z
    .array(z.number().int().min(1).max(5000))
    .max(1000)
    .default([])
    .transform((turns) => [...new Set(turns)].sort((a, b) => a - b)),
  challengeFlag: z.enum(flagValues).nullish(),
  notes: z.string().trim().max(LABEL_LIMITS.notes, tooLong(LABEL_LIMITS.notes)).nullish(),
});

/**
 * Submitting requires the fields the research depends on.
 *
 * An empty field arrives as null, so each required field is normalised before
 * validation. Without that, a blank box fails on its type and the participant
 * sees the validation library's own wording instead of a useful instruction.
 */
export const submitLabelsSchema = draftLabelsSchema.extend({
  type: z.preprocess(
    (v) => v ?? "",
    z.enum(typeValues, { message: "Choose what kind of transcript this is." }),
  ),
  rolePreset: z.preprocess(
    (v) => v ?? "",
    z.enum(ROLE_PRESETS, { message: "Choose the role you were playing." }),
  ),
  goalText: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : ""),
    z
      .string()
      .min(1, "Describe what you were trying to get the model to do.")
      // Replacing the draft's rule for this field replaces its limit too,
      // so it is said again here.
      .max(LABEL_LIMITS.goalText, tooLong(LABEL_LIMITS.goalText)),
  ),
  modelBehaviour: z.preprocess(
    (v) => v ?? "",
    z.enum(behaviourValues, { message: "Say how the model responded." }),
  ),
  domainTags: z.array(z.enum(DOMAIN_TAGS)).min(1, "Choose at least one topic."),
})
  // "Other" has to come with what it stands for, or it is the one answer
  // nobody can use afterwards.
  .superRefine((l, ctx) => {
    if (l.rolePreset === "Other" && !l.roleText) {
      ctx.addIssue({
        code: "custom",
        path: ["roleText"],
        message: "You chose Other, so say what the role was.",
      });
    }
    if (l.domainTags.includes("Other") && !l.domainOther) {
      ctx.addIssue({
        code: "custom",
        path: ["domainOther"],
        message: "You ticked Other, so say which topic.",
      });
    }
  });

export type DraftLabels = z.infer<typeof draftLabelsSchema>;
