"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useConversationStore, type JudgeRun } from "@/components/conversation-store";
import { cn } from "@/lib/utils";

type JudgeConfig = { id: string; name: string; kind: string };

/** "14:32" in the viewer's own clock, to tell apart conversations that open the same way. */
function startedAt(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function JudgeTab({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const { judgeRuns, setJudgeRuns } = useConversationStore();
  const [configs, setConfigs] = useState<JudgeConfig[]>([]);
  const [chosen, setChosen] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    const res = await fetch("/api/judge");
    if (!res.ok) return;
    const { runs } = (await res.json()) as { runs: JudgeRun[] };
    setJudgeRuns(runs);
  }, [setJudgeRuns]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadRuns();
      if (cancelled) return;
      const res = await fetch("/api/judge/configs");
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { configs: JudgeConfig[] };
      if (!cancelled) setConfigs(data.configs);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadRuns]);

  const selected = chosen || configs[0]?.id || "";

  async function run() {
    if (!selected) return;
    setRunning(true);
    setError(null);
    const res = await fetch("/api/judge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId, judgeConfigId: selected }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setError(body.message ?? "The scanner could not run.");
    } else {
      await loadRuns();
    }
    setRunning(false);
  }

  // Titles repeat when two conversations open with the same line, so each
  // result also carries when its conversation started, and the one you are
  // looking at is marked.
  const duplicated = new Set(
    judgeRuns
      .map((r) => r.conversationTitle)
      .filter((t, i, all) => all.indexOf(t) !== i),
  );

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-border px-4 py-3">
        <p className="text-xs text-muted-foreground">
          Run common tools over this conversation to see what they catch and
          what they miss. Results are only visible to you.
        </p>
        <Select
          value={selected}
          onChange={(e) => setChosen(e.target.value)}
          aria-label="Scanner"
        >
          {configs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Button onClick={run} disabled={running || !selected} className="w-full">
          {running ? "Running..." : "Run on this conversation"}
        </Button>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {judgeRuns.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No scanner results yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {judgeRuns.map((r) => {
              const v = r.parsed?.verdict;
              const failed = r.status !== "ok";
              const here = r.conversationId === conversationId;
              const time = startedAt(r.conversationStartedAt);
              return (
                <li
                  key={r.id}
                  className={cn(
                    "rounded-[var(--radius)] border p-3",
                    here ? "border-accent/40 bg-accent/5" : "border-border",
                  )}
                >
                  <div className="flex items-start gap-2">
                    {failed ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : v?.flagged ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                    ) : (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-sm font-medium",
                          v?.flagged && !failed && "text-danger",
                        )}
                      >
                        {r.verdict}
                      </p>
                      <p className="text-xs text-muted-foreground">{r.judgeName}</p>
                      {v?.detail && (
                        <p className="mt-1 text-xs leading-relaxed">{v.detail}</p>
                      )}
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {here ? (
                          <span>This conversation</span>
                        ) : (
                          <button
                            onClick={() => router.push(`/chat/${r.conversationId}`)}
                            className="max-w-full cursor-pointer truncate text-left text-accent underline"
                          >
                            {r.conversationTitle}
                            {duplicated.has(r.conversationTitle) && time
                              ? ` (started ${time})`
                              : ""}
                          </button>
                        )}
                        {/* Which point of the conversation was judged, so a
                            result can be matched to the numbered turns. */}
                        {r.turnCount ? ` at turn ${r.turnCount}` : ""}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
