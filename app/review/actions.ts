"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import {
  AssignmentError,
  requestAssignment,
  skipAssignment,
  submitAudit,
  submitReview,
  touchAssignment,
  nothingMessage,
  whyNothing,
  type Purpose,
} from "@/lib/assignments";
import { getCurrentUser, whyBlocked } from "@/lib/gate";
import { getPolicy } from "@/lib/policy";
import {
  INSTRUCTION_QUESTIONS,
  auditSchema,
  reviewSchema,
  skipSchema,
} from "@/lib/review-form";

/**
 * What a reviewer does. Every action answers `{ ok }` and, when something
 * could not be done, says why in words meant for the person.
 */
type Fail = { ok: false; message: string; errors?: Record<string, string> };

async function reviewer(): Promise<{ id: string } | { fail: Fail }> {
  const cu = await getCurrentUser();
  if (!cu) return { fail: { ok: false, message: "Please sign in again." } };
  const blocked = whyBlocked(cu);
  if (blocked) return { fail: { ok: false, message: blocked.message } };
  return { id: cu.user.id };
}

function issues(error: { issues: { path: PropertyKey[]; message: string }[] }): Fail {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, message: "Please complete the highlighted answers.", errors };
}

async function guarded<T extends object>(work: () => Promise<T>): Promise<({ ok: true } & T) | Fail> {
  try {
    return { ok: true, ...(await work()) };
  } catch (error) {
    if (error instanceof AssignmentError) return { ok: false, message: error.message };
    throw error;
  }
}

/**
 * The instruction check (form R). All five have to be right; which ones
 * were wrong comes back so they can be tried again.
 */
export async function completeInstructionCheck(
  answers: Record<string, string>,
): Promise<{ ok: true } | { ok: false; message: string; wrong: string[] }> {
  const who = await reviewer();
  if ("fail" in who) return { ...who.fail, wrong: [] };
  const wrong = INSTRUCTION_QUESTIONS.filter((q) => answers[q.id] !== q.correct).map((q) => q.id);
  if (wrong.length > 0) {
    return {
      ok: false,
      message: "Not quite. Read the notes beside the ones marked, and try those again.",
      wrong,
    };
  }
  const policy = await getPolicy();
  await db
    .update(userTable)
    .set({ policyReadyVersion: policy.version })
    .where(eq(userTable.id, who.id));
  return { ok: true };
}

/** The next item, or the one already in hand. */
export async function getNextAssignment(purpose: Purpose) {
  const who = await reviewer();
  if ("fail" in who) return who.fail;
  return guarded(async () => {
    const assignment = await requestAssignment(who.id, purpose);
    if (assignment) return { assignmentId: assignment.id, nothing: null };
    // Nothing to give: say why, in numbers, so it need not be taken on trust.
    return { assignmentId: null, nothing: nothingMessage(purpose, await whyNothing(who.id, purpose)) };
  });
}

export async function submitReviewAction(assignmentId: string, draft: unknown) {
  const who = await reviewer();
  if ("fail" in who) return who.fail;
  const parsed = reviewSchema.safeParse(draft);
  if (!parsed.success) return issues(parsed.error);
  return guarded(() => submitReview(assignmentId, who.id, parsed.data));
}

export async function submitAuditAction(assignmentId: string, draft: unknown) {
  const who = await reviewer();
  if ("fail" in who) return who.fail;
  const parsed = auditSchema.safeParse(draft);
  if (!parsed.success) return issues(parsed.error);
  return guarded(() => submitAudit(assignmentId, who.id, parsed.data));
}

export async function skipAction(assignmentId: string, input: { reason: string; note: string }) {
  const who = await reviewer();
  if ("fail" in who) return who.fail;
  const parsed = skipSchema.safeParse(input);
  if (!parsed.success) return issues(parsed.error);
  return guarded(async () => {
    await skipAssignment(assignmentId, who.id, parsed.data.reason, parsed.data.note);
    return {};
  });
}

/** Says the reviewer is still here. Nothing to report back. */
export async function stillHere(assignmentId: string) {
  const who = await reviewer();
  if ("fail" in who) return;
  await touchAssignment(assignmentId, who.id);
}
