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
  // What was meant by "Other", for each question that offers it.
  roleOther: string;
  highestDegreeOther: string;
  primaryBackgroundOther: string;
  subdomainsOther: string;
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
  roleOther: "",
  highestDegreeOther: "",
  primaryBackgroundOther: "",
  subdomainsOther: "",
};

/** These lists are plain words, each its own label. */
const asOptions = (values: readonly string[]) =>
  values.map((v) => ({ value: v, label: v }));

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
  const other = (
    field: "roleOther" | "highestDegreeOther" | "primaryBackgroundOther" | "subdomainsOther",
    question: string,
  ) => (
    <OtherText
      name={field}
      question={question}
      value={values[field]}
      error={errors[field]}
      onChange={(v) => onChange(field, v)}
    />
  );
  const text =
    (field: "name" | "affiliation" | "expertiseNote") =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
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
            onChange={(v) => onChange("role", v)}
            required
            invalid={Boolean(errors.role)}
            options={asOptions(PROFILE_ROLES)}
          />
          {values.role === "Other" && other("roleOther", "Role")}
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
            onChange={(v) => onChange("highestDegree", v)}
            required
            invalid={Boolean(errors.highestDegree)}
            options={asOptions(DEGREES)}
          />
          {values.highestDegree === "Other" && other("highestDegreeOther", "Highest degree")}
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
            onChange={(v) => onChange("yearsExperience", v)}
            required
            invalid={Boolean(errors.yearsExperience)}
            options={asOptions(YEARS_EXPERIENCE)}
          />
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
            onChange={(v) => onChange("primaryBackground", v)}
            required
            invalid={Boolean(errors.primaryBackground)}
            options={asOptions(BACKGROUNDS)}
          />
          {values.primaryBackground === "Other" &&
            other("primaryBackgroundOther", "Primary background")}
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
        {chosen.has("Other") && other("subdomainsOther", "Life-science subdomains")}
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
          onChange={(v) => onChange("aiFamiliarity", v)}
          required
          invalid={Boolean(errors.aiFamiliarity)}
          options={asOptions(AI_FAMILIARITY)}
        />
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

/**
 * The box that appears when an answer is "Other".
 *
 * Shown only then, so the form is no longer for the people the list already
 * covers, and required once shown: "Other" with nothing beside it is the one
 * answer that cannot be used afterwards.
 */
export function OtherText({
  name,
  question,
  value,
  error,
  onChange,
  placeholder = "Please say what",
}: {
  name: string;
  /** The question this belongs to, for a screen reader. */
  question: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Input
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={200}
        aria-label={`${question}: other, please say what`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : undefined}
      />
      {error && (
        <p id={`${name}-error`} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
