"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a page that someone leaves open in step with the server.
 *
 * A page is rendered once, when it is opened. Without this, a participant
 * with the nominations page already on screen would go on seeing an open
 * form after an organizer closed nominations, until they happened to
 * navigate. This asks the server again every so often, when the tab is
 * returned to, and at a moment known in advance (`at`, such as a closing
 * time). Asking again re-renders what came from the server and leaves
 * anything typed into the page alone.
 */
export function KeepFresh({
  everyMs = 15_000,
  at,
}: {
  everyMs?: number;
  at?: string | null;
}) {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      // A tab nobody is looking at can wait until it is looked at.
      if (document.visibilityState === "visible") router.refresh();
    };
    const interval = window.setInterval(refresh, everyMs);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    let timer: number | undefined;
    if (at) {
      const wait = new Date(at).getTime() - Date.now();
      // A second late rather than a moment early. Browsers cap a timer at
      // about 24 days; further off than that, the interval will do.
      if (wait > 0 && wait < 2_000_000_000) timer = window.setTimeout(refresh, wait + 1000);
    }

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [router, everyMs, at]);

  return null;
}
