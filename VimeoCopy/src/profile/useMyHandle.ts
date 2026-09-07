import { useEffect, useState } from "react";
import { useAuth } from "../Auth/useAuth";
import { API_BASE_URL } from "../config";

/**
 * The signed-in user's public handle, or null when they haven't claimed one.
 *
 * Shared by the sidebar shortcut and the dashboard's "View public profile" button so the two can't
 * disagree about whether a public profile exists.
 *
 * The handle is stored WITH the token it was fetched for, and the returned value is derived from
 * that. Keeping a bare handle in state means that after signing out and in as someone else, the
 * shortcut points at the previous account's profile until the new fetch lands. Tying it to the
 * token makes that window impossible, and means nothing has to be cleared on the way out.
 */
export function useMyHandle(): string | null {
  const { accessToken, authFetch } = useAuth();
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
        /* no shortcut is fine; the dashboard still links onward to the profile editor */
      }
    })();

    return () => { cancelled = true; };
  }, [accessToken, authFetch]);

  return handleFor && handleFor.token === accessToken ? handleFor.handle : null;
}
