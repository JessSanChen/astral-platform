import { ClipboardCheck } from "lucide-react";
import { requireOnboarded } from "@/lib/gate";
import { listClaimed } from "@/lib/reviews";
import { getEventSettings } from "@/lib/openrouter";
import { StartReviewing } from "@/components/start-reviewing";

export default async function ReviewHome() {
  const { user } = await requireOnboarded();
  const [claimed, settings] = await Promise.all([
    listClaimed(user.id),
    getEventSettings(),
  ]);

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col justify-center gap-5 px-6 py-12">
      <div className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <ClipboardCheck className="h-5 w-5" />
          Review other people&apos;s transcripts
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          You are shown conversations other participants have submitted, without
          their name or their own description of what they were doing. Read each
          one and say what you think is actually happening in it. A second,
          independent judgement is often more reliable than the author&apos;s own.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          You get {settings.reviewBatchSize} at a time, held for you alone so
          nobody else labels the same conversation. Reviewing one moves it to
          the Reviewed list, where you can still change your answers.
        </p>
      </div>

      <StartReviewing
        batch={claimed.map((c) => c.conversationId)}
        batchSize={settings.reviewBatchSize}
      />
    </div>
  );
}
