"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessagesSquare, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/** Moves between a participant's own chats and reviewing other people's. */
export function ConsoleSwitch() {
  const pathname = usePathname();
  const onReview = pathname.startsWith("/review");

  return (
    <div className="flex gap-1 rounded-[var(--radius)] bg-muted p-1">
      <Tab href="/chat" active={!onReview} icon={<MessagesSquare className="h-3.5 w-3.5" />}>
        My chats
      </Tab>
      <Tab href="/review" active={onReview} icon={<ClipboardCheck className="h-3.5 w-3.5" />}>
        Review
      </Tab>
    </div>
  );
}

function Tab({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      prefetch
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-[calc(var(--radius)-2px)] px-2 py-1.5 text-sm transition-colors",
        active
          ? "bg-card font-medium shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </Link>
  );
}
