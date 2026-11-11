import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getEventSettings } from "@/lib/openrouter";
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
          <span className="font-serif text-xl font-medium tracking-tight">Astral</span>
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

      {/* The front page is the introduction and the way in, nothing more. The
          full briefing (prizes, deadlines, what happens to the data) is at
          /guide once someone has signed in. */}
      <main className="mx-auto max-w-3xl px-6 pb-24">
        <section className="py-20 sm:py-28">
          <h1 className="font-serif text-6xl font-medium tracking-tight sm:text-7xl">
            Astral
          </h1>
          <p className="mt-6 max-w-xl font-serif text-xl leading-relaxed text-muted-foreground sm:text-2xl sm:leading-relaxed">
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
            <div className="mt-14 border-t border-border pt-6">
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
      </main>
    </div>
  );
}
