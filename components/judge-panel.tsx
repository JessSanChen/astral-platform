"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type JudgeConfig = { id: string; name: string; kind: string };

type Verdict = {
  headline: string;
  detail?: string;
  severity?: number;
  categories?: string[];
  flagged: boolean;
};

type Run = {
  id: string;
  conversationId: string;
  conversationTitle: string;
  judgeName: string;
  verdict: string | null;
  parsed: { verdict?: Verdict } | null;
  status: string;
  createdAt: string;
};

/**
 * Lives in the chat layout rather than in a conversation, so the list of
 * results stays put as participants move between conversations through the
 * day. Results are each participant's own; nobody sees anyone else's.
 */
export function JudgePanel() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [configs, setConfigs] = useState<JudgeConfig[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [chosen, setChosen] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const match = pathname.match(/^\/chat\/([0-9a-f-]{36})$/);
  const conversationId = match?.[1] ?? null;

  const loadRuns = useCallback(async () => {
    const res = await fetch("/api/judge");
    if (!res.ok) return;
    const { runs } = (await res.json()) as { runs: Run[] };
    setRuns(runs);
  }, []);

  useEffect(() => {
    if (!open) return;
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
  }, [open, loadRuns]);

  // Default to the first scanner without holding a second copy of the state.
  const selected = chosen || configs[0]?.id || "";

  async function run() {
    if (!conversationId || !selected) return;
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

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-[var(--radius)] border border-border bg-card px-3 py-2 text-sm hover:bg-muted"
      >
        <ShieldCheck className="h-4 w-4" />
        Scanners
        {runs.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">{runs.length}</span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-[26rem] flex-col border-l border-border bg-card shadow-xl">
      <div className="flex items-start justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4" />
            Safety scanners
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Run common tools over a conversation to see what they catch and
            what they miss. Results are only visible to you.
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close scanners">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2 border-b border-border px-4 py-3">
        {conversationId ? (
          <>
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
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Open a conversation to run a scanner over it.
          </p>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {runs.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No scanner results yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {runs.map((r) => {
              const v = r.parsed?.verdict;
              const failed = r.status !== "ok";
              return (
                <li
                  key={r.id}
                  className="rounded-[var(--radius)] border border-border p-3"
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
                      <button
                        onClick={() => {
                          router.push(`/chat/${r.conversationId}`);
                          setOpen(false);
                        }}
                        className="mt-1.5 block max-w-full truncate text-xs text-accent underline"
                      >
                        {r.conversationTitle}
                      </button>
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
