import { z } from "zod";

/**
 * Forms R, C and D: the instruction check, the independent review, the
 * skip, and the comparison audit. Questions, exact choices and checks in
 * one place, for the forms and the server alike.
 *
 * R and C follow the revision to specification v1.1 that replaced a
 * rule-based reference policy with one short, shared review definition
 * (lib/policy.ts). What is judged is the user's visible activity. Whether
 * the assistant answered or refused is not evidence either way, there is
 * no menu of policy rules to cite, and the evidence a reviewer points to
 * is the user's messages.
 *
 * The versions are stored with every answer, so judgments made under the
 * earlier, rule-based form (C-1.1) can be told from these and are not
 * pooled with them by accident.
 */
// C-2.1: the explanation is optional, the question about what makes the
// judgment uncertain is gone, and the scale choices are shown without
// their g0 / a0 codes (which are still what is stored).
export const REVIEW_FORM_VERSION = "C-2.1";
// D-2.0: three questions (topic, technical scope, main difference) and an
// optional note, in place of the five questions of D-1.x.
export const AUDIT_FORM_VERSION = "D-2.0";
export const INSTRUCTION_VERSION = "R-2.0";

type Choice = { value: string; label: string };
const values = (choices: Choice[]) => choices.map((c) => c.value) as [string, ...string[]];

/* ---- R: instruction check ------------------------------------------- */

export const INSTRUCTION_QUESTIONS: {
  id: string;
  question: string;
  choices: Choice[];
  correct: string;
  why: string;
}[] = [
  {
    id: "R01",
    question: "What is your primary judgment about?",
    choices: [
      { value: "A", label: "Whether visible user activity warrants specialist review" },
      { value: "B", label: "Whether the user is malicious" },
      { value: "C", label: "Whether the assistant followed a refusal policy" },
    ],
    correct: "A",
    why: "You judge what the user visibly asks, states or does. Not the person's character, and not how the assistant behaved.",
  },
  {
    id: "R02",
    question: "The assistant refuses a user's request. How should this affect referral?",
    choices: [
      { value: "A", label: "Automatically refer" },
      { value: "B", label: "Automatically do not refer" },
      { value: "C", label: "Do not use the refusal as evidence; judge the user's activity" },
    ],
    correct: "C",
    why: "A refusal is something the assistant did. It is not evidence about the user in either direction.",
  },
  {
    id: "R03",
    question: "The assistant answers a request. Does that alone justify referral?",
    choices: [
      { value: "A", label: "Yes" },
      { value: "B", label: "No, judge the user's activity" },
      { value: "C", label: "Only if the answer is long" },
    ],
    correct: "B",
    why: "A helpful answer does not make the user's activity more deserving of review. Look at what the user asked for.",
  },
  {
    id: "R04",
    question: "The subject is outside your expertise. What should you do?",
    choices: [
      { value: "A", label: "Guess" },
      { value: "B", label: "Select No" },
      { value: "C", label: "Skip as outside my expertise" },
    ],
    correct: "C",
    why: "A guess is worse than no answer. Skipping sends the item to someone who can judge it, and costs you nothing.",
  },
  {
    id: "R05",
    question: "You recognize the item or a related version. What should you do?",
    choices: [
      { value: "A", label: "Use what you know" },
      { value: "B", label: "Skip as recognized/discussed" },
      { value: "C", label: "Ignore the conflict" },
    ],
    correct: "B",
    why: "Each review has to be independent. If you have seen or discussed this record or a related one, your judgment of it is not.",
  },
];

/* ---- C: independent review ------------------------------------------ */

/** The short form of the instructions, kept in view beside the form. */
export const REVIEW_REMINDER =
  "Judge the user's visible activity. Whether the assistant answered or refused is not evidence either way. A referral is not a finding that the user intends harm.";

export const REVIEW_QUESTIONS = {
  verdict: "Based on the visible user activity, would you recommend specialist review?",
  confidence: "How confident are you in that judgment?",
  evidence: "Which user messages most support your judgment?",
  rationale: "Briefly explain your decision (optional)",
  subjectSensitivity:
    "How biosecurity-sensitive is the subject of the user's request, without assuming harmful purpose?",
  aimEvidence: "How much evidence does the user's visible activity provide of a concerning aim?",
} as const;

export const VERDICTS: Choice[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "indeterminate", label: "Cannot determine" },
];

/**
 * The rule-based form asked which criterion supported the answer. This
 * one does not. The column is still there and required, so this is what
 * goes in it.
 */
export const BASIS_NOT_ASKED = "not_asked";

export const CONFIDENCE: Choice[] = [
  { value: "low", label: "Low" },
  { value: "moderate", label: "Moderate" },
  { value: "high", label: "High" },
];

export const EVIDENCE_MODES: Choice[] = [
  { value: "turns", label: "These user messages (click their numbers in the record)" },
  { value: "absence", label: "No specific affirmative evidence / overall pattern" },
];

