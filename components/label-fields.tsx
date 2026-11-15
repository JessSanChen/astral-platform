"use client";

import { Radios } from "@/components/intake-fields";
import { Input } from "@/components/ui/input";
import {
  AUTHOR_ROLES,
  TASK_KINDS,
  TASK_OTHER_LIMIT,
  type FolderLabels,
} from "@/lib/author-labels";
import { cn } from "@/lib/utils";

/**
 * The two questions asked of a folder as a whole: the role and the kind of
 * task. Used where a folder is made and on the folder's own page.
 */
export function RoleAndTask({
  labels,
  errors = {},
  roleText,
  taskText,
  onChange,
  onOtherBlur,
}: {
  labels: FolderLabels;
  errors?: Partial<Record<keyof FolderLabels, string>>;
  roleText: string;
  taskText: string;
  onChange: (patch: Partial<FolderLabels>) => void;
  /** Free text is saved when it is left, not on every key. */
  onOtherBlur?: () => void;
}) {
  return (
    <div className="space-y-5">
      <Asked id="role" text={roleText} error={errors.role}>
        <Radios
          name="folder-role"
          legend={roleText}
          value={labels.role}
          options={AUTHOR_ROLES}
          onChange={(role) => onChange({ role })}
        />
      </Asked>
      <Asked
        id="taskKinds"
        text={taskText}
        hint="Tick all that apply."
        error={errors.taskKinds ?? errors.taskOther}
      >
        <fieldset>
          <legend className="sr-only">{taskText}</legend>
          <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {TASK_KINDS.map((kind) => (
              <label key={kind.value} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0"
                  checked={labels.taskKinds.includes(kind.value)}
                  onChange={(e) =>
                    onChange({
                      taskKinds: e.target.checked
                        ? [...labels.taskKinds, kind.value]
                        : labels.taskKinds.filter((k) => k !== kind.value),
                    })
                  }
                />
                {kind.label}
              </label>
            ))}
          </div>
        </fieldset>
        {labels.taskKinds.includes("other") && (
          <Input
            aria-label="Other kind of task: say what"
            placeholder="Say what"
            maxLength={TASK_OTHER_LIMIT}
            value={labels.taskOther}
            onChange={(e) => onChange({ taskOther: e.target.value })}
            onBlur={onOtherBlur}
          />
        )}
      </Asked>
    </div>
  );
}

/** A question, with a complaint beneath it when it is still unanswered. */
export function Asked({
  id,
  text,
  hint,
  error,
  children,
}: {
  id: string;
  text: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-label-question={id} className="space-y-2">
      <div>
        <p className={cn("text-sm font-medium leading-snug", error && "text-danger")}>{text}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
