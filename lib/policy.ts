import { desc } from "drizzle-orm";
import { db } from "@/db";
import { reviewPolicy } from "@/db/schema";
import { CACHE_KEYS, SETTINGS_TTL_MS, cached } from "@/lib/cache";
import { BUILT_IN_BASES } from "@/lib/review-form";

/**
 * The reference policy reviewers apply: its text, and the rules they can
 * cite as the basis for an answer. Published in versions, like the study
 * information, from Organize → Policy.
 *
 * The specification leaves the actual rules to be supplied (section 9.1),
 * so the platform starts with a placeholder that says so and has no rules
 * of its own. Nothing here invents one.
 */
export type PolicyRule = { id: string; label: string; verdicts: string[] };
export type Policy = { version: number; body: string; rules: PolicyRule[]; publishedAt: Date };

export const PLACEHOLDER_POLICY = `# Reference policy (PLACEHOLDER)

The reference policy for this event has not been entered yet. An organizer
publishes it from **Organize → Policy** before reviewing begins.

Until then, treat this as a practice version: the question reviewers answer
is whether the visible record warrants specialist review under the policy,
and there is no policy here to apply.`;

export async function getPolicy(): Promise<Policy> {
  return cached(CACHE_KEYS.reviewPolicy, SETTINGS_TTL_MS, async () => {
    const [row] = await db
      .select()
      .from(reviewPolicy)
      .orderBy(desc(reviewPolicy.version))
      .limit(1);
    if (!row) return { version: 0, body: PLACEHOLDER_POLICY, rules: [], publishedAt: new Date(0) };
    return {
      version: row.version,
      body: row.body,
      rules: (row.rules as PolicyRule[]) ?? [],
      publishedAt: row.publishedAt,
    };
  });
}

/** Every basis a reviewer can cite under a policy, with the answers each fits. */
export function policyBases(policy: Policy) {
  return [
    ...policy.rules.map((r) => ({
      value: r.id,
      label: `${r.id}: ${r.label}`,
      verdicts: r.verdicts.length ? r.verdicts : ["yes", "no", "indeterminate"],
    })),
    ...BUILT_IN_BASES,
  ];
}

/**
 * Reads rules typed one per line as `ID | label | answers`, where answers
 * is a comma-separated list of yes, no, indeterminate and may be left off
 * to mean a rule that supports Yes.
 */
export function parseRules(text: string): { rules: PolicyRule[]; problem: string | null } {
  const rules: PolicyRule[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const [i, line] of lines.entries()) {
    const [id, label, answers] = line.split("|").map((part) => part.trim());
    if (!id || !label) {
      return { rules: [], problem: `Line ${i + 1} needs an ID and a label, separated by "|".` };
    }
    if (!/^[A-Za-z0-9._-]{1,40}$/.test(id)) {
      return { rules: [], problem: `Line ${i + 1}: an ID is letters, digits, dots, dashes or underscores.` };
    }
    if (seen.has(id) || BUILT_IN_BASES.some((b) => b.value === id)) {
      return { rules: [], problem: `Line ${i + 1}: the ID "${id}" is already used.` };
    }
    seen.add(id);
    const verdicts = (answers ?? "yes")
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
    if (verdicts.some((v) => !["yes", "no", "indeterminate"].includes(v))) {
      return { rules: [], problem: `Line ${i + 1}: answers can only be yes, no or indeterminate.` };
    }
    rules.push({ id, label: label.slice(0, 200), verdicts });
  }
  return { rules, problem: null };
}

export const rulesAsText = (rules: PolicyRule[]) =>
  rules.map((r) => `${r.id} | ${r.label} | ${r.verdicts.join(", ")}`).join("\n");
