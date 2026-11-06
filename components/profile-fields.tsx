"use client";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AI_FAMILIARITY,
  BACKGROUNDS,
  DEGREES,
  PROFILE_ROLES,
  SUBDOMAINS,
  YEARS_EXPERIENCE,
} from "@/lib/labels";

/** What the fields are filled with. Everything is blank at onboarding. */
export type ProfileFieldValues = {
  name: string;
  affiliation: string;
  role: string;
  highestDegree: string;
  yearsExperience: string;
  primaryBackground: string;
  subdomains: string[];
  aiFamiliarity: string;
  expertiseNote: string;
};

export const EMPTY_PROFILE: ProfileFieldValues = {
  name: "",
  affiliation: "",
  role: "",
  highestDegree: "",
  yearsExperience: "",
  primaryBackground: "",
  subdomains: [],
  aiFamiliarity: "",
  expertiseNote: "",
};

function Options({ values }: { values: readonly string[] }) {
  return (
    <>
      <option value="">Select...</option>
      {values.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </>
  );
}

/**
 * The profile questions, shared by onboarding and the profile page.
 *
 * One copy rather than two, so a question added or reworded before the event
 * cannot end up asked one way on the way in and another way afterwards. The
 * fields match lib/onboarding-schema.ts, which validates both.
 *
 * Every field is controlled by the parent. React clears an uncontrolled form
 * once its action returns, so a single rejected answer used to wipe all the
 * others and the person had to type the lot again.
 */
export function ProfileFields({
  values,
  errors = {},
  onChange,
}: {
  values: ProfileFieldValues;
  errors?: Record<string, string>;
  onChange: <K extends keyof ProfileFieldValues>(
    field: K,
    value: ProfileFieldValues[K],
  ) => void;
}) {
  const chosen = new Set(values.subdomains);
  const text =
    (field: "name" | "affiliation" | "expertiseNote") =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(field, e.target.value);
  const choice =
    (
      field:
        | "role"
        | "highestDegree"
        | "yearsExperience"
        | "primaryBackground"
        | "aiFamiliarity",
    ) =>
    (e: React.ChangeEvent<HTMLSelectElement>) =>
      onChange(field, e.target.value);

  return (
    <>
      <Field label="Full name" htmlFor="name" error={errors.name}>
        <Input
          id="name"
          name="name"
          value={values.name}
          onChange={text("name")}
          required
        />
      </Field>

      <Field
        label="Affiliation"
        htmlFor="affiliation"
        hint="University, company, or independent."
        error={errors.affiliation}
      >
        <Input
          id="affiliation"
          name="affiliation"
          value={values.affiliation}
          onChange={text("affiliation")}
          required
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Role" htmlFor="role" error={errors.role}>
          <Select
            id="role"
            name="role"
            value={values.role}
            onChange={choice("role")}
            required
          >
            <Options values={PROFILE_ROLES} />
          </Select>
        </Field>
        <Field
          label="Highest degree"
          htmlFor="highestDegree"
          error={errors.highestDegree}
        >
          <Select
            id="highestDegree"
            name="highestDegree"
            value={values.highestDegree}
            onChange={choice("highestDegree")}
            required
          >
            <Options values={DEGREES} />
          </Select>
        </Field>
        <Field
          label="Years of experience"
          htmlFor="yearsExperience"
          error={errors.yearsExperience}
        >
          <Select
            id="yearsExperience"
            name="yearsExperience"
            value={values.yearsExperience}
            onChange={choice("yearsExperience")}
            required
          >
            <Options values={YEARS_EXPERIENCE} />
          </Select>
        </Field>
        <Field
          label="Primary background"
          htmlFor="primaryBackground"
          error={errors.primaryBackground}
        >
          <Select
            id="primaryBackground"
            name="primaryBackground"
            value={values.primaryBackground}
            onChange={choice("primaryBackground")}
            required
          >
            <Options values={BACKGROUNDS} />
          </Select>
        </Field>
      </div>

      <Field
        label="Life-science subdomains"
        hint="Pick any that apply. Leave blank if none."
        error={errors.subdomains}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SUBDOMAINS.map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="subdomains"
                value={s}
                checked={chosen.has(s)}
                onChange={(e) =>
                  onChange(
                    "subdomains",
                    e.target.checked
                      ? [...values.subdomains, s]
                      : values.subdomains.filter((v) => v !== s),
                  )
                }
                className="h-4 w-4"
              />
              {s}
            </label>
          ))}
        </div>
      </Field>

      <Field
        label="How familiar are you with AI chatbots?"
        htmlFor="aiFamiliarity"
        error={errors.aiFamiliarity}
      >
        <Select
          id="aiFamiliarity"
          name="aiFamiliarity"
          value={values.aiFamiliarity}
          onChange={choice("aiFamiliarity")}
          required
        >
          <Options values={AI_FAMILIARITY} />
        </Select>
      </Field>

      <Field
        label="Anything specific about your expertise?"
        htmlFor="expertiseNote"
        hint="Optional. For example: 'I work on bacteriophage therapy' or 'ML engineer, no wet-lab experience'."
        error={errors.expertiseNote}
      >
        <Textarea
          id="expertiseNote"
          name="expertiseNote"
          rows={3}
          value={values.expertiseNote}
          onChange={text("expertiseNote")}
        />
      </Field>
    </>
  );
}
