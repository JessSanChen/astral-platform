import { requireOnboarded } from "@/lib/gate";
import { listMyWork } from "@/lib/episodes";
import { ChatSidebar } from "@/components/chat-sidebar";
import { MasterNav } from "@/components/master-nav";
import { ConversationStoreProvider } from "@/components/conversation-store";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAdmin } = await requireOnboarded();
  const work = await listMyWork(user.id);

  return (
    <ConversationStoreProvider
      initialConversations={work.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        createdAt: (c.lastMessageAt ?? c.updatedAt ?? new Date()).toISOString(),
        episodeId: c.episodeId,
        episodeTitle: c.episodeTitle,
        isFolder: c.isFolder,
        sessionOrder: c.sessionOrder,
        episodeStatus: c.episodeStatus,
        related: c.related,
      }))}
    >
      <div className="flex h-screen overflow-hidden">
        <MasterNav
          userName={user.name}
          userEmail={user.email}
          isAdmin={isAdmin}
        />
        <ChatSidebar />
        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </ConversationStoreProvider>
  );
}
