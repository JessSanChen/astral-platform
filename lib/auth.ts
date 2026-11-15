import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { setSessionCookie } from "better-auth/cookies";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { recordAudit } from "@/lib/audit";
import * as schema from "@/db/schema";
import { emailProblem, guessableByAnyone, passwordProblem } from "@/lib/credentials";
import {
  byEmail,
  lockedMessage,
  returnPasswordAttempt,
  takePasswordAttempt,
} from "@/lib/sign-in-guard";
import {
  EVENT_CODE_HEADER,
  EVENT_CODE_REJECTED,
  eventCodeMatches,
} from "@/lib/event-code";

/**
 * Where this instance is served from.
 *
 * Better Auth refuses requests whose Origin does not match, which is what
 * keeps another site from driving sign-ins against this one. Production sets
 * BETTER_AUTH_URL. A Vercel preview deployment gets a fresh hostname for
 * every push, which no fixed value can know in advance, so there the origin
 * comes from Vercel's own variable. Without this, signing in on a preview
 * fails with "Invalid origin" and the preview is useless for testing.
 */
const vercelUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : undefined;
const branchUrl = process.env.VERCEL_BRANCH_URL
  ? `https://${process.env.VERCEL_BRANCH_URL}`
  : undefined;
const baseURL = process.env.BETTER_AUTH_URL ?? vercelUrl;

export const auth = betterAuth({
  baseURL,
  // The stable production address plus, on Vercel, this deployment's own
  // hostname and its branch alias.
  trustedOrigins: [baseURL, vercelUrl, branchUrl].filter(
    (url): url is string => Boolean(url),
  ),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  user: {
    // Including our own columns in the session means the user row that Better
    // Auth already reads on every request also carries what the app needs, so
    // the app does not have to read the same row a second time. These come
    // from that same live read, so an admin raising a budget still takes
    // effect on the participant's next request.
    additionalFields: {
      isPaused: { type: "boolean", required: false, input: false },
      dailyTokenBudget: { type: "number", required: false, input: false },
      judgeRunsPerHour: { type: "number", required: false, input: false },
      termsVersion: { type: "number", required: false, input: false },
      termsAcceptedAt: { type: "date", required: false, input: false },
      profileCompletedAt: { type: "date", required: false, input: false },
      mustChangePassword: { type: "boolean", required: false, input: false },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // No email verification for the MVP; participants are on site.
    requireEmailVerification: false,
  },
  session: {
    /**
     * Carry the session in a signed cookie for half a minute.
     *
     * This removes a database read from most page loads, which is the single
     * largest fixed cost of opening a page when the database is a network
     * hop away.
     *
     * The cost, accepted deliberately: pausing a participant can take up to
     * this long to take effect, because the cached copy still reports the
     * account as in good standing and nothing in the request can tell that it
     * is wrong. Shorten maxAge if that ever needs to be tighter.
     *
     * The reverse direction is handled rather than waited out: lib/session.ts
     * re-reads from the database whenever the cached copy says a participant
     * cannot proceed, so finishing onboarding takes effect at once instead of
     * bouncing them back to it.
     */
    cookieCache: { enabled: true, maxAge: 30 },
  },
  rateLimit: {
    // Better Auth enables rate limiting in production only, and its default
    // for sign-in and sign-up is 3 requests per 10 seconds keyed by IP
    // address. Every participant at the event shares the venue's single
    // address, so that default would throttle the whole room to three
    // sign-ups per ten seconds and most people would see errors during
    // registration.
    //
    // These limits are deliberately generous for that shared-address case.
    // What actually keeps strangers out is the event code required to sign
    // up, and an organizer can pause any account instantly.
    enabled: true,
    window: 60,
    max: 600,
    customRules: {
      "/sign-up/email": { window: 60, max: 200 },
      "/sign-in/email": { window: 60, max: 200 },
    },
  },
  plugins: [
    admin({
      // These emails get the admin role assigned in a post-signup hook (see below).
      adminRoles: ["admin"],
    }),
    nextCookies(),
  ],
  hooks: {
    /**
     * The event code is enforced here, on the endpoint that creates the
     * account, and nowhere else.
     *
     * It used to be checked by the sign-up page calling a separate endpoint
     * first. That only stopped people who used the page: posting straight to
     * the sign-up endpoint created an account with no code at all, so
     * changing the code to close registration closed nothing.
     */
    before: createAuthMiddleware(async (ctx) => {
      refuseIfNotForTheBrowser(ctx.path, Boolean(ctx.request));
      if (ctx.path === "/sign-in/email") return beforeSignIn(ctx.body);
      if (ctx.path !== "/sign-up/email") return;
      const code = ctx.headers?.get(EVENT_CODE_HEADER);
      if (!(await eventCodeMatches(code))) {
        throw new APIError("FORBIDDEN", { message: EVENT_CODE_REJECTED });
      }

      // The same checks the form makes, made again where they count. With
      // no email on the day there is nothing to catch a mistyped address
      // and no way for someone to reset a password themselves, so both are
      // worth getting right at the door.
      const body = (ctx.body ?? {}) as {
        name?: unknown;
        email?: unknown;
        password?: unknown;
      };
      const name = typeof body.name === "string" ? body.name : "";
      const email = typeof body.email === "string" ? body.email : "";
      const password = typeof body.password === "string" ? body.password : "";
      const problem =
        emailProblem(email) ?? passwordProblem(password, { name, email });
      if (problem) throw new APIError("BAD_REQUEST", { message: problem });
    }),

    /**
     * What a sign-in attempt leaves behind.
     *
     * The attempt was counted before the password was checked (see
     * lib/sign-in-guard.ts). A right password clears the count, and is then
     * looked at: this is the one moment the password itself is in hand, so
     * it is the only place one that no longer meets the rules can be caught.
     */
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email") return;
      const body = (ctx.body ?? {}) as { email?: unknown; password?: unknown };
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!email) return;

      const signedIn = ctx.context.newSession;
      if (!signedIn) {
        // A wrong password keeps the attempt it took. Anything else that
        // stopped the sign-in gets it back: a paused account is refused
        // whatever is typed, and that is not somebody guessing.
        const code = (ctx.context.returned as { body?: { code?: string } } | undefined)?.body
          ?.code;
        if (code !== "INVALID_EMAIL_OR_PASSWORD") await returnPasswordAttempt(byEmail(email));
        return;
      }

      const account = signedIn.user as typeof signedIn.user & {
        role?: string | null;
        mustChangePassword?: boolean | null;
      };
      // Anything guessable by a stranger was turned away before it got
      // here. What is left to catch is narrower: a password built on the
      // person's own name or address, one without a number, or one too
      // short for an organizer. None of those is something a stranger
      // walks in with, so the person who has it may replace it themselves.
      const weak = passwordProblem(password, {
        name: account.name,
        email: account.email,
        organizer: account.role === "admin",
      });
      await db
        .update(schema.user)
        .set({
          failedSignIns: 0,
          lockedUntil: null,
          ...(weak ? { mustChangePassword: true } : {}),
        })
        .where(eq(schema.user.id, account.id));

      if (weak && !account.mustChangePassword) {
        await recordAudit({ action: "weak_password_flagged", target: account, detail: weak });
        // The session was written a moment ago with the old value, and its
        // copy in the cookie would be believed for the next half minute.
        // Write it again with the new one, so the very first page after
        // signing in is the one that asks for a new password.
        await setSessionCookie(ctx, {
          session: signedIn.session,
          user: { ...signedIn.user, mustChangePassword: true } as typeof signedIn.user,
        });
      }
    }),
  },
  // Nothing here grants the organizer role. It used to be given at sign-up
  // to any address listed in ADMIN_EMAILS, but addresses are not verified,
  // so whoever registered a listed address first became an organizer, with
  // the export and everyone's password reset in reach. The role is now only
  // ever given by an existing organizer (app/admin/actions.ts) or by the
  // seed script, which needs the database credentials to run.
});

