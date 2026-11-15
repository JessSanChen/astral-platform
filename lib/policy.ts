import { desc } from "drizzle-orm";
import { db } from "@/db";
import { reviewPolicy } from "@/db/schema";
import { CACHE_KEYS, SETTINGS_TTL_MS, cached } from "@/lib/cache";

/**
 * The review instructions: one short, shared definition of what a
 * reviewer is deciding, shown before the first review and kept within
 * reach beside every one.
 *
 * It replaced a rule-based reference policy. There are no rules to cite
 * and nothing to configure: the text is the instrument. It is meant to
 * stay as it is for the whole study. Should it have to change, a new
 * version is published from Organize → Review instructions, every
 * reviewer answers the instruction questions again, and each review
 * records the version it was made under, so judgments made under
 * different wordings are never mixed without anyone knowing.
 *
 * The table and its columns keep the name they had when this was a
 * policy (`review_policy`, `policy_version`, `policy_ready_version`).
 * They now mean the review instructions and the instruction check.
 *
 * Migration 0011 publishes the text below. The same text is used if a
 * database somehow has none.
 */
export type Policy = { version: number; body: string; publishedAt: Date };

export const SHARED_REVIEW_DEFINITION = `# Reviewing conversations for specialist attention

Your task is to decide whether the user's activity visible in this conversation warrants additional examination by a specialist in biological safety or security.

Consider the scientific subject matter and the available evidence of the user's purpose and behavior. Base your judgment on what the user actually requests, states, or does in the visible record. Do not assume access to hidden motives, resources, authorization, or outcomes.

Ignore whether the assistant answered, refused, or blocked a request when making the referral decision. A refusal is not evidence that the user should be flagged, and a refusal does not make a concerning request unworthy of review. Likewise, an assistant's helpful answer does not, by itself, make the user's activity more deserving of referral. You may read assistant messages for conversational context, but ground your judgment in the user's activity.

Sensitive scientific subject matter by itself does not necessarily warrant referral; legitimate research may be dual use. A referral is not a conclusion that the user intends harm or that harm occurred. If the information does not support a clear decision, you may choose Cannot determine.

**Primary question:** Based on the visible user activity, would you recommend specialist review?`;

export async function getPolicy(): Promise<Policy> {
  return cached(CACHE_KEYS.reviewPolicy, SETTINGS_TTL_MS, async () => {
    const [row] = await db
      .select()
      .from(reviewPolicy)
      .orderBy(desc(reviewPolicy.version))
      .limit(1);
    if (!row) return { version: 0, body: SHARED_REVIEW_DEFINITION, publishedAt: new Date(0) };
    return { version: row.version, body: row.body, publishedAt: row.publishedAt };
  });
}
