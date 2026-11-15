"use client";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  AI_USE,
  BACKGROUND_RESPONSES,
  DOMAIN_GROUPS,
  EXPERIENCE_BANDS,
  FAMILIARITY_LEVELS,
  FAMILIARITY_RESPONSES,
  FOCUS_TAGS,
  MAX_RATED_AREAS,
  ROLES,
  SAFETY_LEVELS,
  SAFETY_ROWS,
  WORK_AREAS,
  domainLabel,
  type IntakeDraft,
} from "@/lib/intake";

/**
 * The questions asked on joining (specification section 2.A), shared by
 * onboarding and the profile page so the two cannot drift apart.
 *
 * Everything is held by the parent and sent as one value, because several
 * answers are tables or lists that a plain form cannot carry. Nothing is
 * pre-selected: an untouched question is unanswered, not "none".
 */
export function IntakeFields({
  values,
  errors = {},
  onChange,
}: {
  values: IntakeDraft;
  errors?: Record<string, string>;
  onChange: (patch: Partial<IntakeDraft>) => void;
}) {
  const hasAreas = values.backgroundResponse === "selected_areas";
  const toggle = (list: string[], value: string, on: boolean) =>
    on ? [...list, value] : list.filter((v) => v !== value);
  // Areas that can be rated for reviewing: the ones ticked, less "Other".
  const rateable = values.backgroundDomains.filter((id) => id !== "other");
  const ratedCount = Object.keys(values.familiarity).length;

  return (
    <div className="space-y-10">
      <input type="hidden" name="intake" value={JSON.stringify(values)} />

      {/* A02 */}
      <Section
        title="Subject background"
        question="Which areas have you studied or worked in? Select all that apply, including substantive coursework, research, or professional work."
      >
        <Radios
          name="backgroundResponse"
          legend="Subject background"
          value={values.backgroundResponse}
          options={BACKGROUND_RESPONSES}
          error={errors.backgroundResponse}
          onChange={(v) => onChange({ backgroundResponse: v })}
        />

        {hasAreas && (
          <div className="space-y-4 rounded-[var(--radius)] border border-border bg-card p-4">
            {DOMAIN_GROUPS.map((group) => (
              <fieldset key={group.group}>
                <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {group.group}
                </legend>
                <div className="mt-1.5 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                  {group.domains.map((d) => (
                    <label key={d.id} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0"
                        checked={values.backgroundDomains.includes(d.id)}
                        onChange={(e) => {
                          const next = toggle(values.backgroundDomains, d.id, e.target.checked);
                          const familiarity = { ...values.familiarity };
                          if (!e.target.checked) delete familiarity[d.id];
                          onChange({
                            backgroundDomains: next,
                            familiarity,
                            primaryDomain: next.includes(values.primaryDomain)
                              ? values.primaryDomain
                              : values.primaryDomain === "no_single"
                                ? "no_single"
                                : "",
                          });
                        }}
                      />
                      {d.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            {errors.backgroundDomains && <Complaint>{errors.backgroundDomains}</Complaint>}

            {values.backgroundDomains.includes("other") && (
              <Field label="Which other area?" htmlFor="otherDomainText" error={errors.otherDomainText}>
                <Input
                  id="otherDomainText"
                  maxLength={120}
                  value={values.otherDomainText}
                  onChange={(e) => onChange({ otherDomainText: e.target.value })}
                />
              </Field>
            )}

            {values.backgroundDomains.length > 0 && (
              <Field label="Your primary area (optional)" htmlFor="primaryDomain">
                <Select
                  id="primaryDomain"
                  value={values.primaryDomain}
                  onChange={(v) => onChange({ primaryDomain: v })}
                  placeholder="Select..."
                  options={[
                    { value: "", label: "Not answered" },
                    ...values.backgroundDomains.map((id) => ({
                      value: id,
                      label: id === "other" ? "Other" : domainLabel(id),
                    })),
                    { value: "no_single", label: "No single primary area" },
                  ]}
                />
              </Field>
            )}

            <Field
              label="Optional: your narrower specialization"
              htmlFor="specializationText"
            >
              <Input
                id="specializationText"
                maxLength={200}
                value={values.specializationText}
                onChange={(e) => onChange({ specializationText: e.target.value })}
              />
            </Field>
          </div>
        )}

        <fieldset>
          <legend className="text-sm font-medium">
            Do any of these also describe your work? (optional)
          </legend>
          <div className="mt-1.5 space-y-1.5">
            {FOCUS_TAGS.map((tag) => (
              <label key={tag.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={values.focusTags.includes(tag.value)}
                  onChange={(e) =>
                    onChange({ focusTags: toggle(values.focusTags, tag.value, e.target.checked) })
                  }
                />
                {tag.label}
              </label>
            ))}
          </div>
        </fieldset>
      </Section>

      {/* A03 */}
      <Section title="Current role">
        <Field
          label="Which best describes your current main role? (optional)"
          htmlFor="role"
        >
          <Select
            id="role"
            value={values.role}
            onChange={(v) => onChange({ role: v })}
            placeholder="Select..."
            options={[{ value: "", label: "Not answered" }, ...ROLES]}
          />
        </Field>
        {values.role === "other" && (
          <Field label="Your role (optional)" htmlFor="roleOther">
            <Input
              id="roleOther"
              maxLength={120}
              value={values.roleOther}
              onChange={(e) => onChange({ roleOther: e.target.value })}
            />
          </Field>
        )}
      </Section>

      {/* A04 */}
      <Section
        title="Work you have personally done"
        question="What kinds of work have you personally done, and approximately how much experience do you have in each?"
        note="Overlapping work can count in more than one row. An applied student project counts as applied work."
      >
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={values.workResponse === "prefer_not_to_say"}
            onChange={(e) =>
              onChange({ workResponse: e.target.checked ? "prefer_not_to_say" : "answered" })
            }
          />
          Prefer not to say, for this whole question
        </label>

        {values.workResponse === "answered" && (
          <div className="divide-y divide-border rounded-[var(--radius)] border border-border bg-card">
            {WORK_AREAS.map((area) => (
              <div
                key={area.key}
                className="grid items-center gap-x-4 gap-y-1.5 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_17rem]"
              >
                <div>
                  <p id={`work-${area.key}-label`} className="text-sm font-medium">
                    {area.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{area.help}</p>
                </div>
                <Select
                  id={`work-${area.key}`}
                  aria-label={area.label}
                  value={values.work[area.key] ?? ""}
                  onChange={(v) => {
                    const work = { ...values.work };
                    if (v) work[area.key] = v;
                    else delete work[area.key];
                    onChange({ work });
                  }}
                  placeholder="Select..."
                  options={[{ value: "", label: "Not answered" }, ...EXPERIENCE_BANDS]}
                />
                {area.key === "other" && values.work.other && (
                  <Input
                    aria-label="Other relevant applied work: what"
                    className="sm:col-span-2"
                    maxLength={120}
                    placeholder="What kind of work? (optional)"
                    value={values.workOtherText}
                    onChange={(e) => onChange({ workOtherText: e.target.value })}
                  />
                )}
              </div>
            ))}
          </div>
        )}
        {errors.work && <Complaint>{errors.work}</Complaint>}
      </Section>

      {/* A05 */}
      <Section
        title="What you could review"
        question="In which of your selected areas could you assess the scientific or technical plausibility of a conversation? Choose up to three areas you know best, and indicate what you could assess."
        note="This decides which conversations you can be asked to review. It is your own estimate, not a credential, and you can always skip one that turns out to be beyond you."
      >
        <Radios
          name="familiarityResponse"
          legend="What you could review"
          value={values.familiarityResponse}
          options={FAMILIARITY_RESPONSES}
          error={errors.familiarityResponse}
          onChange={(v) => onChange({ familiarityResponse: v })}
        />

        {values.familiarityResponse === "rated_areas" && (
          <div className="space-y-3 rounded-[var(--radius)] border border-border bg-card p-4">
            {rateable.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Tick the areas you have studied or worked in under Subject
                background first; they will appear here to rate.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {ratedCount} of up to {MAX_RATED_AREAS} rated. Leave the rest
                  as they are.
                </p>
                {rateable.map((id) => (
                  <div key={id} className="space-y-1">
                    <p className="text-sm font-medium">{domainLabel(id)}</p>
                    <Select
                      id={`familiarity-${id}`}
                      aria-label={`${domainLabel(id)}: what you could assess`}
                      value={values.familiarity[id] ?? ""}
                      onChange={(v) => {
                        const familiarity = { ...values.familiarity };
                        if (v) familiarity[id] = v;
                        else delete familiarity[id];
                        onChange({ familiarity });
                      }}
                      placeholder="Not rated"
                      options={[{ value: "", label: "Not rated" }, ...FAMILIARITY_LEVELS]}
                    />
                  </div>
                ))}
              </>
            )}
          </div>
        )}
        {errors.familiarity && <Complaint>{errors.familiarity}</Complaint>}
      </Section>

      {/* A06 */}
      <Section
        title="Biosafety and biosecurity"
        question="What experience do you have in each of the following?"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          {SAFETY_ROWS.map((row) => (
            <Field key={row.key} label={row.label} htmlFor={row.key} error={errors[row.key]}>
              <Select
                id={row.key}
                value={values[row.key]}
                onChange={(v) => onChange({ [row.key]: v })}
                required
                invalid={Boolean(errors[row.key])}
                placeholder="Select..."
                options={SAFETY_LEVELS}
              />
            </Field>
          ))}
        </div>
      </Section>

      {/* A07 */}
      <Section title="AI assistants">
        <Field
          label="How often do you currently use AI assistants? (optional)"
          htmlFor="aiUse"
        >
          <Select
            id="aiUse"
            value={values.aiUse}
            onChange={(v) => onChange({ aiUse: v })}
            placeholder="Select..."
            options={[{ value: "", label: "Not answered" }, ...AI_USE]}
          />
        </Field>
      </Section>
    </div>
  );
}

function Section({
  title,
  question,
  note,
  children,
}: {
  title: string;
  question?: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h3 className="font-serif text-lg font-medium">{title}</h3>
        {question && <p className="text-sm leading-relaxed">{question}</p>}
        {note && <p className="text-xs leading-relaxed text-muted-foreground">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Complaint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-danger">{children}</p>;
}

/** A small group of exclusive choices, none of them chosen to begin with. */
export function Radios({
  name,
  legend,
  value,
  options,
  error,
  onChange,
}: {
  name: string;
  legend: string;
  value: string;
  options: { value: string; label: string }[];
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset aria-invalid={error ? true : undefined}>
      <legend className="sr-only">{legend}</legend>
      <div className="space-y-1.5">
        {options.map((option) => (
          <label key={option.value} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name={name}
              // Without this a ticked radio posts "on", whatever it stands for.
              value={option.value}
              className="mt-0.5 h-4 w-4 shrink-0"
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </fieldset>
  );
}
