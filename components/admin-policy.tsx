"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { publishPolicy } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Writing a new version of the review instructions.
 *
 * Two clicks to publish, because it interrupts every reviewer: the first
 * says what will happen, the second does it. The text is shown as
 * reviewers will see it while it is being written.
 */
export function PolicyEditor({
  currentVersion,
  currentBody,
  reviewersReady,
  responses,
}: {
  currentVersion: number;
  currentBody: string;
  reviewersReady: number;
  responses: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState(currentBody);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const next = currentVersion + 1;
  const changed = body.trim() !== currentBody.trim();
  const usable = changed && body.trim().length >= 20;

  function publish() {
    start(async () => {
      const result = await publishPolicy(body);
      setConfirming(false);
      if (result.message) return setNote(result.message);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="policy-body" className="text-sm font-medium">
            Review instructions, version {next}
          </label>
          <Textarea
            id="policy-body"
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
            What reviewers read before reviewing, and can open beside every
            item. Plain text works. For structure: a line starting with # is a
            heading, a line starting with - is a bullet, and **bold** is bold.
          </p>
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">As reviewers will see it</p>
          <div className="markdown max-h-[28rem] min-h-40 overflow-y-auto rounded-[var(--radius)] border border-border bg-muted/30 p-4 text-sm leading-relaxed">
            <ReactMarkdown>{body}</ReactMarkdown>
          </div>
        </div>
      </div>

      {confirming ? (
        <div className="space-y-2 rounded-[var(--radius)] border border-border bg-muted/50 px-4 py-3">
          <p className="text-sm">
            Publish this as version {next}? It cannot be edited or withdrawn
            afterwards. Every reviewer will have to answer the instruction
            questions again before their next item
            {reviewersReady > 0 &&
              ` (${reviewersReady} ${reviewersReady === 1 ? "has" : "have"} passed them for version ${currentVersion})`}
            .{" "}
            {responses > 0 &&
              `The ${responses} review${responses === 1 ? "" : "s"} already made keep${responses === 1 ? "s" : ""} the version ${responses === 1 ? "it was" : "they were"} made under, and should not be pooled with reviews made under this one.`}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={publish} disabled={pending}>
              {pending ? "Publishing..." : `Yes, publish version ${next}`}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
              Not yet
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setConfirming(true)} disabled={!usable || pending}>
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
        <p role="status" className="text-sm text-danger">
          {note}
        </p>
      )}
    </div>
  );
}
