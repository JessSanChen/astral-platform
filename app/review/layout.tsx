import { requireOnboarded } from "@/lib/gate";
import { listClaimed, listCompleted } from "@/lib/reviews";
import { ReviewSidebar } from "@/components/review-sidebar";

export default async function ReviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAdmin } = await requireOnboarded();
  const [claimed, completed] = await Promise.all([
    listClaimed(user.id),
    listCompleted(user.id),
  ]);

  return (
    <div className="flex h-screen">
      <ReviewSidebar
        toReview={claimed.map((c) => ({
          conversationId: c.conversationId,
          title: c.title,
          modelId: c.modelId,
        }))}
        completed={completed.map((c) => ({
          conversationId: c.conversationId,
          title: c.title,
          modelId: c.modelId,
          updatedAt: c.updatedAt?.toISOString(),
          submissionCount: c.submissionCount,
        }))}
        userName={user.name}
        isAdmin={isAdmin}
      />
      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
