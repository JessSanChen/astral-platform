import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
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
      if (ctx.path !== "/sign-up/email") return;
      const code = ctx.headers?.get(EVENT_CODE_HEADER);
      if (!(await eventCodeMatches(code))) {
        throw new APIError("FORBIDDEN", { message: EVENT_CODE_REJECTED });
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
