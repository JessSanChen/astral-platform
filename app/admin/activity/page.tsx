import { requireAdmin } from "@/lib/gate";
import { recentAudit } from "@/lib/audit";
import { formatEventDateTime } from "@/lib/time";
import { Panel } from "@/components/admin-ui";
import { SignEveryoneOut } from "@/components/admin-security";

/**
 * What organizers have done, newest first.
 *
 * An organizer account can set passwords, promote people and download every
 * transcript. If one is ever used by someone who should not have it, this
 * is where that shows: what was done, to whom, and when.
 */
export default async function AdminActivity() {
  await requireAdmin();
  const events = await recentAudit(200);

  return (
    <div className="max-w-4xl space-y-5 px-5 py-5">
      <Panel
        title="If an account may have been got into"
        description="Changing a password signs that account out everywhere. This signs out every account at once."
      >
        <SignEveryoneOut />
      </Panel>

      <Panel
        title={`Organizer activity (latest ${events.length})`}
        description="Every change made from this console, and every download of the export. A line you do not recognise is worth asking about."
      >
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
        ) : (
          <ol className="divide-y divide-border">
            {events.map((e) => (
              <li key={e.id} className="py-2.5 text-sm">
                <p>
                  {e.system ? (
                    <span className="font-medium">{e.words}</span>
                  ) : (
                    <>
                      <span className="font-medium">
                        {e.actor ?? "Someone with the database credentials"}
                      </span>{" "}
                      {e.words}
                    </>
                  )}
                  {e.target && (
                    <>
                      {" "}
                      <span className="font-medium">{e.target}</span>
                      {e.targetIsOrganizer && (
                        <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          organizer
                        </span>
                      )}
                    </>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatEventDateTime(e.at)}
                  {e.detail && ` · ${e.detail}`}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