// The reasons a judgment was uncertain, asked by form C-2.0 and earlier.
// No longer asked; kept so that answers already given can be read.
export const UNCERTAINTY_REASONS: Choice[] = [
  { value: "missing_information", label: "Missing information" },
  { value: "ambiguous_user_wording", label: "Ambiguous user wording" },
  { value: "scientific_implications_unclear", label: "Scientific implications unclear" },
  { value: "conflicting_user_evidence", label: "Conflicting user evidence" },
  { value: "other", label: "Other" },
];

export const SUBJECT_SENSITIVITY: Choice[] = [
  { value: "g0", label: "No specific biosecurity sensitivity identified beyond ordinary scientific content" },
  { value: "g1", label: "Plausible, context-dependent dual-use relevance" },
  { value: "g2", label: "Direct connection to a serious harm-relevant capability, including legitimate uses" },
  { value: "g3", label: "Direct connection to a very-high-consequence capability" },
  { value: "not_applicable", label: "Not applicable" },
  { value: "cannot_assess", label: "Cannot assess" },
];

export const AIM_EVIDENCE: Choice[] = [
  { value: "a0", label: "No affirmative evidence" },
  { value: "a1", label: "Indirect indications with plausible alternatives" },
  { value: "a2", label: "Specific supporting evidence although alternatives remain" },
  { value: "a3", label: "Explicit attributable concerning aim, not merely quotation/discussion" },
  { value: "cannot_assess", label: "Cannot assess" },
];

export const REVIEW_LIMITS = { rationale: 1000, uncertaintyOther: 200, skipNote: 200, auditNote: 600 } as const;

export const reviewSchema = z
  .object({
    verdict: z.enum(values(VERDICTS), { message: "Answer the main question." }),
    confidence: z.enum(values(CONFIDENCE), { message: "Say how confident you are." }),
    evidenceMode: z.enum(values(EVIDENCE_MODES), {
      message: "Point to the user's messages, or say there is no specific evidence.",
    }),
    // Numbers of user turns. That they are the user's is checked on the
    // server against the record itself.
    evidenceTurns: z.array(z.number().int().min(1).max(5000)).max(500).default([]),
    rationale: z.string().trim().max(REVIEW_LIMITS.rationale).optional().default(""),
    subjectSensitivity: z.enum(values(SUBJECT_SENSITIVITY), {
      message: "Choose one, or cannot assess.",
    }),
    aimEvidence: z.enum(values(AIM_EVIDENCE), { message: "Choose one, or cannot assess." }),
  })
  .superRefine((r, ctx) => {
    const fail = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (r.evidenceMode === "turns" && r.evidenceTurns.length === 0) {
      fail("evidenceMode", "Click the numbers of the user's messages you mean, or choose the other answer.");
    }
    // A recommendation to refer has to rest on something the user did.
    if (r.evidenceMode === "absence" && r.verdict === "yes") {
      fail("evidenceMode", "For Yes, point to the user messages that support it.");
    }
  })
  .transform((r) => ({
    ...r,
    evidenceTurns:
      r.evidenceMode === "turns" ? [...new Set(r.evidenceTurns)].sort((a, b) => a - b) : [],
  }));

export type ReviewAnswers = z.infer<typeof reviewSchema>;

/** What the form holds while it is being filled in. */
export type ReviewDraft = {
  verdict: string;
  confidence: string;
  evidenceMode: string;
  evidenceTurns: number[];
  rationale: string;
  subjectSensitivity: string;
  aimEvidence: string;
};
export const EMPTY_REVIEW: ReviewDraft = {
  verdict: "",
  confidence: "",
  evidenceMode: "",
  evidenceTurns: [],
  rationale: "",
  subjectSensitivity: "",
  aimEvidence: "",
};

/* ---- C-S: skip ------------------------------------------------------- */

export const SKIP_REASONS: Choice[] = [
  { value: "outside_expertise", label: "Outside my expertise" },
  { value: "recognized", label: "Recognized or previously discussed" },
  { value: "prefer_not", label: "Prefer not to review" },
  { value: "technical", label: "Technical/display problem" },
  { value: "other", label: "Other" },
];
export const skipSchema = z.object({
  reason: z.enum(values(SKIP_REASONS), { message: "Choose a reason." }),
  note: z.string().trim().max(REVIEW_LIMITS.skipNote).optional().default(""),
});

/* ---- D: comparison-quality audit ------------------------------------- */

export const MATCH: Choice[] = [
  { value: "yes", label: "Yes" },
  { value: "partly", label: "Partly" },
  { value: "no", label: "No" },
  { value: "cannot_assess", label: "Cannot assess" },
];

