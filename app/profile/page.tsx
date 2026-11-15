import Link from "next/link";
import { FileText, ListChecks, Trophy, UserRound } from "lucide-react";
import { requireOnboarded } from "@/lib/gate";
import { trackLabel } from "@/lib/nominations";
import { getMyProfile } from "@/lib/profile";
import { ChangePasswordForm } from "@/components/change-password-form";
import { ProfileForm } from "@/components/profile-form";
import { intakeDraft } from "@/lib/intake";
import { formatEventDateTime } from "@/lib/time";

export const metadata = { title: "Your profile" };

function Stat({
  icon,
  value,
  label,
  href,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-[var(--radius)] border border-border bg-card px-4 py-3 transition-colors hover:bg-muted"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span>
        <span className="block text-xl font-semibold tabular-nums">{value}</span>
        <span className="block text-xs text-muted-foreground">{label}</span>
      </span>
    </Link>
  );
}

export default async function ProfilePage() {
  const { user } = await requireOnboarded();
  const { account, details, counts } = await getMyProfile(user.id);

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-6 py-12">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 font-serif text-3xl font-medium tracking-tight">
          <UserRound className="h-5 w-5" />
          Your profile
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Your answers are kept with what you submit, so the research team
          knows the background behind it. They are never shown to other
          participants, and you can change them at any point today.
        </p>
      </div>

      {/* What this account has done so far, each a way back to that console. */}
      <section className="grid grid-cols-3 gap-3">
        <Stat
          icon={<FileText className="h-5 w-5" />}
          value={counts.submitted}
          label={`submitted${
            counts.started > counts.submitted
              ? ` · ${counts.started - counts.submitted} in progress`
              : ""
          }`}
          href="/chat"
        />
        <Stat
          icon={<ListChecks className="h-5 w-5" />}
          value={counts.reviews}
          label="reviews finished"
          href="/review"
        />
        <Stat
          icon={<Trophy className="h-5 w-5" />}
          value={counts.nominations.length}
          label={
            counts.nominations.length
              ? counts.nominations.map((t) => trackLabel(t)).join(", ")
              : "nominations entered"
          }
          href="/nominate"
        />
      </section>

      <section className="space-y-1.5 rounded-[var(--radius)] border border-border bg-muted/40 px-4 py-3 text-sm">
        <Row label="Email" value={account?.email ?? ""} />
        <Row
          label="Account"
          value={account?.role === "admin" ? "Organizer" : "Participant"}
        />
        <Row
          label="Study information agreed"
          value={
            account?.termsAcceptedAt
              ? `Version ${account.termsVersion} on ${formatEventDateTime(
                  account.termsAcceptedAt,
                )}`
              : "Not yet"
          }
        />
      </section>

      <ProfileForm
        defaultName={account?.name ?? ""}
        intake={intakeDraft(details?.intake)}
        publicRelease={details?.publicReleasePermission ?? ""}
      />

      <section className="space-y-4 border-t border-border pt-8">
        <div className="space-y-1">
          <h2 className="font-serif text-xl font-medium">Password</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Changing it signs this account out everywhere else it is signed
            in, within half a minute. Do that if you think someone else knows
            it.
          </p>
        </div>
        <ChangePasswordForm
          name={account?.name ?? ""}
          email={account?.email ?? ""}
          organizer={account?.role === "admin"}
        />
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>

    </div>
  );
}
