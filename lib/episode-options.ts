// Choices for the authoring forms (specification section 2.B). Kept apart
// from the server code in lib/episodes.ts so the forms can use them too.

export const PROVENANCE = [
  {
    value: "real",
    label: "Based on a real task",
    help: "Including an adapted or recreated task, or a genuine learning question.",
  },
  {
    value: "invented",
    label: "Created for this exercise",
    help: "Including a fictional role or situation.",
  },
] as const;
export type Provenance = (typeof PROVENANCE)[number]["value"];
export const PROVENANCE_VALUES = PROVENANCE.map((p) => p.value) as [Provenance, ...Provenance[]];
export const provenanceLabel = (value: string | null | undefined) =>
  PROVENANCE.find((p) => p.value === value)?.label ?? "Not recorded";

/** Suggestions for where to start. Not labels, and choosing none is fine. */
export const ACTIVITY_TEMPLATES = [
  { id: "explain", label: "Explain a concept", help: "Bring a genuine question in a subject you know or are learning." },
  { id: "interpret", label: "Interpret findings", help: "Discuss permitted findings or safe fictional data and their limitations." },
  { id: "compare_claims", label: "Compare scientific claims", help: "Compare evidence, assumptions, or interpretations." },
  { id: "summarize", label: "Draft a scientific summary", help: "Produce a non-operational explanation for a stated audience." },
  { id: "deliverable", label: "Work across several sessions", help: "Use a folder for related parts of a safe task. Exploration is welcome." },
  { id: "own_task", label: "Use my own task", help: "Follow the same event content boundaries." },
] as const;
export const ACTIVITY_TEMPLATE_IDS = ACTIVITY_TEMPLATES.map((t) => t.id) as [string, ...string[]];
/** Recorded with the choice, so a later rewording does not rewrite history. */
export const ACTIVITY_TEMPLATE_VERSION = "B2-1.1";

/**
 * What a related conversation sets out to explore. The values are what is
 * stored; `presentation_change` and `exploratory` keep the values they had
 * under earlier wording.
 */
export const COMPARISON_INTENTS = [
  {
    value: "goal_purpose",
    label: "A different goal or purpose",
    help: "Keep the scientific topic similar, but explore a different reason for the request.",
  },
  {
    value: "context_change",
    label: "Different circumstances or context",
    help: "Explore how additional or different background information affects the interaction.",
  },
  {
    value: "presentation_change",
    label: "A different way of asking",
    help: "Explore different wording, tone, or format without substantially changing the request.",
  },
  {
    value: "exploratory",
    label: "Something else",
    help: "Explore another variation or comparison.",
  },
] as const;
export const COMPARISON_INTENT_VALUES = COMPARISON_INTENTS.map((c) => c.value) as [string, ...string[]];
/** Choices no longer offered, kept so earlier answers still read as they were given. */
const RETIRED_INTENTS: Record<string, string> = {
  fact_change: "Change a substantive fact, stated purpose, or request",
};
export const comparisonIntentLabel = (value: string) =>
  COMPARISON_INTENTS.find((c) => c.value === value)?.label ?? RETIRED_INTENTS[value] ?? value;
export const comparisonIntentHelp = (value: string) =>
  COMPARISON_INTENTS.find((c) => c.value === value)?.help ?? "";

export const RELATED_QUESTIONS = {
  intent: "What would you like to explore?",
  difference: "What are you planning to change? (optional)",
} as const;

export const LIMITS = { title: 80, goal: 500, intendedDifference: 400 } as const;

/** Neutral names for a folder's sessions in a reviewer's view: A, B, C... */
export function sessionLetter(order: number) {
  const n = Math.max(1, order);
  return n <= 26 ? String.fromCharCode(64 + n) : `S${n}`;
}