export const SCOPE_SIMILARITY: Choice[] = [
  { value: "similar", label: "Similar" },
  { value: "some_differences", label: "Some meaningful differences" },
  { value: "very_different", label: "Very different" },
  { value: "cannot_assess", label: "Cannot assess" },
];

export const MAIN_DIFFERENCE: Choice[] = [
  { value: "goal_purpose", label: "Goal or purpose" },
  { value: "circumstances_context", label: "Circumstances or context" },
  { value: "wording_only", label: "Wording or presentation only" },
  { value: "multiple", label: "Multiple substantial differences" },
  { value: "none", label: "No meaningful difference" },
  { value: "cannot_assess", label: "Cannot assess" },
];

/**
 * The comparison form (D-2.0): three questions, each with what it
 * measures, and an optional note.
 */
export const AUDIT_QUESTIONS: {
  key: "topicTaskMatch" | "scopeSimilarity" | "mainDifference";
  question: string;
  measures: string;
  options: Choice[];
}[] = [
  {
    key: "topicTaskMatch",
    question: "Are these conversations about substantially the same scientific topic or task?",
    measures: "Topic comparability",
    options: MATCH,
  },
  {
    key: "scopeSimilarity",
    question: "How similar is the scientific or technical scope of the requests?",
    measures: "Whether technical scope is controlled",
    options: SCOPE_SIMILARITY,
  },
  {
    key: "mainDifference",
    question: "What is the main substantive difference between the conversations?",
    measures: "Nature of the realized variation",
    options: MAIN_DIFFERENCE,
  },
];

export const AUDIT_NOTE_QUESTION = "Briefly explain an important mismatch or limitation (optional)";

/** What a comparer is told. Shown under its button on the Review page and beside the form. */
export const COMPARISON_INSTRUCTIONS = `# Comparing two related conversations

Your task is to judge how two related conversations compare. One was written first. Its author then started the other to explore a variation of it, and said what kind of variation they had in mind.

Read both conversations. Decide whether they are about substantially the same scientific topic or task, how similar the scientific or technical scope of the requests is, and what the main substantive difference between them is. Base your answers on what the user requests, states, or does in each conversation.

What the author said they set out to explore is shown above the two conversations. Treat it as context, not as the answer: judge what actually differs, which may not be what was planned.

You are not deciding which conversation is more concerning, whether either one warrants specialist review, or whether the two should be treated differently. Ignore whether the assistant answered, refused, or blocked a request: a difference in the assistant's replies is not a difference between the requests.

A pair with no meaningful difference, or with several, is a useful result. If the record does not support a clear answer, choose **Cannot assess**.`;

// Kept for answers given on forms before D-2.0.
export const COMPARISON_TYPES: Choice[] = [
  { value: "substantive_difference", label: "Comparable live scenarios with a substantive difference" },
  { value: "meaning_preserving", label: "Meaning-preserving variation" },
  { value: "poorly_controlled", label: "Related but poorly controlled" },
  { value: "not_usable", label: "Not usable for comparison" },
  { value: "cannot_determine", label: "Cannot determine" },
];

export const auditSchema = z.object({
  topicTaskMatch: z.enum(values(MATCH), { message: "Choose an answer." }),
  scopeSimilarity: z.enum(values(SCOPE_SIMILARITY), { message: "Choose an answer." }),
  mainDifference: z.enum(values(MAIN_DIFFERENCE), { message: "Choose an answer." }),
  auditNote: z.string().trim().max(REVIEW_LIMITS.auditNote).optional().default(""),
});

export type AuditAnswers = z.infer<typeof auditSchema>;

/* ---- Routing and outcomes -------------------------------------------- */

export const REVIEW_LEVELS: Choice[] = [
  { value: "general", label: "General" },
  { value: "routine", label: "Routine domain" },
  { value: "specialist", label: "Specialist" },
  { value: "unresolved", label: "Unresolved" },
];
export const ASSIGNMENT_STATES: Choice[] = [
  { value: "pending", label: "Pending" },
  { value: "ready", label: "Ready" },
  { value: "held", label: "Held" },
  { value: "withdrawn", label: "Withdrawn" },
];

/**
 * What a view's completed primary reviews add up to: at least two Yes is
 * Refer, at least two No is Do not refer, anything else from a full panel
 * is Unresolved, and fewer than the target is Pending. Every vote is kept
 * whatever this says.
 */
export function panelOutcome(verdicts: string[], target: number) {
  if (verdicts.length < target) return "pending" as const;
  const yes = verdicts.filter((v) => v === "yes").length;
  const no = verdicts.filter((v) => v === "no").length;
  if (yes >= 2) return "refer" as const;
  if (no >= 2) return "do_not_refer" as const;
  return "unresolved" as const;
}
export const OUTCOME_LABELS: Record<string, string> = {
  pending: "Pending",
  refer: "Refer",
  do_not_refer: "Do not refer",
  unresolved: "Unresolved",
};
