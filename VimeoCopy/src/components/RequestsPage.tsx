/**
 * Requests — the in-app half of the download-request flow.
 *
 * Two lists, because the same row means different things depending on which side you're on:
 * requests waiting on YOU (answer them) and requests you've made (see where they got to). The
 * owner's list is first: it's the one with work in it.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../Auth/useAuth";
import { API_BASE_URL } from "../config";
import { useDownloadRequests } from "./useDownloadRequests";
import "../App.css";

interface DownloadRequestRow {
  id: number;
  /** Null on a showreel row — that one asks for a set, not a file. */
  mediaId: string | null;
  kind: "Media" | "Showreel";
  /** How many files are in the showreel right now. Showreel rows only. */
  showreelCount: number;
  fileName: string | null;
  contentType: string | null;
  fileSize: number;
  hasThumbnail: boolean;
  requesterName: string;
  requesterHandle: string | null;
  ownerName: string;
  ownerHandle: string | null;
  status: "Pending" | "Approved" | "Denied";
  message: string | null;
  createdAt: string;
  decidedAt: string | null;
}

function formatBytes(value: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(Number.isInteger(size) ? 0 : 1)} ${units[i]}`;
}

/**
 * What this row is asking for, in one line.
 *
 * A showreel row has no file behind it, so every field the per-file layout reads is null. Naming it
 * here keeps that branch in one place instead of scattering `row.kind ===` checks through the JSX.
 */
function describeTarget(row: DownloadRequestRow) {
  if (row.kind === "Showreel") {
    return `Showreel · ${row.showreelCount} file${row.showreelCount === 1 ? "" : "s"}`;
  }
  return row.fileName || "Untitled";
}

/**
 * What the "busy" flag is keyed on.
 *
 * A media row is keyed by its file, a showreel row by the request itself — two showreel rows from
 * different artists share no media id, so keying both on mediaId would leave showreel buttons
 * either all spinning at once or none of them.
 */
function keyOf(row: DownloadRequestRow) {
  return row.kind === "Showreel" ? `showreel:${row.id}` : row.mediaId ?? `row:${row.id}`;
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function StatusPill({ status }: { status: DownloadRequestRow["status"] }) {
  const tone =
    status === "Approved" ? "var(--success)" : status === "Denied" ? "var(--danger)" : "var(--primary)";
  return (
    <span
      style={{
        fontSize: "var(--font-size-xs)",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: tone,
        border: `1px solid ${tone}`,
        borderRadius: "var(--radius-full)",
        padding: "2px 10px",
        whiteSpace: "nowrap",
      }}
    >
      {status === "Pending" ? "Waiting" : status}
    </span>
  );
}

export function RequestsPage() {
  const { authFetch } = useAuth();
  const { refresh: refreshBadge } = useDownloadRequests();

  const [incoming, setIncoming] = useState<DownloadRequestRow[]>([]);
  const [outgoing, setOutgoing] = useState<DownloadRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  /** Which row is mid-decision, so its buttons can't be double-fired. */
  const [busyId, setBusyId] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [inRes, outRes] = await Promise.all([
        authFetch(`${API_BASE_URL}/api/download-requests/incoming`, { silent: true }),
        authFetch(`${API_BASE_URL}/api/download-requests/outgoing`, { silent: true }),
      ]);
      if (inRes.ok) setIncoming(await inRes.json());
      if (outRes.ok) setOutgoing(await outRes.json());
    } catch {
      toast.error("Couldn't load your requests.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { load(); }, [load]);

  async function decide(row: DownloadRequestRow, approve: boolean) {
    if (busyId !== null) return;
    setBusyId(row.id);
    try {
      const res = await authFetch(
        `${API_BASE_URL}/api/download-requests/${row.id}/${approve ? "approve" : "deny"}`,
        { method: "POST", silent: true }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Couldn't save that decision.");
      }
      const updated: DownloadRequestRow = await res.json();
      setIncoming((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      // The sidebar counts this row; without it the badge keeps claiming work that is done.
      refreshBadge();
      toast.success(approve ? `${updated.requesterName} can download it now.` : "Request declined.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that decision.");
    } finally {
      setBusyId(null);
    }
  }

  /**
   * Pulls an approved showreel as a zip.
   *
   * Fetched rather than navigated to, because the endpoint needs the bearer token and a plain link
   * carries no headers — which is also why the archive lands in memory before it is saved, and why
   * the server caps a showreel's total size.
   */
  async function downloadShowreel(row: DownloadRequestRow) {
    if (downloadingId || !row.ownerHandle) return;
    setDownloadingId(keyOf(row));
    const toastId = toast.loading("Building the archive…");
    try {
      const res = await authFetch(
        `${API_BASE_URL}/api/download-requests/showreel/${encodeURIComponent(row.ownerHandle)}/zip`,
        { silent: true },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Couldn't build that archive.");
      }

      const href = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = href;
      a.download = `${row.ownerHandle}-showreel.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoked on the next tick — releasing it synchronously cancels the save in some browsers.
      setTimeout(() => URL.revokeObjectURL(href), 0);
      toast.success("Downloaded", { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't build that archive.", { id: toastId });
    } finally {
      setDownloadingId(null);
    }
  }

  /** Same metered endpoint as everywhere else — the approval is what makes it answer. */
  async function download(mediaId: string) {
    if (downloadingId) return;
    setDownloadingId(mediaId);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/media/${mediaId}/download`, { silent: true });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "This file isn't available for download.");
      }
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start the download.");
    } finally {
      setDownloadingId(null);
    }
  }

  const pendingIncoming = incoming.filter((r) => r.status === "Pending");

  if (loading) {
    return <div className="container"><div className="loading" style={{ margin: "var(--space-16) auto" }} /></div>;
  }

  return (
    <div className="container">
      <div className="card">
        <div className="card-header">
          <h1 style={{ marginBottom: 4 }}>Requests</h1>
          <p className="text-muted" style={{ marginBottom: 0, fontSize: "var(--font-size-sm)" }}>
            People asking for your original files, and the files you've asked for. Downloads are part
            of the Gold and Platinum plans — only creators on those can be asked.
          </p>
        </div>

        {/* ── Waiting on you ── */}
        <div className="card-body">
          <h2 style={{ fontSize: "var(--font-size-lg)", marginBottom: "var(--space-3)" }}>
            For your files
            {pendingIncoming.length > 0 && (
              <span style={{ color: "var(--primary)" }}> · {pendingIncoming.length} waiting</span>
            )}
          </h2>

          {incoming.length === 0 ? (
            <p className="text-muted" style={{ fontSize: "var(--font-size-sm)" }}>
              Nobody has asked to download your work yet. When they do, it appears here and you get
              an email.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {incoming.map((row) => (
                <div
                  key={row.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "var(--space-3)",
                    flexWrap: "wrap",
                    padding: "var(--space-3) var(--space-4)",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <p style={{ fontWeight: 600, fontSize: "var(--font-size-sm)", marginBottom: 2 }}>
                      {describeTarget(row)}
                    </p>
                    <p className="text-muted" style={{ fontSize: "var(--font-size-xs)", marginBottom: row.message ? 6 : 0 }}>
                      {row.requesterHandle ? (
                        <Link to={`/u/${row.requesterHandle}`}>{row.requesterName}</Link>
                      ) : (
                        row.requesterName
                      )}
                      {/* A showreel has no single size worth quoting, and its contents change as
                          the owner curates — so the row shows when it was asked and nothing else. */}
                      {row.kind === "Media" && <>{" · "}{formatBytes(row.fileSize)}</>}
                      {" · "}{formatWhen(row.createdAt)}
                    </p>
                    {row.kind === "Showreel" && (
                      <p className="text-muted" style={{ fontSize: "var(--font-size-xs)", marginBottom: row.message ? 6 : 0 }}>
                        Approving lets them download everything in your showreel, as it stands at
                        the moment they download it.
                      </p>
                    )}
                    {row.message && (
                      <p style={{ fontSize: "var(--font-size-xs)", marginBottom: 0, fontStyle: "italic" }}>
                        “{row.message}”
                      </p>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                    <StatusPill status={row.status} />
                    {/* Approve stays available on a denied row, and Decline on an approved one:
                        revoking access is the same decision going the other way. */}
                    {row.status !== "Approved" && (
                      <button
                        className="btn-primary"
                        style={{ fontSize: "var(--font-size-xs)", padding: "var(--space-1) var(--space-4)" }}
                        onClick={() => decide(row, true)}
                        disabled={busyId === row.id}
                        title="Let this person download the original"
                      >
                        Approve
                      </button>
                    )}
                    {row.status !== "Denied" && (
                      <button
                        className="btn-secondary"
                        style={{ fontSize: "var(--font-size-xs)", padding: "var(--space-1) var(--space-4)" }}
                        onClick={() => decide(row, false)}
                        disabled={busyId === row.id}
                        title={row.status === "Approved" ? "Take this access back" : "Decline this request"}
                      >
                        {row.status === "Approved" ? "Revoke" : "Decline"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Yours ── */}
        <div className="card-body" style={{ paddingTop: 0 }}>
          <h2 style={{ fontSize: "var(--font-size-lg)", marginBottom: "var(--space-3)" }}>Your requests</h2>

          {outgoing.length === 0 ? (
            <p className="text-muted" style={{ fontSize: "var(--font-size-sm)", marginBottom: 0 }}>
              You haven't asked for any originals. On a file whose owner offers downloads by request,
              use “Ask for the original”.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {outgoing.map((row) => (
                <div
                  key={row.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-3)",
                    flexWrap: "wrap",
                    padding: "var(--space-3) var(--space-4)",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <p style={{ fontWeight: 600, fontSize: "var(--font-size-sm)", marginBottom: 2 }}>
                      {describeTarget(row)}
                    </p>
                    <p className="text-muted" style={{ fontSize: "var(--font-size-xs)", marginBottom: 0 }}>
                      {row.ownerHandle ? (
                        <Link to={`/u/${row.ownerHandle}`}>{row.ownerName}</Link>
                      ) : (
                        row.ownerName
                      )}
                      {" · asked "}{formatWhen(row.createdAt)}
                      {row.decidedAt && ` · answered ${formatWhen(row.decidedAt)}`}
                    </p>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <StatusPill status={row.status} />
                    {row.status === "Approved" && (
                      <button
                        className="btn-primary"
                        style={{ fontSize: "var(--font-size-xs)", padding: "var(--space-1) var(--space-4)" }}
                        onClick={() => (row.kind === "Showreel"
                          ? downloadShowreel(row)
                          : row.mediaId && download(row.mediaId))}
                        disabled={downloadingId === keyOf(row)}
                      >
                        {downloadingId === keyOf(row)
                          ? (row.kind === "Showreel" ? "Preparing…" : "Starting…")
                          : (row.kind === "Showreel" ? "Download .zip" : "Download")}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
