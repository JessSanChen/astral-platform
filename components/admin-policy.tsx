"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { checkPolicyDraft, publishPolicy } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Rule = { id: string; label: string; verdicts: string[] };

/**
 * Writing and publishing the next version of the reference policy: its
 * text, and the rules a reviewer can name as the basis for an answer.
 *
 * Publishing takes two clicks, like the terms. It cannot be undone, and it
 * sends every reviewer back through the instruction check before their
 * next item, which mid-event interrupts the whole room.
 */
export function PolicyEditor({
  currentVersion,
  currentBody,
  currentRules,
  placeholderBody,
  builtIn,
  reviewersReady,
  responses,
}: {
  currentVersion: number;
  currentBody: string;
  currentRules: string;
  /** What participants are shown while nothing is published. */
  placeholderBody: string;
  /** The bases the review form always offers, beside the policy's rules. */
  builtIn: string[];
  reviewersReady: number;
  responses: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState(currentBody);
  const [rules, setRules] = useState(currentRules);
  // The rules as the server read them, shown back before publishing. Set
  // by the first click; the second click publishes.
  const [confirming, setConfirming] = useState<Rule[] | null>(null);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);

  const next = currentVersion + 1;
  const changed = body.trim() !== currentBody.trim() || rules.trim() !== currentRules.trim();
  const usable = changed && body.trim().length >= 20 && rules.trim().length > 0;

  function edited() {
    setConfirming(null);
    setNote(null);
  }

  /** First click: have the server read it back, and say what is wrong. */
  function check() {
    start(async () => {
      const result = await checkPolicyDraft(body, rules);
      if (result.message || !result.rules) {
        setNote({ text: result.message ?? "That could not be read.", bad: true });
        return;
      }
      setNote(null);
      setConfirming(result.rules);
    });
  }

  function publish() {
    start(async () => {
      const result = await publishPolicy(body, rules);
      setConfirming(null);
      if (result.message) {
        setNote({ text: result.message, bad: true });
        return;
      }
      setNote({ text: `Published as version ${result.version}.`, bad: false });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="policy-body" className="text-sm font-medium">
            Policy text, version {next}
          </label>
          <Textarea
            id="policy-body"
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              edited();
            }}
            rows={16}
            className="font-mono text-xs leading-relaxed"
          />
          <p className="text-xs text-muted-foreground">
            What reviewers read before reviewing, and can open beside every
            item. Plain text works. For structure: a line starting with # is a
            heading, a line starting with - is a bullet, and **bold** is bold.
          </p>
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">As reviewers will see it</p>
          <div className="markdown max-h-[24rem] min-h-40 overflow-y-auto rounded-[var(--radius)] border border-border bg-muted/30 p-4 text-sm leading-relaxed">
            <ReactMarkdown>{body.trim() ? body : placeholderBody}</ReactMarkdown>
          </div>
          {!body.trim() && (
            <p className="text-xs text-muted-foreground">
              This placeholder is what participants see until a policy is
              published.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="policy-rules" className="text-sm font-medium">
          Rules reviewers can cite
        </label>
        <Textarea
          id="policy-rules"
          value={rules}
          onChange={(e) => {
            setRules(e.target.value);
            edited();
          }}
          rows={6}
          placeholder={"R1 | Requests step-by-step methods for a listed capability | yes\nR2 | General education about a sensitive subject | no"}
          className="font-mono text-xs leading-relaxed"
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          One rule per line, as <code className="rounded bg-muted px-1">ID | label | answers</code>.
          The ID is short (letters, digits, dots, dashes); the label is what
          reviewers read; answers says which answers the rule can support, as
          a comma-separated list of <code className="rounded bg-muted px-1">yes</code>,{" "}
          <code className="rounded bg-muted px-1">no</code> and{" "}
          <code className="rounded bg-muted px-1">indeterminate</code>. Leave answers off and the
          rule supports Yes. {builtIn.map((b) => `“${b}”`).join(" and ")}{" "}
          are always offered automatically, so do not add them.
        </p>
      </div>

      {confirming ? (
        <div className="space-y-2 rounded-[var(--radius)] border border-border bg-muted/50 px-4 py-3">
          <div className="text-sm">
            <p className="font-medium">The rules, as reviewers will be offered them:</p>
            <ul className="mt-1 space-y-0.5 text-xs" aria-label="Rules as read">
              {confirming.map((r) => (
                <li key={r.id}>
                  <span className="font-medium">{r.id}</span>: {r.label}{" "}
                  <span className="text-muted-foreground">(supports {r.verdicts.join(", ")})</span>
                </li>
              ))}
              {builtIn.map((b) => (
                <li key={b} className="text-muted-foreground">
                  {b} (always offered)
                </li>
              ))}
            </ul>
          </div>
          <p className="text-sm">
            Publish this as version {next}? It cannot be edited or withdrawn
            afterwards.{" "}
            {currentVersion === 0
              ? "This opens reviewing: participants can take the instruction check and be given items."
              : `Every reviewer will have to redo the four-question instruction check before their next item${reviewersReady > 0 ? ` (${reviewersReady} have passed it for version ${currentVersion})` : ""}. Someone part-way through an item can finish it; it is recorded under version ${next}.`}{" "}
            {responses > 0 &&
              `The ${responses} review${responses === 1 ? "" : "s"} already made keep${responses === 1 ? "s" : ""} the version ${responses === 1 ? "it was" : "they were"} made under.`}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={publish} disabled={pending}>
              {pending ? "Publishing..." : `Yes, publish version ${next}`}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(null)}
              disabled={pending}
            >
              Not yet
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={check} disabled={!usable || pending}>
            {pending ? "Checking..." : `Publish as version ${next}`}
          </Button>
          {!changed && (
            <span className="text-xs text-muted-foreground">
              Change the text or the rules to publish a new version.
            </span>
          )}
          {currentVersion > 0 && (
            <span className="text-xs text-muted-foreground">
              Publishing makes every reviewer redo the instruction check.
              Reviews record the version they were made under.
            </span>
          )}
        </div>
      )}

      {note && (
        <p role="status" className={note.bad ? "text-sm text-danger" : "text-sm text-muted-foreground"}>
          {note.text}
        </p>
      )}
    </div>
  );
}
