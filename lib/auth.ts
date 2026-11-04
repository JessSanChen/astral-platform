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
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // No email verification for the MVP; participants are on site.
    requireEmailVerification: false,
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
