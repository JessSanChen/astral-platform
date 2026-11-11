/**
 * Which commit this running copy of the app was built from.
 *
 * Vercel supplies the commit when it builds. Anywhere else there is none to
 * report, and "local" says so.
 *
 * It is put in every page as <meta name="astral-build">, so the question
 * "is the change live yet?" has an answer that does not involve guessing
 * from what a page happens to say. That matters most for checking that a
 * commit which failed its tests did not reach the site.
 */
export const BUILD_COMMIT =
  (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || "local";
