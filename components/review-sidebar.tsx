"use client";

import { useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/sign-out-button";
import { refreshBatch } from "@/app/review/actions";
import { cn } from "@/lib/utils";

export type ReviewItem = {
  conversationId: string;
  title: string;
  modelId: string;
  updatedAt?: string;
  submissionCount?: number;
};

export function ReviewSidebar({
  toReview,
  completed,
  userName,
  isAdmin,
}: {
  toReview: ReviewItem[];
  completed: ReviewItem[];
  userName: string;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-border bg-muted/30">
      <div className="flex min-h-0 flex-1 flex-col">
        <Section
          title="To review"
          count={toReview.length}
          action={
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await refreshBatch();
                  router.refresh();
                  router.push("/review");
                })
              }
              title="Swap these for a different set"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", pending && "animate-spin")} />
            </Button>
          }
        >
          {toReview.length === 0 ? (
            <Empty>
              Nothing waiting. Press refresh to look for more, or come back once
              other people have submitted.
            </Empty>
          ) : (
            toReview.map((item) => (
              <Item
                key={item.conversationId}
                item={item}
                active={pathname === `/review/${item.conversationId}`}
              />
            ))
          )}
        </Section>

        <Section title="Reviewed" count={completed.length}>
          {completed.length === 0 ? (
            <Empty>Your finished reviews will collect here.</Empty>
          ) : (
            completed.map((item) => (
              <Item
                key={item.conversationId}
                item={item}
                active={pathname === `/review/${item.conversationId}`}
                done
              />
            ))
          )}
        </Section>
      </div>

      <div className="space-y-2 border-t border-border p-3">
        <p className="text-xs text-muted-foreground">
          {completed.length} review{completed.length === 1 ? "" : "s"} submitted
        </p>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-muted-foreground">
            {userName}
            {isAdmin && " (admin)"}
          </span>
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}

function Section({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-y border-border px-3 py-1.5">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        <span className="text-xs text-muted-foreground">{count}</span>
        <span className="ml-auto">{action}</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-1.5">{children}</nav>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 py-4 text-center text-xs leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

function Item({
  item,
  active,
  done,
}: {
  item: ReviewItem;
  active: boolean;
  done?: boolean;
}) {
  return (
    <Link
      href={`/review/${item.conversationId}`}
      prefetch
      className={cn(
        "mb-0.5 block rounded-[var(--radius)] px-3 py-2 text-sm hover:bg-muted",
        active && "bg-muted font-medium",
      )}
    >
      <span className="flex items-center gap-2">
        {done ? (
          <CheckCircle2 className="h-3 w-3 shrink-0 text-accent" />
        ) : (
          <span className="h-2 w-2 shrink-0 rounded-full border border-muted-foreground/40" />
        )}
        <span className="min-w-0 flex-1 truncate">{item.title}</span>
      </span>
      <span className="mt-0.5 block pl-5 text-xs text-muted-foreground">
        {done && item.submissionCount && item.submissionCount > 1
          ? `Updated ${item.submissionCount} times`
          : done
            ? "Reviewed"
            : "Not yet reviewed"}
      </span>
    </Link>
  );
}
