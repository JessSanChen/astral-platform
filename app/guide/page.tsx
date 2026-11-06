import { requireOnboarded } from "@/lib/gate";
import { AboutAstral } from "@/components/about-astral";

export const metadata = { title: "How today works" };

export default async function GuidePage() {
  await requireOnboarded();

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-12 space-y-2">
        <h1 className="text-2xl font-semibold">How today works</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The same briefing as the front page, kept here so you can check a
          deadline or a prize rule without signing out.
        </p>
      </div>
      <AboutAstral />
    </div>
  );
}
