import { requireOnboarded } from "@/lib/gate";
import { listConversations } from "@/lib/conversations";
import { ChatSidebar } from "@/components/chat-sidebar";
import { MasterNav } from "@/components/master-nav";
import { ConversationStoreProvider } from "@/components/conversation-store";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAdmin } = await requireOnboarded();

  // The submitted count is derived from this same list on the client, so
  // there is no second query for it.
  const conversations = await listConversations(user.id);

  return (
    <ConversationStoreProvider
      initialConversations={conversations.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        currentVersion: c.currentVersion,
        createdAt: (c.lastMessageAt ?? c.updatedAt ?? new Date()).toISOString(),
      }))}
    >
      <div className="flex h-screen">
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
