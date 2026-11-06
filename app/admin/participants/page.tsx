import Link from "next/link";
import { requireAdmin } from "@/lib/gate";
import { participantTable } from "@/lib/admin";
import { getEventSettings } from "@/lib/openrouter";
import { ParticipantActions } from "@/components/admin-controls";
import { cn } from "@/lib/utils";

type Sort = "benign" | "reviews" | "submitted" | "name";

const SORTS: { key: Sort; label: string; note?: string }[] = [
  { key: "benign", label: "Benign transcripts", note: "prize: benign use cases" },
  { key: "reviews", label: "Reviews completed", note: "prize: independent reviewer" },
  { key: "submitted", label: "Transcripts submitted" },
  { key: "name", label: "Name" },
];

export default async function Participants({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const me = await requireAdmin();
  const { sort } = await searchParams;
  const by = (SORTS.find((s) => s.key === sort)?.key ?? "benign") as Sort;

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

      <p className="text-xs leading-relaxed text-muted-foreground">
        Two prizes are decided by counting: most benign transcripts, and most
        independent reviews. These are raw counts. Quality is yours to judge,
        so open someone to read what they actually produced before awarding
        anything.
      </p>

      <div className="overflow-x-auto rounded-[var(--radius)] border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left">
            <tr>
              <Th>Participant</Th>
              <Th right>Benign</Th>
              <Th right>Dual use</Th>
              <Th right>Adversarial</Th>
              <Th right>Submitted</Th>
              <Th right>Reviews</Th>
              <Th right>Nominations</Th>
              <Th right>Tokens</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.id} className="border-t border-border align-top">
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/participants/${row.id}`}
                    prefetch
                    className="font-medium text-accent underline"
                  >
                    {row.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">{row.email}</p>
                  {row.affiliation && (
                    <p className="text-xs text-muted-foreground">
                      {row.affiliation}
                      {row.role ? ` · ${row.role}` : ""}
                    </p>
                  )}
                </td>
                <Td right strong={by === "benign"}>{row.benign}</Td>
                <Td right>{row.dual_use}</Td>
                <Td right>{row.adversarial}</Td>
                <Td right>{row.submitted}</Td>
                <Td right strong={by === "reviews"}>{row.reviews}</Td>
                <Td right>{row.nominations}</Td>
                <Td right>{Number(row.tokens).toLocaleString()}</Td>
                <td className="px-3 py-2">
                  {row.banned ? (
                    <span className="text-xs font-medium text-danger">Paused</span>
                  ) : row.is_admin ? (
                    <span className="text-xs text-muted-foreground">Organizer</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Active</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <ParticipantActions
                    userId={row.id}
                    name={row.name}
                    paused={row.banned}
                    isOrganizer={row.is_admin}
                    isSelf={row.id === me.user.id}
                    budget={row.daily_token_budget}
                    defaultBudget={settings.defaultDailyTokenBudget}
                  />
                </td>
              </tr>
            ))}
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
