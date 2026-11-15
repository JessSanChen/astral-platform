import { requireAdmin } from "@/lib/gate";
import { listPolicyVersions, policyReadiness } from "@/lib/admin";
import { PLACEHOLDER_POLICY, rulesAsText } from "@/lib/policy";
import { BUILT_IN_BASES } from "@/lib/review-form";
import { formatEventDateTime } from "@/lib/time";
import { Panel } from "@/components/admin-ui";
import { PolicyEditor } from "@/components/admin-policy";

export const metadata = { title: "Policy" };

/**
 * The reference policy reviewers apply, and the rules they can cite.
 *
 * Read straight from the table, not through the few seconds' memory the
 * rest of the app uses, so the page shows a version the moment it is
 * published.
 */
export default async function AdminPolicy() {
  await requireAdmin();
  const versions = await listPolicyVersions();
  const current = versions[0] ?? null;
  const readiness = await policyReadiness(current?.version ?? 0);

  return (
    <div className="max-w-5xl space-y-5 px-5 py-5">
      <Panel
        title="Reference policy"
        description={
          current
            ? `Version ${current.version} is in force, published ${formatEventDateTime(current.publishedAt)}. ${readiness.ready} of ${readiness.total} accounts have passed the instruction check for it.`
            : "Nothing has been published yet. Reviewing stays closed until a policy is published: participants see a placeholder and cannot be given anything to review."
        }
      >
        <PolicyEditor
          // Rebuilt after each publish, so the boxes start from what is now
          // in force.
          key={current?.version ?? 0}
          currentVersion={current?.version ?? 0}
          currentBody={current?.body ?? ""}
          currentRules={current ? rulesAsText(current.rules) : ""}
          placeholderBody={PLACEHOLDER_POLICY}
          builtIn={BUILT_IN_BASES.map((b) => b.label)}
          reviewersReady={readiness.ready}
          responses={readiness.responses}
        />
      </Panel>

      <Panel
        title="Every version"
        description="Kept as published. Each review records the version it was made under."
      >
        <ul className="divide-y divide-border text-sm">
          {versions.map((v) => (
            <li key={v.version} className="py-2.5">
              <details>
                <summary className="flex cursor-pointer items-baseline gap-3">
                  <span className="font-medium">Version {v.version}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatEventDateTime(v.publishedAt)} · {v.rules.length} rule
                    {v.rules.length === 1 ? "" : "s"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {v.body.replace(/[#*_>`]/g, "").replace(/\s+/g, " ").slice(0, 90)}
                  </span>
                </summary>
                <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-[var(--radius)] bg-muted/50 p-3 font-sans text-xs leading-relaxed">
                  {v.body}
                </pre>
                <pre className="mt-2 whitespace-pre-wrap rounded-[var(--radius)] bg-muted/50 p-3 font-mono text-xs leading-relaxed">
                  {rulesAsText(v.rules) || "No rules."}
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
