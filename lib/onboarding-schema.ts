import { z } from "zod";
import {
  AI_FAMILIARITY,
  BACKGROUNDS,
  DEGREES,
  PROFILE_ROLES,
  SUBDOMAINS,
  YEARS_EXPERIENCE,
} from "@/lib/labels";

// One schema, used by the server action. The form fields mirror it.
export const profileSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name.").max(120),
  affiliation: z.string().trim().min(1, "Please enter your affiliation.").max(200),
  role: z.enum(PROFILE_ROLES, { message: "Please choose a role." }),
  highestDegree: z.enum(DEGREES, { message: "Please choose a degree." }),
  yearsExperience: z.enum(YEARS_EXPERIENCE, { message: "Please choose a range." }),
  primaryBackground: z.enum(BACKGROUNDS, { message: "Please choose a background." }),
  subdomains: z.array(z.enum(SUBDOMAINS)).default([]),
  aiFamiliarity: z.enum(AI_FAMILIARITY, { message: "Please choose one." }),
  expertiseNote: z.string().trim().max(2000).optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;
