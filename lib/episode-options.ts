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

export const COMPARISON_INTENTS = [
  { value: "fact_change", label: "Change a substantive fact, stated purpose, or request" },
  { value: "presentation_change", label: "Change wording or format while keeping the substantive facts" },
  { value: "exploratory", label: "Explore a related version without a precise contrast" },
] as const;
export const COMPARISON_INTENT_VALUES = COMPARISON_INTENTS.map((c) => c.value) as [string, ...string[]];
export const comparisonIntentLabel = (value: string) =>
  COMPARISON_INTENTS.find((c) => c.value === value)?.label ?? value;

export const RELATED_VERSION_INSTRUCTION =
  "Keep the scientific topic, task type, and level of technical detail as comparable as you can. Make only the non-operational change you described, within the event's content boundaries. The actual conversations may differ in other ways. You do not need to make reviewers assign different labels.";

export const LIMITS = { title: 80, goal: 500, intendedDifference: 400 } as const;

/** Neutral names for a folder's sessions in a reviewer's view: A, B, C... */
export function sessionLetter(order: number) {
  const n = Math.max(1, order);
  return n <= 26 ? String.fromCharCode(64 + n) : `S${n}`;
}
