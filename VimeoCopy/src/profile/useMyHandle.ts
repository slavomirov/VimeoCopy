import { useEffect, useState } from "react";
import { useAuth } from "../Auth/useAuth";
import { API_BASE_URL } from "../config";

export interface MyPublicProfile {
  /** The claimed handle, or null if there isn't one yet. */
  handle: string | null;
  /**
   * Route to the live public profile, or null when there is no handle to address it with.
   *
   * A handle is the ONLY public address: /u/{handle}. Callers that want a destination regardless
   * should send a handle-less user to the profile editor to claim one.
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
  const { accessToken, authFetch } = useAuth();
  const [handleFor, setHandleFor] = useState<{ token: string; handle: string | null } | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`${API_BASE_URL}/api/profiles/me`, { silent: true });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setHandleFor({ token: accessToken, handle: data.handle ?? null });
      } catch {
        /* no handle resolved: callers treat that the same as not having claimed one */
      }
    })();

    return () => { cancelled = true; };
  }, [accessToken, authFetch]);

  const handle = handleFor && handleFor.token === accessToken ? handleFor.handle : null;

  const path = accessToken && handle ? `/u/${handle}` : null;

  return { handle, path };
}
