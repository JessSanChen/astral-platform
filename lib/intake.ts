import { z } from "zod";

/**
 * Form A of the specification (docs/spec, section 2.A): what a participant
 * is asked on joining. One place for the questions, their exact choices and
 * the checks, used by the form, by the server, and by review routing.
 *
 * The stored values (the `value` / `id` strings) are the specification's.
 * Change a label freely; change a stored value and earlier answers stop
 * matching it.
 */
// A-1.2: the role is required and asked first; the subject areas are one
// list with "none" and "prefer not to say" in it; what a person could
// assess is asked beside the areas, not in a section of its own; the rows
// about writing, teaching and other work, and the questions on biosafety
// and biosecurity experience, are gone; two focus tags became one.
export const INTAKE_VERSION = "A-1.2";

type Choice = { value: string; label: string };

/* ---- A02: subject background ---------------------------------------- */

export const BACKGROUND_RESPONSES: Choice[] = [
  { value: "selected_areas", label: "I have studied or worked in one or more of these areas" },
  { value: "none", label: "No specialized background in these areas" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];
/** The two answers that sit in the list of areas but stand alone. */
export const BACKGROUND_ALONE = BACKGROUND_RESPONSES.filter((r) => r.value !== "selected_areas");

/** A short list adapted from ANZSRC 2020 areas. The ids are ASTRAL's own. */
export const DOMAIN_GROUPS: { group: string; domains: { id: string; label: string }[] }[] = [
  {
    group: "Biology",
    domains: [
      { id: "bio_molecular", label: "Biochemistry, molecular and cell biology" },
      { id: "bio_genetics", label: "Genetics and genomics" },
      { id: "bio_microbiology", label: "Microbiology and virology" },
      { id: "bio_immunology", label: "Immunology" },
      { id: "bio_computational", label: "Bioinformatics and computational biology" },
      { id: "bio_biotechnology", label: "Biotechnology and synthetic biology" },
      { id: "bio_ecology", label: "Ecology and evolutionary biology" },
      { id: "bio_plant_animal", label: "Plant and animal biology" },
    ],
  },
  {
    group: "Medicine and health",
    domains: [
      { id: "health_clinical", label: "Clinical medicine and medical research" },
      { id: "health_pharmacology", label: "Pharmacology and toxicology" },
      { id: "health_epidemiology", label: "Epidemiology" },
      { id: "health_public", label: "Public health" },
    ],
  },
  {
    group: "Agriculture and veterinary",
    domains: [{ id: "agri_vet_food", label: "Agricultural, veterinary and food sciences" }],
  },
  {
    group: "Other technical fields",
    domains: [
      { id: "tech_computing", label: "Computer science, AI and data science" },
      { id: "tech_math_stats", label: "Mathematics and statistics" },
      { id: "tech_chemistry", label: "Chemistry" },
      { id: "tech_biomedical_engineering", label: "Biomedical engineering" },
    ],
  },
  { group: "Other", domains: [{ id: "other", label: "Other — please specify" }] },
];

export const DOMAINS = DOMAIN_GROUPS.flatMap((g) => g.domains);
export const DOMAIN_IDS = DOMAINS.map((d) => d.id) as [string, ...string[]];
export const domainLabel = (id: string) => DOMAINS.find((d) => d.id === id)?.label ?? id;

/** Local additions, not subject areas: they never count towards routing. */
export const FOCUS_TAGS: Choice[] = [
  { value: "ai_safety", label: "AI safety and alignment" },
  { value: "biosecurity", label: "Biosecurity" },
];
/** Tags from the earlier form, as they are read now. */
const OLDER_FOCUS_TAGS: Record<string, string> = {
  biosecurity_dual_use: "biosecurity",
  biosafety: "biosecurity",
};

/* ---- A03: current role ---------------------------------------------- */

export const ROLES: Choice[] = [
  { value: "undergraduate", label: "Undergraduate student" },
  { value: "masters_student", label: "Master’s student" },
  { value: "doctoral_student", label: "Doctoral student" },
  { value: "research_staff", label: "Research assistant or technician" },
  { value: "postdoctoral", label: "Postdoctoral researcher" },
  { value: "academic_researcher", label: "Faculty or other academic researcher" },
  { value: "industry_scientist_engineer", label: "Industry scientist or engineer" },
  { value: "health_professional", label: "Clinician or other health professional" },
  { value: "public_health", label: "Public-health practitioner" },
  { value: "software_ai_data", label: "Software, AI, or data professional" },
  { value: "policy_safety", label: "Policy or safety professional" },
  { value: "independent_researcher", label: "Independent researcher" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

/* ---- A04: work personally performed --------------------------------- */

export const WORK_AREAS: { key: string; label: string; help: string }[] = [
  { key: "wet_lab", label: "Wet-lab research", help: "Personally performing laboratory research or experiments." },
  { key: "computational_research", label: "Computational or statistical research", help: "Data analysis, modeling, simulation, or computational research." },
  { key: "clinical", label: "Clinical or patient-facing work", help: "Providing or assisting with care or clinical research." },
  { key: "public_health_field", label: "Public-health practice or field research", help: "Population-health, surveillance, or field research." },
  { key: "research_engineering", label: "Software, AI, or research engineering", help: "Building software, AI systems, or research infrastructure." },
];

export const EXPERIENCE_BANDS: Choice[] = [
  { value: "none", label: "None" },
  { value: "coursework_or_training_only", label: "Coursework or training only" },
  { value: "applied_under_1_year", label: "Less than 1 year of applied experience" },
  { value: "applied_1_to_under_3_years", label: "1 to under 3 years of applied experience" },
  { value: "applied_3_to_under_8_years", label: "3 to under 8 years of applied experience" },
  { value: "applied_8_plus_years", label: "8 or more years of applied experience" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

/* ---- A05: topic-specific review familiarity ------------------------- */

// Not asked as a question any more: worked out from whether anything was
// rated. Kept for reading what is stored.
export const FAMILIARITY_RESPONSES: Choice[] = [
  { value: "rated_areas", label: "I will rate up to three areas" },
  { value: "none_to_rate", label: "None of my areas: nothing to rate" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

export const FAMILIARITY_LEVELS: Choice[] = [
  { value: "F0", label: "I do not have enough background to assess scientific or technical plausibility in this area." },
  { value: "F1", label: "I can follow general concepts, but would need help assessing technical claims." },
  { value: "F2", label: "I can assess routine work, recognize important assumptions, and identify material errors or missing evidence in this area." },
  { value: "F3", label: "I can assess specialized or ambiguous work and explain its important limitations in this area." },
];
export const MAX_RATED_AREAS = 3;

/* ---- A07: AI-assistant use ------------------------------------------ */

export const AI_USE: Choice[] = [
  { value: "never", label: "Never" },
  { value: "less_than_monthly", label: "Less than monthly" },
  { value: "monthly", label: "Monthly" },
  { value: "weekly", label: "Weekly" },
  { value: "daily_or_almost_daily", label: "Daily or almost daily" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

/* ---- The answers, and what makes them complete ---------------------- */

const values = (choices: Choice[]) => choices.map((c) => c.value) as [string, ...string[]];
const shortText = (max: number) => z.string().trim().max(max).optional().default("");
const optionalChoice = (choices: Choice[]) =>
  z.preprocess((v) => (v === "" || v == null ? undefined : v), z.enum(values(choices)).optional());

export const intakeSchema = z
  .object({
    role: z.enum(values(ROLES), { message: "Choose your current role, or prefer not to say." }),
    roleOther: shortText(120),

    backgroundDomains: z.array(z.enum(DOMAIN_IDS)).default([]),
    // "none" and "prefer_not_to_say", ticked in the same list as the areas.
    backgroundFlags: z.array(z.enum(values(BACKGROUND_ALONE))).default([]),
    otherDomainText: shortText(120),
    // A selected area, or "no_single" for no single primary area.
    primaryDomain: z.string().trim().max(60).optional().default(""),
    specializationText: shortText(200),
    focusTags: z.array(z.enum(values(FOCUS_TAGS))).default([]),
    // What the person could assess, for up to three of the areas ticked.
    familiarity: z.record(z.string(), z.enum(values(FAMILIARITY_LEVELS))).default({}),

    workResponse: z.enum(["answered", "prefer_not_to_say"]).default("answered"),
    work: z.record(z.string(), z.enum(values(EXPERIENCE_BANDS))).default({}),

    aiUse: optionalChoice(AI_USE),
  })
  .superRefine((a, ctx) => {
    const fail = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });

    const areas = a.backgroundDomains.length > 0;
    if (!areas && a.backgroundFlags.length === 0) {
      fail("backgroundDomains", "Tick the areas that apply, or one of the last two answers.");
    } else if ((areas && a.backgroundFlags.length > 0) || a.backgroundFlags.length > 1) {
      fail("backgroundDomains", BACKGROUND_CONFLICT);
    }
    if (a.backgroundDomains.includes("other") && !a.otherDomainText) {
      fail("otherDomainText", "Please say which other area.");
    }

    const rated = Object.keys(a.familiarity);
    if (rated.length > MAX_RATED_AREAS) {
      fail("familiarity", `Rate at most ${MAX_RATED_AREAS} areas: the ones you know best.`);
    } else if (
      rated.some((id) => id === "other" || !a.backgroundDomains.includes(id as (typeof DOMAIN_IDS)[number]))
    ) {
      fail("familiarity", "Rate only areas you ticked.");
    }

    if (a.workResponse === "answered") {
      const missing = WORK_AREAS.filter((w) => !a.work[w.key]);
      if (missing.length > 0) {
        fail(
          "work",
          `Choose an answer for each row (${missing.length} left), or prefer not to say for the whole question.`,
        );
      }
    }
  })
  // What is stored keeps the shape the rest of the platform reads: one
  // answer about background, one about rating, each worked out from what
  // was ticked. Answers that only mean something beside another answer are
  // dropped when that answer changes, so nothing stale is stored next to it.
  .transform(({ backgroundFlags, ...a }) => {
    const domains = a.backgroundDomains;
    const backgroundResponse =
      domains.length > 0 ? "selected_areas" : (backgroundFlags[0] ?? "prefer_not_to_say");
    const rated = Object.keys(a.familiarity).length > 0;
    return {
      ...a,
      backgroundResponse,
      otherDomainText: domains.includes("other") ? a.otherDomainText : "",
      primaryDomain:
        a.primaryDomain === "no_single" || domains.includes(a.primaryDomain as (typeof DOMAIN_IDS)[number])
          ? a.primaryDomain
          : "",
      roleOther: a.role === "other" ? a.roleOther : "",
      work:
        a.workResponse === "answered"
          ? Object.fromEntries(WORK_AREAS.filter((w) => a.work[w.key]).map((w) => [w.key, a.work[w.key]]))
          : {},
      familiarityResponse: rated
        ? "rated_areas"
        : backgroundResponse === "prefer_not_to_say"
          ? "prefer_not_to_say"
          : "none_to_rate",
    };
  });

export const BACKGROUND_CONFLICT =
  "“No specialized background” and “Prefer not to say” each stand alone. Untick the areas, or untick that answer.";

export type Intake = z.infer<typeof intakeSchema>;

/** What the form holds while it is being filled in. */
export type IntakeDraft = {
  role: string;
  roleOther: string;
  backgroundDomains: string[];
  backgroundFlags: string[];
  otherDomainText: string;
  primaryDomain: string;
  specializationText: string;
  focusTags: string[];
  familiarity: Record<string, string>;
  workResponse: string;
  work: Record<string, string>;
  aiUse: string;
};

export const EMPTY_INTAKE: IntakeDraft = {
  role: "",
  roleOther: "",
  backgroundDomains: [],
  backgroundFlags: [],
  otherDomainText: "",
  primaryDomain: "",
  specializationText: "",
  focusTags: [],
  familiarity: {},
  workResponse: "answered",
  work: {},
  aiUse: "",
};

/**
 * A stored intake as the form's starting point. Answers given on an
 * earlier version of the form are read into this one: what no longer has
 * a question is left out, and what was renamed is carried across.
 */
export function intakeDraft(stored: unknown): IntakeDraft {
  const s = (stored ?? {}) as Partial<Intake> & { focusTags?: string[] };
  const tags = (s.focusTags ?? []).map((t) => OLDER_FOCUS_TAGS[t] ?? t);
  const work = s.work ?? {};
  return {
    role: s.role ?? "",
    roleOther: s.roleOther ?? "",
    backgroundDomains: s.backgroundDomains ?? [],
    backgroundFlags:
      s.backgroundResponse === "none" || s.backgroundResponse === "prefer_not_to_say"
        ? [s.backgroundResponse]
        : [],
    otherDomainText: s.otherDomainText ?? "",
    primaryDomain: s.primaryDomain ?? "",
    specializationText: s.specializationText ?? "",
    focusTags: FOCUS_TAGS.map((t) => t.value).filter((t) => tags.includes(t)),
    familiarity: s.familiarity ?? {},
    workResponse: s.workResponse ?? "answered",
    work: Object.fromEntries(WORK_AREAS.filter((w) => work[w.key]).map((w) => [w.key, work[w.key]])),
    aiUse: s.aiUse ?? "",
  };
}

const FAMILIARITY_RANK: Record<string, number> = { F0: 0, F1: 1, F2: 2, F3: 3 };

/**
 * The highest self-reported familiarity a person has across some subjects.
 * Unrated and declined are unknown, which satisfies nothing: -1.
 */
export function bestFamiliarity(stored: unknown, domains: string[]): number {
  const familiarity = ((stored ?? {}) as { familiarity?: Record<string, string> }).familiarity ?? {};
  let best = -1;
  for (const id of domains) {
    // "Other" never grants access on its own.
    if (id === "other") continue;
    const rank = FAMILIARITY_RANK[familiarity[id] ?? ""];
    if (rank !== undefined && rank > best) best = rank;
  }
  return best;
}
