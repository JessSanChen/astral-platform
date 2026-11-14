"use client";

import { useActionState, useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, MousePointerClick, X } from "lucide-react";
import {
  saveLabels,
  submitTranscript,
  type LabelsState,
} from "@/app/chat/[conversationId]/actions";
import { useFormAction } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { OtherText } from "@/components/profile-fields";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useConversationStore } from "@/components/conversation-store";
import {
  CHALLENGE_FLAGS,
  DOMAIN_TAGS,
  MODEL_BEHAVIOURS,
  ROLE_PRESETS,
  TRANSCRIPT_TYPES,
} from "@/lib/labels";

export type LabelValues = {
  type: string | null;
  rolePreset: string | null;
  roleText: string | null;
  goalText: string | null;
  modelBehaviour: string | null;
  domainTags: string[];
  domainOther: string | null;
  /** As the server had them. The live copy is in the conversation store. */
  evidenceTurns: number[];
  challengeFlag: string | null;
  notes: string | null;
};

export function LabelsPanel({
  conversationId,
  labels,
  evidenceTurns,
  selecting,
  onSelecting,
  onEvidenceChange,
  status,
  currentVersion,
  hasMessages,
  changedSinceSubmit,
}: {
  conversationId: string;
  labels: LabelValues;
  /** The turns marked as evidence, as the numbers beside the messages. */
  evidenceTurns: number[];
  /** Whether the conversation is in its "click the turns" mode. */
  selecting: boolean;
  onSelecting: (on: boolean) => void;
  onEvidenceChange: (turns: number[]) => void;
  status: "draft" | "submitted";
  currentVersion: number;
  hasMessages: boolean;
  changedSinceSubmit: boolean;
}) {
  const [state, action, pending] = useActionState<LabelsState, FormData>(
    submitTranscript,
    {},
  );
  const [saveState, saveAction, saving] = useActionState<LabelsState, FormData>(
    saveLabels,
    {},
  );
  const { patchConversation, getLabelDraft, setLabelDraft } =
    useConversationStore();
  // Controlled, not uncontrolled. React resets a form once its action
  // finishes, which would revert every box to the value it had when the
  // component mounted and silently drop a participant's answers on the
  // second submit. Holding the values in state makes them survive.
  //
  // They start from the store's copy when there is one. The `labels` prop is
  // whatever the server had when this page was first rendered, and the page
  // is cached, so it goes stale the moment anything is typed.
  const [values, setValues] = useState(
    () => getLabelDraft(conversationId) ?? labels,
  );
  useEffect(() => {
    setLabelDraft(conversationId, values);
  }, [conversationId, values, setLabelDraft]);
  const set = <K extends keyof LabelValues>(key: K, value: LabelValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const toggleTag = (tag: string, on: boolean) =>
    setValues((v) => ({
      ...v,
      domainTags: on
        ? [...v.domainTags, tag]
        : v.domainTags.filter((t) => t !== tag),
    }));

  const [openNotes, setOpenNotes] = useState(false);
  const e = state.errors ?? {};
  const runAction = useFormAction();
  const version = state.submittedVersion ?? currentVersion;
  const submitted =
    status === "submitted" || state.submittedVersion !== undefined;

  // Tell the rest of the interface that this conversation is now submitted,
  // so the sidebar shows it straight away rather than on the next load.
  useEffect(() => {
    if (state.submittedVersion === undefined) return;
    patchConversation(conversationId, {
      status: "submitted",
      currentVersion: state.submittedVersion,
    });
  }, [state.submittedVersion, conversationId, patchConversation]);

  return (
    <form onSubmit={(e) => e.preventDefault()} className="flex h-full flex-col">
      <input type="hidden" name="conversationId" value={conversationId} />

      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Label this transcript</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {submitted
            ? `Submitted as version ${version}. You can keep chatting or change these answers, then submit again.`
            : "Required before you submit. You can keep chatting afterwards."}
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <Field
          label="What kind of transcript is this?"
          htmlFor="type"
          error={e.type}
        >
          <Select
            id="type"
            name="type"
            value={values.type ?? ""}
            onChange={(v) => set("type", v || null)}
            required
            invalid={Boolean(e.type)}
            options={TRANSCRIPT_TYPES}
          />
        </Field>

        <Field
          label="What role were you playing?"
          htmlFor="rolePreset"
          error={e.rolePreset}
        >
          <Select
            id="rolePreset"
            name="rolePreset"
            value={values.rolePreset ?? ""}
            onChange={(v) => set("rolePreset", v || null)}
            required
            invalid={Boolean(e.rolePreset)}
            options={ROLE_PRESETS.map((r) => ({ value: r, label: r }))}
          />
        </Field>

        <Field
          label={
            values.rolePreset === "Other"
              ? "Describe that role"
              : "Describe that role (optional)"
          }
          htmlFor="roleText"
          hint="For example: 'postdoc trying to skip institutional review'."
          error={e.roleText}
        >
          <Input
            id="roleText"
            name="roleText"
            value={values.roleText ?? ""}
            onChange={(ev) => set("roleText", ev.target.value)}
            placeholder={values.rolePreset === "Other" ? "What was the role?" : "Optional detail"}
            aria-invalid={e.roleText ? true : undefined}
            aria-describedby={e.roleText ? "roleText-error" : undefined}
          />
        </Field>

        <Field
          label="What were you trying to get the model to do?"
          htmlFor="goalText"
          error={e.goalText}
        >
          <Textarea
            id="goalText"
            name="goalText"
            rows={3}
            value={values.goalText ?? ""}
            onChange={(ev) => set("goalText", ev.target.value)}
          />
        </Field>

        <Field
          label="How did the model respond?"
          htmlFor="modelBehaviour"
          error={e.modelBehaviour}
        >
          <Select
            id="modelBehaviour"
            name="modelBehaviour"
            value={values.modelBehaviour ?? ""}
            onChange={(v) => set("modelBehaviour", v || null)}
            required
            invalid={Boolean(e.modelBehaviour)}
            options={MODEL_BEHAVIOURS}
          />
        </Field>

        <Field label="Topics covered" error={e.domainTags}>
          <div className="space-y-1.5">
            {DOMAIN_TAGS.map((tag) => (
              <label key={tag} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="domainTags"
                  value={tag}
                  checked={values.domainTags.includes(tag)}
                  onChange={(ev) => toggleTag(tag, ev.target.checked)}
                  className="h-4 w-4"
                />
                {tag}
              </label>
            ))}
            {values.domainTags.includes("Other") && (
              <OtherText
                name="domainOther"
                question="Topics covered"
                placeholder="Which other topic?"
                value={values.domainOther ?? ""}
                error={e.domainOther}
                onChange={(v) => set("domainOther", v)}
              />
            )}
          </div>
        </Field>

        <Field
          label="Which turns show it? (optional)"
          hint={
            selecting
              ? undefined
              : "Point to the messages that best support your answers above."
          }
        >
          {evidenceTurns.map((turn) => (
            <input key={turn} type="hidden" name="evidenceTurns" value={turn} />
          ))}
          <div className="space-y-2.5 rounded-[var(--radius)] border border-border bg-card p-3">
            {evidenceTurns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No turns marked.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5" aria-label="Turns marked as evidence">
                {evidenceTurns.map((turn) => (
                  <li
                    key={turn}
                    className="flex items-center gap-1 rounded-full bg-accent/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-accent"
                  >
                    Turn {turn}
                    <button
                      type="button"
                      aria-label={`Unmark turn ${turn}`}
                      onClick={() =>
                        onEvidenceChange(evidenceTurns.filter((t) => t !== turn))
                      }
                      className="rounded-full p-0.5 hover:bg-accent/20"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selecting ? (
              <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                <MousePointerClick className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                Click the turns in the conversation. Click one again to unmark it.
              </p>
            ) : null}
            <Button
              type="button"
              variant={selecting ? "default" : "outline"}
              size="sm"
              disabled={!hasMessages}
              onClick={() => onSelecting(!selecting)}
            >
              {selecting
                ? "Done"
                : evidenceTurns.length > 0
                  ? "Change selection"
                  : "Select turns"}
            </Button>
          </div>
        </Field>

        <button
          type="button"
          onClick={() => setOpenNotes((o) => !o)}
          className="flex w-full items-center justify-between rounded-[var(--radius)] border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          <span>Optional extras</span>
          {openNotes ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        {/*
          Rendered always, hidden when collapsed. Removing these from the page
          would drop them from the form, so collapsing the section would
          silently erase answers the participant had already given.
        */}
        <div className="space-y-4" hidden={!openNotes}>
          <Field
            label="Do you disagree with how the model behaved?"
            htmlFor="challengeFlag"
          >
            <Select
              id="challengeFlag"
              name="challengeFlag"
              value={values.challengeFlag ?? ""}
              onChange={(v) => set("challengeFlag", v || null)}
              options={[{ value: "", label: "No comment" }, ...CHALLENGE_FLAGS]}
            />
          </Field>

          <Field label="Anything else worth knowing?" htmlFor="notes">
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              value={values.notes ?? ""}
              onChange={(ev) => set("notes", ev.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className="space-y-2 border-t border-border px-4 py-3">
        {state.message && (
          <p className="text-xs text-danger">{state.message}</p>
        )}
        {state.submittedVersion && !state.message && (
          <p className="flex items-center gap-1.5 text-xs text-accent">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Submitted as version {state.submittedVersion}. Thank you.
          </p>
        )}
        {saveState.savedAt && !state.message && !state.submittedVersion && (
          <p className="text-xs text-muted-foreground">Progress saved.</p>
        )}
        {!hasMessages && (
          <p className="text-xs text-muted-foreground">
            Have a conversation first, then submit it.
          </p>
        )}

        <div className="flex gap-2">
          <Button
            type="button"
            onClick={(e) => runAction(e, action)}
            disabled={pending || !hasMessages}
            className="flex-1"
          >
            {pending
              ? "Submitting..."
              : submitted
                ? changedSinceSubmit
                  ? `Submit update (v${currentVersion + 1})`
                  : "Submit again"
                : "Submit transcript"}
          </Button>
          <Button
            type="button"
            onClick={(e) => runAction(e, saveAction)}
            variant="outline"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}
