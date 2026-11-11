import { requireAdmin } from "@/lib/gate";
import { listTermsVersions, termsAcceptance } from "@/lib/terms";
import { formatEventDateTime } from "@/lib/time";
import { Panel } from "@/components/admin-ui";
import { TermsEditor } from "@/components/admin-terms";

export const metadata = { title: "Terms" };

export default async function AdminTerms() {
  await requireAdmin();
  const versions = await listTermsVersions();
  const current = versions[0] ?? null;
  const acceptance = await termsAcceptance(current?.version ?? 0);

  return (
    <div className="max-w-5xl space-y-5 px-5 py-5">
      <Panel
        title="Terms and conditions"
        description={
          current
            ? `Version ${current.version} is in force, published ${formatEventDateTime(current.publishedAt)}. ${acceptance.accepted} of ${acceptance.total} accounts have accepted it.`
            : "Nothing has been published yet, so nobody is being asked to accept anything."
        }
      >
        <TermsEditor
          // Rebuilt after each publish, so the box starts from the text
          // that is now in force.
          key={current?.version ?? 0}
          currentVersion={current?.version ?? 0}
          currentBody={current?.body ?? ""}
          accounts={acceptance.total}
        />
      </Panel>

      <Panel
        title="Every version"
        description="Kept as published. What someone agreed to is the version recorded against their account."
      >
        <ul className="divide-y divide-border text-sm">
          {versions.map((v) => (
            <li key={v.version} className="py-2.5">
              <details>
                <summary className="flex cursor-pointer items-baseline gap-3">
                  <span className="font-medium">Version {v.version}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatEventDateTime(v.publishedAt)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {v.body.replace(/[#*_>`]/g, "").replace(/\s+/g, " ").slice(0, 90)}
                  </span>
                </summary>
                <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-[var(--radius)] bg-muted/50 p-3 font-sans text-xs leading-relaxed">
                  {v.body}
                </pre>
              </details>
            </li>
          ))}
          {versions.length === 0 && (
            <li className="py-2.5 text-muted-foreground">No versions yet.</li>
          )}
        </ul>
      </Panel>
    </div>
  );
}
