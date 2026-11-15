"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeInstructionCheck } from "@/app/review/actions";
import { Button } from "@/components/ui/button";
import { INSTRUCTION_QUESTIONS } from "@/lib/review-form";
import { cn } from "@/lib/utils";

/**
 * Five questions about the review instructions (form R). All five have to
 * be right, with as many tries as it takes; a wrong one shows why.
 *
 * It checks that the instructions were understood. It is not a test of
 * scientific knowledge and nothing here is scored.
 */
export function InstructionCheck() {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [wrong, setWrong] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const complete = INSTRUCTION_QUESTIONS.every((q) => answers[q.id]);

  return (
    <section className="space-y-5">
      <div>
        <h2 className="font-serif text-xl font-medium">Before your first review</h2>
        <p className="text-sm text-muted-foreground">
          Five questions about how to review. Take as many tries as you need.
        </p>
      </div>

      {INSTRUCTION_QUESTIONS.map((q) => (
        <fieldset
          key={q.id}
          className={cn(
            "rounded-[var(--radius)] border bg-card px-4 py-3",
            wrong.includes(q.id) ? "border-danger/50" : "border-border",
          )}
        >
          <legend className="px-1 text-sm font-medium">{q.question}</legend>
          <div className="mt-1 space-y-1.5">
            {q.choices.map((c) => (
              <label key={c.value} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name={q.id}
                  className="mt-0.5 h-4 w-4 shrink-0"
                  checked={answers[q.id] === c.value}
                  onChange={() => {
                    setAnswers((a) => ({ ...a, [q.id]: c.value }));
                    setWrong((w) => w.filter((id) => id !== q.id));
                  }}
                />
                {c.label}
              </label>
            ))}
          </div>
          {wrong.includes(q.id) && (
            <p className="mt-2 text-xs text-danger">Not that one. {q.why}</p>
          )}
        </fieldset>
      ))}

      {message && <p className="text-sm text-danger">{message}</p>}

      <Button
        size="lg"
        disabled={pending || !complete}
        onClick={() =>
          start(async () => {
            const result = await completeInstructionCheck(answers);
            if (result.ok) return router.refresh();
            setMessage(result.message);
            setWrong(result.wrong);
          })
        }
      >
        {pending ? "Checking..." : "Check my answers"}
      </Button>
    </section>
  );
}
