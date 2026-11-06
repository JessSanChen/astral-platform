import Link from "next/link";
import { requireAdmin } from "@/lib/gate";
import { MasterNav } from "@/components/master-nav";
import { AdminTabs } from "@/components/admin-tabs";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAdmin } = await requireAdmin();

  return (
    <div className="flex h-screen">
      <MasterNav userName={user.name} userEmail={user.email} isAdmin={isAdmin} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-border px-5 py-2.5">
          <Link href="/admin" className="text-sm font-semibold">
            Organizer console
          </Link>
          <AdminTabs />
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
