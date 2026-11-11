import { requireOnboarded } from "@/lib/gate";
import { AboutAstral } from "@/components/about-astral";

export const metadata = { title: "How today works" };

export default async function GuidePage() {
  await requireOnboarded();

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-12 space-y-2">
        <h1 className="font-serif text-3xl font-medium tracking-tight">How today works</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Why the day exists, what you will be doing, the prizes and their
          deadlines, and what happens to what you write.
        </p>
      </div>
      <AboutAstral />
    </div>
  );
}
