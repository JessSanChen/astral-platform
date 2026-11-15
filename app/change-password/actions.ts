"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { session as sessionTable, user as userTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { passwordProblem } from "@/lib/credentials";
import { getCurrentUser } from "@/lib/gate";
import {
  byId,
  lockedMessage,
  returnPasswordAttempt,
  takePasswordAttempt,
} from "@/lib/sign-in-guard";

export type ChangePasswordState = {
  errors?: { currentPassword?: string; newPassword?: string };
  message?: string;
  changedAt?: number;
};

/**
 * Changing your own password.
 *
 * Needs the current one, so a laptop left open is not enough to take an
 * account over. On success every other session of the account is ended:
 * if someone else had got in with the old password, this is what puts them
 * out again.
 */
export async function changeOwnPassword(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const cu = await getCurrentUser();
  if (!cu) return { message: "Please sign in again." };

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  if (!currentPassword) {
    return { errors: { currentPassword: "Enter the password you signed in with." } };
  }
  if (newPassword === currentPassword) {
    return { errors: { newPassword: "Choose a different password from the current one." } };
  }
  const problem = passwordProblem(newPassword, {
    name: cu.user.name,
    email: cu.user.email,
    organizer: cu.isAdmin,
  });
  if (problem) return { errors: { newPassword: problem } };

  // The current password is a password being checked, so it gets the same
  // limit as signing in, from the same count. Without one, this form would
  // be the place to guess it: anyone at an unattended laptop could try as
  // many as they liked, and then keep the account.
  const attempt = await takePasswordAttempt(byId(cu.user.id));
  if (!attempt.allowed) {
    return { errors: { currentPassword: lockedMessage(attempt.minutes) } };
  }

  try {
    await auth.api.changePassword({
      body: { currentPassword, newPassword, revokeOtherSessions: false },
      headers: await headers(),
    });
  } catch (error) {
    const code = (error as { body?: { code?: string } } | null)?.body?.code;
    if (code === "INVALID_PASSWORD") {
      return { errors: { currentPassword: "That is not your current password." } };
    }
    // Not a wrong guess, so it does not use up an attempt.
    await returnPasswordAttempt(byId(cu.user.id));
    return {
      message:
        "The password could not be changed. Sign out, sign in again, and try once more.",
    };
  }

  // Every other session of this account ends here; the one making the
  // change carries on. The login system can do this itself, but it does it
  // by replacing this session too, part-way through the request, and the
  // page then renders against a session that has just stopped existing and
  // sends the person to sign in.
  await db
    .delete(sessionTable)
    .where(
      and(eq(sessionTable.userId, cu.user.id), ne(sessionTable.id, cu.session.session.id)),
    );

  await db
    .update(userTable)
    .set({ mustChangePassword: false, failedSignIns: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(userTable.id, cu.user.id));
  await recordAudit({ action: "password_changed", actor: cu.user });

  // Where the change was required, it was the only thing standing between
  // the person and the app, so they are sent on from here. Leaving it to
  // the page loses a race: the page re-renders as soon as the password is
  // no longer due, and goes somewhere of its own choosing first.
  if (formData.get("required") === "yes") redirect("/chat");
  return { changedAt: Date.now() };
}
