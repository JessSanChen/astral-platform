"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { publishTerms } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Writing and publishing the next version of the terms.
 *
 * The box starts from the text in force, because a new version is almost
 * always an edit of the last one. What participants will see is shown
 * beside it as it is typed.
 *
 * Publishing takes two clicks. It cannot be undone, and it sends every
 * participant back to the terms on their next page, which mid-event is an
 * interruption for the whole room: worth one deliberate confirmation.
 */
export function TermsEditor({
  currentVersion,
  currentBody,
  accounts,
}: {
  currentVersion: number;
  currentBody: string;
  accounts: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState(currentBody);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);

  const next = currentVersion + 1;
  const changed = body.trim() !== currentBody.trim();
  const usable = changed && body.trim().length >= 20;

  function publish() {
    start(async () => {
      const result = await publishTerms(body);
      setConfirming(false);
      if (result.message) {
        setNote({ text: result.message, bad: true });
        return;
      }
      setNote({ text: `Published as version ${result.version}.`, bad: false });
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="terms-body" className="text-sm font-medium">
            Text of version {next}
          </label>
          <Textarea
            id="terms-body"
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setConfirming(false);
              setNote(null);
            }}
            rows={18}
            className="font-mono text-xs leading-relaxed"
          />
          <p className="text-xs text-muted-foreground">
            Plain text works. For structure: a line starting with # is a
            heading, a line starting with - is a bullet, and **bold** is bold.
          </p>
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">As participants will see it</p>
          <div className="markdown max-h-[26rem] min-h-40 overflow-y-auto rounded-[var(--radius)] border border-border bg-muted/30 p-4 text-sm leading-relaxed">
            {body.trim() ? (
              <ReactMarkdown>{body}</ReactMarkdown>
            ) : (
              <p className="text-muted-foreground">Nothing written yet.</p>
            )}
          </div>
        </div>
      </div>

      {confirming ? (
        <div className="space-y-2 rounded-[var(--radius)] border border-border bg-muted/50 px-4 py-3">
          <p className="text-sm">
            Publish this as version {next}? It cannot be edited or withdrawn
            afterwards.{" "}
            {accounts > 0
              ? `All ${accounts} account${accounts === 1 ? "" : "s"} will be asked to accept it on their next page, before they can carry on.`
              : "Nobody has signed up yet, so nobody is interrupted."}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={publish} disabled={pending}>
              {pending ? "Publishing..." : `Yes, publish version ${next}`}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Not yet
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Button onClick={() => setConfirming(true)} disabled={!usable}>
            Publish as version {next}
          </Button>
          {!changed && (
            <span className="text-xs text-muted-foreground">
              Change the text to publish a new version.
            </span>
          )}
        </div>
      )}

      {note && (
        <p className={note.bad ? "text-sm text-danger" : "text-sm text-muted-foreground"}>
          {note.text}
        </p>
      )}
    </div>
  );
}
