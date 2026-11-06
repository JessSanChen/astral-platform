import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getEventSettings } from "@/lib/openrouter";
import { AboutAstral } from "@/components/about-astral";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/chat");

  // The model list is curated by the organizers, so name them rather than
  // claiming a number that goes stale the moment one is swapped out.
  const settings = await getEventSettings().catch(() => null);
  const models = settings?.enabledModels ?? [];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
          <span className="text-sm font-semibold tracking-[0.2em]">ASTRAL</span>
          <div className="flex items-center gap-2">
            <Link href="/sign-in">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </Link>
            <Link href="/sign-up">
              <Button size="sm">Create account</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-24">
        <section className="py-16 sm:py-20">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Astral
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">
            A one-day workshop building the dataset that AI biosecurity
            scanners are missing. You talk to the models, you label what
            happened, and the record goes to the research.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/sign-up">
              <Button size="lg">Create account</Button>
            </Link>
            <Link href="/sign-in">
              <Button size="lg" variant="outline">
                Sign in
              </Button>
            </Link>
            <span className="text-sm text-muted-foreground">
              You will need the event code from the organizers.
            </span>
          </div>

          {models.length > 0 && (
            <div className="mt-10 border-t border-border pt-6">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Models available today
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {models.map((m) => (
                  <span
                    key={m.id}
                    className="rounded-full border border-border bg-card px-2.5 py-1 text-xs"
                  >
                    {m.displayName}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        <AboutAstral />

        <section className="mt-16 rounded-[var(--radius)] border border-border bg-card px-6 py-8 text-center">
          <h2 className="text-lg font-semibold">Ready when you are</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Creating an account takes a minute: a few questions about your
            background, and the terms. Then you can start straight away.
          </p>
          <Link href="/sign-up" className="mt-5 inline-block">
            <Button size="lg">Create account</Button>
          </Link>
        </section>
      </main>
    </div>
  );
}
