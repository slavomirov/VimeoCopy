/**
 * Download requests, app-wide.
 *
 * Two things need the same state and would otherwise each fetch it: every gallery tile (has this
 * viewer already asked for this file?) and the sidebar badge (how many people are waiting on me?).
 * A grid of 24 tiles asking individually would be 24 requests for one answer, so the viewer's own
 * requests are loaded once here and read from context.
 *
 * The ask-dialog lives here too — one instance for the whole app, opened by whichever tile was
 * clicked, rather than a modal mounted per card.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../Auth/useAuth";
import { API_BASE_URL } from "../config";
import {
  DownloadRequestsContext,
  EMPTY_SUMMARY,
  type AskTarget,
  type DownloadRequestStatus,
  type DownloadRequestSummary,
} from "./DownloadRequestsContext";

export function DownloadRequestsProvider({ children }: { children: ReactNode }) {
  const { accessToken, authFetch } = useAuth();
  const navigate = useNavigate();

  const [statuses, setStatuses] = useState<Record<string, DownloadRequestStatus>>({});
  const [summary, setSummary] = useState<DownloadRequestSummary>(EMPTY_SUMMARY);
  const [asking, setAsking] = useState<AskTarget | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  /** Bumped to re-run the load effect on demand. */
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    // Requests belong to an account, so a visitor has nothing to load. What is already in state is
    // not cleared here — it is gated below instead, which also closes the window where a freshly
    // signed-in user could see the previous account's requests.
    if (!accessToken) return;

    let cancelled = false;
    (async () => {
      try {
        const [outgoingRes, summaryRes] = await Promise.all([
          authFetch(`${API_BASE_URL}/api/download-requests/outgoing`, { silent: true }),
          authFetch(`${API_BASE_URL}/api/download-requests/summary`, { silent: true }),
        ]);

        if (outgoingRes.ok) {
          const rows: { mediaId: string | null; status: DownloadRequestStatus }[] = await outgoingRes.json();
          if (!cancelled) {
            // Showreel rows carry no mediaId. Left in, they'd key the map under "null" and the
            // first one would decide what every gallery tile with no request of its own displays.
            setStatuses(Object.fromEntries(
              rows.filter((r) => r.mediaId).map((r) => [r.mediaId as string, r.status]),
            ));
          }
        }
        if (summaryRes.ok) {
          const data = await summaryRes.json();
          if (!cancelled) setSummary({ ...EMPTY_SUMMARY, ...data });
        }
      } catch {
        /* the buttons fall back to "not asked yet"; the server is the authority either way */
      }
    })();

    return () => { cancelled = true; };
  }, [accessToken, authFetch, tick]);

  const statusFor = useCallback(
    (mediaId: string) => (accessToken ? statuses[mediaId] ?? null : null),
    [accessToken, statuses]
  );

  const openRequestDialog = useCallback(
    (target: AskTarget) => {
      if (!accessToken) {
        toast.error("Sign in to ask the owner for this file.");
        navigate("/profile");
        return;
      }
      setNote("");
      setAsking(target);
    },
    [accessToken, navigate]
  );

  async function send() {
    if (!asking || sending) return;

    setSending(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/download-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId: asking.id, message: note.trim() || null }),
        silent: true,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Couldn't send that request.");
      }

      const created: { mediaId: string; status: DownloadRequestStatus } = await res.json();
      // Reflect the server's answer rather than assuming "Pending": asking twice returns the
      // request that already exists, which may already be approved.
      setStatuses((prev) => ({ ...prev, [created.mediaId]: created.status }));
      setSummary((prev) => ({
        ...prev,
        pendingOutgoing:
          created.status === "Pending" ? prev.pendingOutgoing + 1 : prev.pendingOutgoing,
      }));
      setAsking(null);
      toast.success(
        created.status === "Approved"
          ? "You already have access to this file."
          : "Request sent — the owner has been emailed."
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send that request.");
    } finally {
      setSending(false);
    }
  }

  const value = useMemo(
    () => ({
      statusFor,
      summary: accessToken ? summary : EMPTY_SUMMARY,
      openRequestDialog,
      refresh,
    }),
    [statusFor, summary, accessToken, openRequestDialog, refresh]
  );

  return (
    <DownloadRequestsContext.Provider value={value}>
      {children}

      {asking && createPortal(
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--overlay-medium)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "var(--space-4)",
          }}
          onClick={() => setAsking(null)}
        >
          <div
            className="card modal-card"
            style={{ maxWidth: 520, width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-header">
              <h2 className="card-title" style={{ marginBottom: 0 }}>Ask for the original</h2>
            </div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <p className="text-muted" style={{ marginBottom: 0, fontSize: "var(--font-size-sm)" }}>
                The owner of <strong>{asking.fileName || "this file"}</strong> decides. They get an
                email and see your request on their Requests page — nothing is downloaded until they
                say yes.
              </p>
              <div>
                <label htmlFor="request-note">Note (optional)</label>
                <textarea
                  id="request-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="What do you need the original for?"
                  style={{ resize: "vertical" }}
                />
              </div>
            </div>
            <div className="card-body" style={{ paddingTop: 0, display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}>
              <button className="btn-secondary" onClick={() => setAsking(null)} disabled={sending}>Cancel</button>
              <button className="btn-primary" onClick={send} disabled={sending}>
                {sending ? "Sending…" : "Send request"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </DownloadRequestsContext.Provider>
  );
}
