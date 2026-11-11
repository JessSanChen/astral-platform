import Link from "next/link";
import { FileText, ListChecks, Trophy, UserRound } from "lucide-react";
import { requireOnboarded } from "@/lib/gate";
import { getMyProfile } from "@/lib/profile";
import { trackLabel } from "@/lib/nominations";
import { ProfileForm } from "@/components/profile-form";
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
          What you tell us here is attached to every transcript you submit, so
          the research team knows the expertise behind it. It is never shown to
          other participants, and you can change it at any point today.
        </p>
      </div>

      {/* What this account has done so far, each a way back to that console. */}
      <section className="grid grid-cols-3 gap-3">
        <Stat
          icon={<FileText className="h-5 w-5" />}
          value={counts.submitted}
          label={`transcripts submitted${
            counts.started > counts.submitted
              ? ` · ${counts.started - counts.submitted} draft`
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
          label="Terms accepted"
          value={
            account?.termsAcceptedAt
              ? `Version ${account.termsVersion} on ${formatEventDateTime(
                  account.termsAcceptedAt,
                )}`
              : "Not yet accepted"
          }
        />
      </section>

      <ProfileForm
        defaultName={account?.name ?? ""}
        details={
          details && {
            name: account?.name ?? "",
            affiliation: details.affiliation,
            role: details.role,
            highestDegree: details.highestDegree,
            yearsExperience: details.yearsExperience,
            primaryBackground: details.primaryBackground,
            subdomains: details.subdomains ?? [],
            aiFamiliarity: details.aiFamiliarity,
            expertiseNote: details.expertiseNote ?? "",
          }
        }
      />
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
