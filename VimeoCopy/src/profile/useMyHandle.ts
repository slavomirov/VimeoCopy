import { useEffect, useState } from "react";
import { useAuth } from "../Auth/useAuth";
import { API_BASE_URL } from "../config";

export interface MyPublicProfile {
  /** The claimed handle, or null if there isn't one yet. */
  handle: string | null;
  /**
   * Route to the live public profile, or null when not signed in.
   *
   * Prefers the handle for a readable URL and falls back to the user id, which the public profile
   * endpoint also resolves. That fallback is the point: claiming a handle is optional, so without
   * it there was no address for the page at all and the shortcut had nowhere to go but the editor.
   */
  path: string | null;
}

/**
 * The signed-in user's public profile identity.
 *
 * Shared by the sidebar shortcut and the dashboard button so the two can't disagree about where a
 * user's public page lives.
 *
 * The handle is stored WITH the token it was fetched for, and the returned value is derived from
 * that. Keeping a bare handle in state means that after signing out and in as someone else, the
 * shortcut points at the previous account's profile until the new fetch lands. Tying it to the
 * token makes that window impossible, and means nothing has to be cleared on the way out.
 */
export function useMyPublicProfile(): MyPublicProfile {
  const { accessToken, authFetch, claims } = useAuth();
  const [handleFor, setHandleFor] = useState<{ token: string; handle: string | null } | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`${API_BASE_URL}/api/profile/me`, { silent: true });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setHandleFor({ token: accessToken, handle: data.handle ?? null });
      } catch {
        /* fall back to the id path below; the page is still reachable */
      }
    })();

    return () => { cancelled = true; };
  }, [accessToken, authFetch]);

  const handle = handleFor && handleFor.token === accessToken ? handleFor.handle : null;

  // `claims` is an untyped bag of JWT claims, so the subject is narrowed rather than asserted.
  const userId = typeof claims.sub === "string" && claims.sub.length > 0 ? claims.sub : null;

  const path = !accessToken ? null : handle ? `/u/${handle}` : userId ? `/u/${userId}` : null;

  return { handle, path };
}
