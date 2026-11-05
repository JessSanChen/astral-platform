import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";

const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const auth = betterAuth({
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
  // Deliberately no session cookie cache.
  //
  // Caching the session in a cookie would remove a database read from every
  // page load, which is tempting on a distant database. It was tried and
  // reverted: the cached copy keeps saying an account is in good standing
  // after an organizer has paused it, and nothing in the request can tell
  // that it is wrong. Pausing someone is a safety control that has to take
  // effect at once, so it is read from the database every time.
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
  databaseHooks: {
    user: {
      create: {
        // Grant the admin role at creation time for configured emails.
        before: async (u) => {
          if (adminEmails.includes(u.email.toLowerCase())) {
            return { data: { ...u, role: "admin" } };
          }
          return { data: u };
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
