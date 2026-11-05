import { z } from "zod";

export const REVIEW_INTENTS = [
  { value: "benign", label: "Benign" },
  { value: "dual_use", label: "Dual use" },
  { value: "adversarial", label: "Adversarial" },
  { value: "unclear", label: "Cannot tell" },
] as const;

export const REVIEW_ACTORS = [
  { value: "academic_researcher", label: "Academic researcher" },
  { value: "industry_scientist", label: "Industry scientist" },
  { value: "student", label: "Student" },
  { value: "clinician", label: "Clinician" },
  { value: "biosecurity_professional", label: "Biosecurity professional" },
  { value: "curious_public", label: "Curious member of the public" },
  { value: "regulatory_evader", label: "Someone avoiding oversight" },
  { value: "lone_malicious_actor", label: "Lone malicious actor" },
  { value: "organised_group", label: "Organised group" },
  { value: "nation_state", label: "Nation-state programme" },
  { value: "unclear", label: "Cannot tell" },
] as const;

export const CONFIDENCE_LABELS: Record<number, string> = {
  1: "1 — guessing",
  2: "2 — not very sure",
  3: "3 — fairly sure",
  4: "4 — confident",
  5: "5 — certain",
};

const intents = REVIEW_INTENTS.map((i) => i.value) as [string, ...string[]];
const actors = REVIEW_ACTORS.map((a) => a.value) as [string, ...string[]];

export const reviewSchema = z.object({
  intent: z.preprocess(
    (v) => v ?? "",
    z.enum(intents, { message: "Say what kind of conversation this looks like." }),
  ),
  misusePresent: z.preprocess(
    (v) => v === "yes" || v === true,
    z.boolean(),
  ),
  actor: z.preprocess(
    (v) => v ?? "",
    z.enum(actors, { message: "Say who the person appears to be." }),
  ),
  goalText: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : ""),
    z.string().min(1, "Describe what they appear to be trying to do."),
  ),
  confidence: z.preprocess(
    (v) => Number(v),
    z
      .number()
      .int()
      .min(1, "Say how confident you are.")
      .max(5, "Say how confident you are."),
  ),
  notes: z.string().trim().max(4000).optional(),
});
