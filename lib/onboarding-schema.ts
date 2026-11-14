import { z } from "zod";
import {
  AI_FAMILIARITY,
  BACKGROUNDS,
  DEGREES,
  PROFILE_ROLES,
  SUBDOMAINS,
  YEARS_EXPERIENCE,
} from "@/lib/labels";

/** The free text asked for when an answer is "Other". */
const otherText = z.string().trim().max(200).optional();

// One schema, used by the server action. The form fields mirror it.
export const profileSchema = z
  .object({
  name: z.string().trim().min(1, "Please enter your name.").max(120),
  affiliation: z.string().trim().min(1, "Please enter your affiliation.").max(200),
  role: z.enum(PROFILE_ROLES, { message: "Please choose a role." }),
  highestDegree: z.enum(DEGREES, { message: "Please choose a degree." }),
  yearsExperience: z.enum(YEARS_EXPERIENCE, { message: "Please choose a range." }),
  primaryBackground: z.enum(BACKGROUNDS, { message: "Please choose a background." }),
  subdomains: z.array(z.enum(SUBDOMAINS)).default([]),
  aiFamiliarity: z.enum(AI_FAMILIARITY, { message: "Please choose one." }),
  expertiseNote: z.string().trim().max(2000).optional(),
  roleOther: otherText,
  highestDegreeOther: otherText,
  primaryBackgroundOther: otherText,
  subdomainsOther: otherText,
})
  // "Other" on its own tells nobody anything afterwards, so choosing it
  // means saying what. The check is here, not only in the form, because the
  // form is not the only way to send an answer.
  .superRefine((p, ctx) => {
    const need = (chosen: boolean, field: keyof typeof OTHER_MESSAGES) => {
      if (chosen && !p[field]) {
        ctx.addIssue({ code: "custom", path: [field], message: OTHER_MESSAGES[field] });
      }
    };
    need(p.role === "Other", "roleOther");
    need(p.highestDegree === "Other", "highestDegreeOther");
    need(p.primaryBackground === "Other", "primaryBackgroundOther");
    need(p.subdomains.includes("Other"), "subdomainsOther");
  });

const OTHER_MESSAGES = {
  roleOther: "Please say what your role is.",
  highestDegreeOther: "Please say which degree.",
  primaryBackgroundOther: "Please say what your background is.",
  subdomainsOther: "Please say which other area.",
} as const;

/**
 * Reads the profile questions out of a submitted form, for either of the two
 * places they are asked.
 */
export function profileFromForm(formData: FormData) {
  return {
    name: formData.get("name"),
    affiliation: formData.get("affiliation"),
    role: formData.get("role"),
    highestDegree: formData.get("highestDegree"),
    yearsExperience: formData.get("yearsExperience"),
    primaryBackground: formData.get("primaryBackground"),
    subdomains: formData.getAll("subdomains"),
    aiFamiliarity: formData.get("aiFamiliarity"),
    expertiseNote: formData.get("expertiseNote") ?? undefined,
    roleOther: formData.get("roleOther") ?? undefined,
    highestDegreeOther: formData.get("highestDegreeOther") ?? undefined,
    primaryBackgroundOther: formData.get("primaryBackgroundOther") ?? undefined,
    subdomainsOther: formData.get("subdomainsOther") ?? undefined,
  };
}

/**
 * The profile columns for a validated answer. The free text is kept only
 * while its question still says "Other": changing the answer to something on
 * the list must not leave the old explanation attached to it.
 */
export function profileColumns(p: ProfileInput) {
  return {
    affiliation: p.affiliation,
    role: p.role,
    highestDegree: p.highestDegree,
    yearsExperience: p.yearsExperience,
    primaryBackground: p.primaryBackground,
    subdomains: p.subdomains,
    aiFamiliarity: p.aiFamiliarity,
    expertiseNote: p.expertiseNote || null,
    roleOther: p.role === "Other" ? p.roleOther || null : null,
    highestDegreeOther: p.highestDegree === "Other" ? p.highestDegreeOther || null : null,
    primaryBackgroundOther:
      p.primaryBackground === "Other" ? p.primaryBackgroundOther || null : null,
    subdomainsOther: p.subdomains.includes("Other") ? p.subdomainsOther || null : null,
  };
}

/** An answer as it should be read back: "Other (what they said)". */
export function withOther(answer: string, other: string | null | undefined) {
  return answer === "Other" && other ? `Other (${other})` : answer;
}

export type ProfileInput = z.infer<typeof profileSchema>;
