import Link from "next/link";
import { requireAdmin } from "@/lib/gate";
import { participantTable } from "@/lib/admin";
import { getEventSettings } from "@/lib/openrouter";
import { ParticipantRow } from "@/components/admin-controls";
import { ROLES, domainLabel, type IntakeDraft } from "@/lib/intake";
import { cn } from "@/lib/utils";

type Sort = "submitted" | "reviews" | "audits" | "drafts" | "name";

const SORTS: { key: Sort; label: string }[] = [
  { key: "submitted", label: "Work submitted" },
  { key: "reviews", label: "Transcript reviews" },
  { key: "audits", label: "Comparisons" },
  { key: "drafts", label: "Drafts" },
  { key: "name", label: "Name" },
];

/** A line about someone from their intake: role, then what they rate highest. */
function intakeLine(stored: unknown) {
  const intake = (stored ?? {}) as Partial<IntakeDraft>;
  const role =
    intake.role === "other" && intake.roleOther
      ? intake.roleOther
      : ROLES.find((r) => r.value === intake.role)?.label;
  const rated = Object.entries(intake.familiarity ?? {})
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([id, level]) => `${level} ${domainLabel(id)}`);
  return [role, rated.join(", ")].filter(Boolean).join(" · ");
}

export default async function Participants({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const me = await requireAdmin();
  const { sort } = await searchParams;
  const by = (SORTS.find((s) => s.key === sort)?.key ?? "submitted") as Sort;

  const [rows, settings] = await Promise.all([
    participantTable(),
    getEventSettings(),
  ]);

  const sorted = [...rows].sort((a, b) => {
    if (by === "name") return a.name.localeCompare(b.name);
    return Number(b[by]) - Number(a[by]) || a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-4 px-5 py-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Rank by</span>
        {SORTS.map((option) => (
          <Link
            key={option.key}
            href={`/admin/participants?sort=${option.key}`}
            prefetch
            className={cn(
              "rounded-full px-3 py-1 text-sm transition-colors",
              by === option.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <p className="max-w-4xl text-xs leading-relaxed text-muted-foreground">
        Raw counts: what each person submitted, and what they did as a
        reviewer. Skipping something outside one&apos;s expertise is what
        reviewers are asked to do, so skips are shown, not held against
        anyone. Quality is yours to judge: open someone to read what they
        actually produced.
      </p>

      <div className="@container overflow-x-auto rounded-[var(--radius)] border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left">
            <tr>
              <Th>Participant</Th>
              <Th right>Submitted</Th>
              <Th right>Drafts</Th>
              <Th right>Transcript reviews</Th>
              <Th right>Comparisons</Th>
              <Th right>Skips</Th>
              <Th right>Nominations</Th>
              <Th right>Tokens</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const about = intakeLine(row.intake);
              return (
                <ParticipantRow
                  key={row.id}
                  columns={10}
                  userId={row.id}
                  name={row.name}
                  paused={row.banned}
                  isOrganizer={row.is_admin}
                  isSelf={row.id === me.user.id}
                  budget={row.daily_token_budget}
                  defaultBudget={settings.defaultDailyTokenBudget}
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/participants/${row.id}`}
                      prefetch
                      className="font-medium text-accent underline"
                    >
                      {row.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{row.email}</p>
                    {about && <p className="text-xs text-muted-foreground">{about}</p>}
                  </td>
                  <Td right strong={by === "submitted"}>{row.submitted}</Td>
                  <Td right strong={by === "drafts"}>{row.drafts}</Td>
                  <Td right strong={by === "reviews"}>{row.reviews}</Td>
                  <Td right strong={by === "audits"}>{row.audits}</Td>
                  <Td right>{row.skips}</Td>
                  <Td right>{row.nominations}</Td>
                  <Td right>{Number(row.tokens).toLocaleString()}</Td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "text-xs",
                        row.banned ? "font-medium text-danger" : "text-muted-foreground",
                      )}
                    >
                      {row.banned ? "Paused" : row.is_admin ? "Organizer" : "Active"}
                    </span>
                    {!row.intake_done ? (
                      <p className="text-xs text-muted-foreground">Intake not finished</p>
                    ) : (
                      !row.policy_ready && (
                        <p className="text-xs text-muted-foreground">Not yet able to review</p>
                      )
                    )}
                  </td>
                </ParticipantRow>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                  No participants yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  right,
}: {
  children?: React.ReactNode;
  right?: boolean;
}) {
  return (
    <th
      className={cn(
        "px-3 py-2 text-xs font-medium text-muted-foreground",
        right && "text-right",
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  right,
  strong,
}: {
  children: React.ReactNode;
  right?: boolean;
  strong?: boolean;
}) {
  return (
    <td
      className={cn(
        "px-3 py-2 tabular-nums",
        right && "text-right",
        strong && "font-semibold",
      )}
    >
      {children}
    </td>
  );
}
