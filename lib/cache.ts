/**
 * A tiny in-process cache for rows that are read on every page load but
 * change rarely: the event settings and the current terms version.
 *
 * Without it each navigation pays a network round trip to the database for
 * values that are identical thousands of times in a row. The TTL is short so
 * an admin change takes effect quickly on its own, and `invalidate` makes it
 * immediate for the instance that made the change.
 *
 * Each server instance keeps its own copy, which is fine for values that are
 * advisory rather than authoritative. Anything that must be exact at the
 * moment it is read, such as a budget or a rate limit, is never cached.
 */
type Entry<T> = { value: T; expires: number };

const store = new Map<string, Entry<unknown>>();

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
