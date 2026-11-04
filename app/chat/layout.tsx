import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversation } from "@/db/schema";
import { requireOnboarded } from "@/lib/gate";
import { listConversations } from "@/lib/conversations";
import { ChatSidebar } from "@/components/chat-sidebar";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAdmin } = await requireOnboarded();
  const conversations = await listConversations(user.id);

  const [counts] = await db
    .select({ submitted: sql<number>`count(*)::int` })
    .from(conversation)
    .where(
      and(eq(conversation.userId, user.id), eq(conversation.status, "submitted")),
    );

  return (
    <div className="flex h-screen">
      <ChatSidebar
        conversations={conversations.map((c) => ({
          id: c.id,
          title: c.title,
          status: c.status,
          currentVersion: c.currentVersion,
        }))}
        submittedCount={counts?.submitted ?? 0}
        userName={user.name}
        isAdmin={isAdmin}
      />
      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
