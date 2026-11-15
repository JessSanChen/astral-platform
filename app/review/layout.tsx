import { AppShell } from "@/components/app-shell";
import { ReviewSidebar, type ReviewWorkItem } from "@/components/review-sidebar";
import { reviewerWork } from "@/lib/assignments";
import { requireOnboarded } from "@/lib/gate";

/**
 * The review pages, with the reviewer's own work listed beside them: what
 * is in progress and what they have finished, each of which can be opened.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const { user } = await requireOnboarded();
  const work = await reviewerWork(user.id);

  // Finished items are numbered in the order they were finished, per kind,
  // and listed newest first.
  const counts: Record<string, number> = {};
  const numbered = new Map<string, number>();
  for (const item of [...work.completed].reverse()) {
    counts[item.purpose] = (counts[item.purpose] ?? 0) + 1;
    numbered.set(item.id, counts[item.purpose]);
  }
  const shape = (item: (typeof work.completed)[number]): ReviewWorkItem => ({
    id: item.id,
    purpose: item.purpose,
    at: (item.finishedAt ?? item.reservedAt).toISOString(),
    verdict: item.verdict,
    mainDifference: item.mainDifference,
    revisions: item.revisions,
    number: numbered.get(item.id) ?? 0,
  });

  return (
    <AppShell>
      <div className="flex h-full">
        <ReviewSidebar
          inProgress={work.inProgress.map(shape)}
          completed={work.completed.map(shape)}
        />
        <div className="relative min-w-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </AppShell>
  );
}
