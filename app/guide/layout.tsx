import { requireOnboarded } from "@/lib/gate";
import { MasterNav } from "@/components/master-nav";

export default async function GuideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