export type Session = typeof auth.$Infer.Session;

/**
 * Parts of the login library that are not for browsers to call.
 *
 * The library answers on /api/auth/ for everything it can do, and that
 * includes a whole administration API: set anyone's password, change
 * anyone's role, sign in as anyone, delete anyone. All of it accepts any
 * organizer's session. The app has its own versions of the few of these it
 * needs (app/admin/actions.ts), which check the account afresh, hold
 * passwords to the rules, sign people out when they should be, and write
 * down what was done. Left open, these would be a way round every one of
 * those: someone with an organizer's cookie could do it all by hand and
 * leave no trace.
 *
 * So they are refused when they arrive as a request from outside. The app
 * still uses one of them itself, by calling the library directly from the
 * server, where there is no request and this lets it through.
 *
 * Changing a password is on the list for the same reason: the app's own
 * form (app/change-password) applies the rules and counts wrong guesses,
 * and the library's endpoint does neither.
 */
function refuseIfNotForTheBrowser(path: string, fromOutside: boolean) {
  if (!fromOutside) return;
  if (path.startsWith("/admin/") || path === "/change-password" || path === "/set-password") {
    throw new APIError("NOT_FOUND", { message: "Not found." });
  }
}

/**
 * What happens before a password is checked at sign-in.
 *
 * First, a password that anyone could guess is turned away without being
 * checked at all, right or wrong. Sign-up has refused these for a while,
 * but accounts older than that rule can still have one, and letting it work
 * "one last time, to choose a new one" hands the account to whoever tries
 * it first: they are the one who gets to choose. The owner of such an
 * account asks an organizer for a temporary password instead, which is a
 * conversation a guesser cannot have.
 *
 * Then the attempt is counted against the account, and refused if there
 * have been too many.
 */
async function beforeSignIn(body: unknown) {
  const { email: rawEmail, password: rawPassword } = (body ?? {}) as {
    email?: unknown;
    password?: unknown;
  };
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  const password = typeof rawPassword === "string" ? rawPassword : "";
  if (!email) return;

  if (guessableByAnyone(password)) {
    throw new APIError("FORBIDDEN", {
      message:
        "That password is too easy to guess, so it is no longer accepted here, for any account. If it is yours, ask an organizer to set a new one for you.",
    });
  }

  const attempt = await takePasswordAttempt(byEmail(email));
  if (!attempt.allowed) {
    throw new APIError("TOO_MANY_REQUESTS", { message: lockedMessage(attempt.minutes) });
  }
}
