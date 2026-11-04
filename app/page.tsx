import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/chat");

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-8 px-6 text-center">
      <div className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">Astral</h1>
        <p className="text-muted-foreground">
          Transcript generation for AI &times; biosecurity research. Chat with a
          range of models, label your conversations, and submit them for the
          study.
        </p>
      </div>
      <div className="flex gap-3">
        <Link href="/sign-up">
          <Button size="lg">Create account</Button>
        </Link>
        <Link href="/sign-in">
          <Button size="lg" variant="outline">
            Sign in
          </Button>
        </Link>
      </div>
    </main>
  );
}
