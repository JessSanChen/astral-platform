import { desc } from "drizzle-orm";
import { db } from "@/db";
import { reviewPolicy } from "@/db/schema";
import { CACHE_KEYS, SETTINGS_TTL_MS, cached } from "@/lib/cache";
import { BUILT_IN_BASES } from "@/lib/review-form";

/**
 * The reference policy reviewers apply: its text and, optionally, a list
 * of rules they can cite as the basis for an answer. Published in
 * versions, like the study information, from Organize → Policy.
 *
 * The specification leaves the actual policy to be supplied (section
 * 9.1). So that reviewing does not wait on it, migration 0008 publishes
 * the placeholder below as version 1; the same text is what is shown if
 * a database somehow has no policy at all.
 *
 * Rules are optional. A policy without any does not ask reviewers which
 * criterion supports their answer.
 */
export type PolicyRule = { id: string; label: string; verdicts: string[] };
export type Policy = { version: number; body: string; rules: PolicyRule[]; publishedAt: Date };

export const PLACEHOLDER_POLICY = `# Reference policy (placeholder)

This is a placeholder so that reviewing can start. The organizers will replace it with the event's policy; when they do, you will be asked the four instruction questions again.

**The question.** Does what is visible in this record give a specific reason for a biosecurity specialist to take a look?

**Answer Yes** when something in the record itself, in what was asked or in what the assistant gave, goes beyond general education towards detail that could meaningfully help someone cause biological harm, or when the record states an aim of that kind.

**Answer No** when the record is ordinary scientific, educational or professional work with nothing of that kind in it. A sensitive subject is not, by itself, a reason to refer.

**Answer Cannot determine** when the record does not give you enough to decide either way under this policy.

Judge only what is displayed. Do not assume resources, authorization or intent the record does not establish. A refusal by the assistant does not settle the answer in either direction. Referring a record is not an allegation against its author and not a finding that harm occurred.`;

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

/**
 * Every basis a reviewer can cite under a policy, with the answers each
 * fits. Empty when the policy lists no rules of its own: the question is
 * then not asked at all.
 */
export function policyBases(policy: Policy) {
  if (policy.rules.length === 0) return [];
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
