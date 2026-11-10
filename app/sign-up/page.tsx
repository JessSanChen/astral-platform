"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUp, useSession } from "@/lib/auth-client";
import { EVENT_CODE_HEADER } from "@/lib/event-code-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [eventCode, setEventCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { data: session, isPending } = useSession();

  // Someone already signed in has no business on this page, and seeing the
  // form invites the belief that a browser can hold two accounts at once. It
  // cannot: every tab shares one session.
  useEffect(() => {
    if (!isPending && session) router.replace("/chat");
  }, [isPending, session, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // The code travels with the request that creates the account, and the
    // server refuses the account without it. Checking it in a separate call
    // first would only be advice to the browser.
    const { error } = await signUp.email(
      { name, email, password },
      { headers: { [EVENT_CODE_HEADER]: eventCode } },
    );
    if (error) {
      setError(error.message ?? "Could not create account.");
      setLoading(false);
      return;
    }
    router.push("/onboarding");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          You will set up your profile next.
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="code">Event code</Label>
          <Input id="code" value={eventCode} onChange={(e) => setEventCode(e.target.value)} required />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating..." : "Create account"}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-accent underline">Sign in</Link>
      </p>
    </main>
  );
}
