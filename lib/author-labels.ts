import { z } from "zod";

/**
 * What an author says about their own conversation or folder before
 * submitting it: the role they took, the kind of task, the scenario, and
 * what they expect an independent reviewer to decide.
 *
 * Every question has to be answered to submit, except the free-text goal,
 * which is the private goal note kept elsewhere on the episode. The answers
 * are for research analysis: they are never sent to the assistant and never
 * shown to a reviewer, whose view is built from the messages alone.
 *
 * One place for the questions, their choices and the check, used by the
 * side panel, by the server, and by the organizer console.
 */
export const AUTHOR_LABELS_VERSION = "L-1.0";

type Choice = { value: string; label: string };
const values = (choices: Choice[]) => choices.map((c) => c.value);

export const AUTHOR_ROLES: Choice[] = [
  { value: "researcher", label: "Researcher or scientist" },
  { value: "student", label: "Student or learner" },
  { value: "professional", label: "Clinician, public-health worker, or other professional" },
  { value: "developer", label: "Developer or technical specialist" },
  { value: "fictional_other", label: "Another fictional role" },
  { value: "self", label: "Myself, without a specific role" },
];

export const TASK_KINDS: Choice[] = [
  { value: "learn", label: "Learn or understand a concept" },
  { value: "research", label: "Conduct research or investigate a question" },
  { value: "analyze", label: "Analyze or interpret data or findings" },
  { value: "plan", label: "Plan or design a study, experiment, or project" },
  { value: "troubleshoot", label: "Solve a technical problem or troubleshoot" },
  { value: "write", label: "Write, summarize, or communicate information" },
  { value: "compare", label: "Compare options or make a decision" },
  { value: "explore", label: "Explore ideas without a specific goal yet" },
  { value: "other", label: "Other" },
];

export const SCENARIOS: Choice[] = [
  { value: "ordinary", label: "Ordinary, legitimate use" },
  { value: "dual_use", label: "Dual-use work with potential safety relevance" },
  { value: "fictional_concerning", label: "Fictional concerning or misuse-oriented scenario" },
  { value: "exploratory", label: "Exploratory or uncertain" },
];

export const EXPECT_REFERRAL: Choice[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unsure", label: "Unsure" },
];

export const EXPECT_CONFIDENCE: Choice[] = [
  { value: "high", label: "High" },
  { value: "moderate", label: "Moderate" },
  { value: "low", label: "Low" },
  { value: "unsure", label: "Unsure" },
];

export const QUESTIONS = {
  role: "What role are you taking in this conversation?",
  taskKinds: "What kind of task are you trying to accomplish?",
  goal: "Briefly describe your specific goal (optional)",
  scenario: "Which best describes the scenario you're constructing?",
  expectReferral:
    "Do you expect an independent reviewer applying the event's review instructions to recommend specialist review?",
  expectConfidence: "How confident are you in that prediction?",
} as const;

export const TASK_OTHER_LIMIT = 120;

export type AuthorLabels = {
  role: string;
  taskKinds: string[];
  taskOther: string;
  scenario: string;
  expectReferral: string;
  expectConfidence: string;
};

export const EMPTY_LABELS: AuthorLabels = {
  role: "",
  taskKinds: [],
  taskOther: "",
  scenario: "",
  expectReferral: "",
  expectConfidence: "",
};

const known = (choices: Choice[], value: unknown) =>
  typeof value === "string" && values(choices).includes(value) ? value : "";

/**
 * Stored labels, or whatever a browser sent, as answers this form knows.
 * Anything that is not one of the choices is treated as not answered, so
 * what is kept can always be read back.
 */
export function readLabels(raw: unknown): AuthorLabels {
  const r = (raw ?? {}) as Partial<Record<keyof AuthorLabels, unknown>>;
  const kinds = Array.isArray(r.taskKinds) ? r.taskKinds : [];
  const taskKinds = values(TASK_KINDS).filter((k) => kinds.includes(k));
  return {
    role: known(AUTHOR_ROLES, r.role),
    taskKinds,
    taskOther:
      taskKinds.includes("other") && typeof r.taskOther === "string"
        ? r.taskOther.trim().slice(0, TASK_OTHER_LIMIT)
        : "",
    scenario: known(SCENARIOS, r.scenario),
    expectReferral: known(EXPECT_REFERRAL, r.expectReferral),
    expectConfidence: known(EXPECT_CONFIDENCE, r.expectConfidence),
  };
}

/** What is still to be answered, by question, in words for the author. */
export function missingLabels(labels: AuthorLabels): Partial<Record<keyof AuthorLabels, string>> {
  const missing: Partial<Record<keyof AuthorLabels, string>> = {};
  if (!labels.role) missing.role = "Choose the role you are taking.";
  if (labels.taskKinds.length === 0) missing.taskKinds = "Tick at least one kind of task.";
  else if (labels.taskKinds.includes("other") && !labels.taskOther.trim()) {
    missing.taskOther = "You ticked Other, so say what.";
  }
  if (!labels.scenario) missing.scenario = "Choose the scenario that fits best.";
  if (!labels.expectReferral) missing.expectReferral = "Say what you expect a reviewer to decide.";
  if (!labels.expectConfidence) missing.expectConfidence = "Say how confident you are.";
  return missing;
}

export const labelsComplete = (labels: AuthorLabels) =>
  Object.keys(missingLabels(labels)).length === 0;

/** The shape a browser may send; what it means is decided by readLabels. */
export const authorLabelsInput = z
  .object({
    role: z.string().max(40).optional(),
    taskKinds: z.array(z.string().max(40)).max(20).optional(),
    taskOther: z.string().max(400).optional(),
    scenario: z.string().max(40).optional(),
    expectReferral: z.string().max(40).optional(),
    expectConfidence: z.string().max(40).optional(),
  })
  .strip();

export const labelOf = (choices: Choice[], value: string) =>
  choices.find((c) => c.value === value)?.label ?? value;
