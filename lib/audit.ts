import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { auditEvent, user } from "@/db/schema";

/**
 * What can be recorded. A fixed list, each with the words it is shown as,
 * so the console reads as sentences and a typo cannot invent a new kind.
 */
export const AUDIT_ACTIONS = {
  password_set: "set a temporary password for",
  password_changed: "changed their own password",
  organizer_granted: "made an organizer of",
  organizer_removed: "removed organizer rights from",
  tester_marked: "marked as a tester",
  tester_unmarked: "removed the tester mark from",
  tester_marked_everyone: "marked every existing account as a tester",
  account_paused: "paused the account of",
  account_resumed: "let back in",
  allowance_set: "changed the allowance of",
  settings_changed: "changed the event settings",
  event_code_changed: "changed the event code",
  chat_paused: "paused chat for everyone",
  chat_resumed: "resumed chat for everyone",
  nominations_closed: "closed nominations",
  nominations_reopened: "reopened nominations",
  nominations_deadline: "changed when nominations close",
  routing_changed: "changed the review routing of a submission by",
  submissions_released: "released pending submissions for review",
  policy_published: "published a new review policy",
  terms_published: "published new terms",
  model_list_changed: "switched the model list",
  export_downloaded: "downloaded the export",
  everyone_signed_out: "signed everyone out",
  sign_in_locked: "Password attempts ran out, and sign-in was locked, for",
  weak_password_flagged: "Signed in with a password that has to be replaced:",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

/** Things the system did, with nobody acting. */
const BY_THE_SYSTEM = new Set<AuditAction>(["sign_in_locked", "weak_password_flagged"]);

type Person = { id: string; name?: string | null; email?: string | null };

const label = (p: Person | null | undefined) =>
  p ? [p.name, p.email].filter(Boolean).join(" · ") || p.id : null;

/**
 * Writes one line to the record.
 *
 * Never throws. A failure to write the record of an action must not undo or
 * block the action; it is reported to the server log instead.
 */
export async function recordAudit(event: {
  action: AuditAction;
  actor?: Person | null;
  /** The account acted on, by id (looked up) or with its details in hand. */
  target?: Person | string | null;
  detail?: string | null;
}) {
  try {
    let target: Person | null = null;
    if (typeof event.target === "string") {
      const [row] = await db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(eq(user.id, event.target));
      target = row ?? { id: event.target };
    } else if (event.target) {
      target = event.target;
    }
    await db.insert(auditEvent).values({
      action: event.action,
      actorId: event.actor?.id ?? null,
      actorLabel: label(event.actor),
      targetUserId: target?.id ?? null,
      targetLabel: label(target),
      detail: event.detail ?? null,
    });
  } catch (error) {
    console.error("audit: could not record", event.action, error);
  }
}

/** The most recent events, newest first, as sentences. */
export async function recentAudit(limit = 200) {
  const rows = await db
    .select()
    .from(auditEvent)
    .orderBy(desc(auditEvent.createdAt))
    .limit(limit);

  // Whether the people involved are organizers now, to make an organizer's
  // account being acted on stand out.
  const ids = [...new Set(rows.flatMap((r) => [r.actorId, r.targetUserId]).filter(Boolean))] as string[];
  const roles = ids.length
    ? await db.select({ id: user.id, role: user.role }).from(user).where(inArray(user.id, ids))
    : [];
  const organizers = new Set(roles.filter((r) => r.role === "admin").map((r) => r.id));

  return rows.map((r) => {
    const action = r.action as AuditAction;
    return {
      id: r.id,
      at: r.createdAt,
      system: BY_THE_SYSTEM.has(action),
      actor: r.actorLabel,
      words: AUDIT_ACTIONS[action] ?? r.action,
      target: r.targetLabel,
      targetIsOrganizer: r.targetUserId ? organizers.has(r.targetUserId) : false,
      detail: r.detail,
    };
  });
}
