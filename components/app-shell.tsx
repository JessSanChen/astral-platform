import { requireOnboarded } from "@/lib/gate";
import { MasterNav } from "@/components/master-nav";

/**
 * The frame around every console that has no list of its own: the sidebar,
 * and the page beside it. Chat, review and the organizer console each load
 * something extra for their own sidebars, so they keep their own layouts.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isAdmin } = await requireOnboarded();
  return (
    <div className="flex h-screen">
      <MasterNav
        userName={user.name}
        userEmail={user.email}
        isAdmin={isAdmin}
      />
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
