/**
 * A tiny in-process cache for rows that are read on every page load but
 * change rarely: the event settings and the current terms version.
 *
 * Without it each navigation pays a network round trip to the database for
 * values that are identical thousands of times in a row. The TTL is short so
 * an admin change takes effect quickly on its own, and `invalidate` makes it
 * immediate on the server that handled the change. Other servers catch up
 * when their copy expires, which is why the organizer console says "within
 * about ten seconds" rather than "now".
 *
 * Each server instance keeps its own copy, which is fine for values that are
 * advisory rather than authoritative. Anything that must be exact at the
 * moment it is read, such as a budget or a rate limit, is never cached.
 */
type Entry<T> = { value: T; expires: number };

/**
 * How long a cached value may be used before it is read again. One number,
 * exported, because the tests need to wait exactly this long in the one case
 * where they change a value behind the app's back.
 */
export const SETTINGS_TTL_MS = 10_000;

// One store for the whole process, held on globalThis.
//
// A plain module-level Map looks like one store and is not: the production
// build gives pages and API routes their own copies of this module, so
// clearing "the" cache from an organizer's action cleared the pages' copy
// and left the chat route's untouched. Pausing chat therefore took up to
// ten seconds to take effect even on a single server. Hanging the Map on
// globalThis makes every copy of the module use the same one.
const globalForCache = globalThis as unknown as {
  astralCache?: Map<string, Entry<unknown>>;
};
const store = (globalForCache.astralCache ??= new Map<string, Entry<unknown>>());

export async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await load();
  store.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

export function invalidate(key: string) {
  store.delete(key);
}

export const CACHE_KEYS = {
  eventSettings: "event-settings",
  latestTermsVersion: "latest-terms-version",
} as const;
