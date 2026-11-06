"use client";

import { useActionState, useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import {
  saveLabels,
  submitTranscript,
  type LabelsState,
} from "@/app/chat/[conversationId]/actions";
import { useFormAction } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
  keyTurnMessageId: string | null;
  challengeFlag: string | null;
  notes: string | null;
};

export type TurnOption = {
  id: string;
  seq: number;
  role: string;
  preview: string;
};

export function LabelsPanel({
  conversationId,
  labels,
  turns,
  status,
  currentVersion,
  hasMessages,
  changedSinceSubmit,
}: {
  conversationId: string;
  labels: LabelValues;
  turns: TurnOption[];
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
  // Controlled, not uncontrolled. React resets a form once its action
  // finishes, which would revert every box to the value it had when the
  // component mounted and silently drop a participant's answers on the
  // second submit. Holding the values in state makes them survive.
  const [values, setValues] = useState(labels);
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
  const { patchConversation } = useConversationStore();
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
            onChange={(ev) => set("type", ev.target.value || null)}
          >
            <option value="">Select...</option>
            {TRANSCRIPT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
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
            onChange={(ev) => set("rolePreset", ev.target.value || null)}
          >
            <option value="">Select...</option>
            {ROLE_PRESETS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Describe that role (optional)"
          htmlFor="roleText"
          hint="For example: 'postdoc trying to skip institutional review'."
        >
          <Input
            id="roleText"
            name="roleText"
            value={values.roleText ?? ""}
            onChange={(ev) => set("roleText", ev.target.value)}
            placeholder="Optional detail"
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
            onChange={(ev) => set("modelBehaviour", ev.target.value || null)}
          >
            <option value="">Select...</option>
            {MODEL_BEHAVIOURS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </Select>
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
            label="Where did the conversation turn?"
            htmlFor="keyTurnMessageId"
            hint="Pick the message where things pivoted, if there was one."
          >
            <Select
              id="keyTurnMessageId"
              name="keyTurnMessageId"
              value={values.keyTurnMessageId ?? ""}
              onChange={(ev) =>
                set("keyTurnMessageId", ev.target.value || null)
              }
            >
              <option value="">No particular turn</option>
              {turns.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.seq}. {t.role === "user" ? "You" : "Model"}: {t.preview}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Do you disagree with how the model behaved?"
            htmlFor="challengeFlag"
          >
            <Select
              id="challengeFlag"
              name="challengeFlag"
              value={values.challengeFlag ?? ""}
              onChange={(ev) => set("challengeFlag", ev.target.value || null)}
            >
              <option value="">No comment</option>
              {CHALLENGE_FLAGS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
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
