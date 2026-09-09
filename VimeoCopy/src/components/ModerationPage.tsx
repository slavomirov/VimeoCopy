import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../Auth/useAuth";
import { API_BASE_URL } from "../config";
import "../App.css";

interface Report {
  id: number;
  mediaId: string;
  fileName: string | null;
  reason: string;
  details: string | null;
  status: string;
  createdAt: string;
  mediaIsPublic: boolean;
  ownerEmail: string | null;
  /** Null when filed anonymously — reporting deliberately doesn't require an account. */
  reporterName: string | null;
  reporterHandle: string | null;
  reporterEmail: string | null;
  reporterTotalReports: number;
}

interface RepublishRequest {
  id: number;
  mediaId: string;
  fileName: string | null;
  fileSize: number;
  thumbnailUrl: string | null;
  ownerName: string;
  ownerHandle: string | null;
  ownerEmail: string | null;
  staffHiddenReason: string | null;
  pendingReports: number;
  reason: string;
  status: string;
  createdAt: string;
}

type ResolveAction = "remove" | "delete" | "dismiss";

export function ModerationPage() {
  const { authFetch } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [appeals, setAppeals] = useState<RepublishRequest[]>([]);
  const [loading, setLoading] = useState(true);
  /** Which report is collecting a reason, and for which outcome. */
  const [prompt, setPrompt] = useState<{ id: number; action: "remove" | "delete" } | null>(null);
  const [reason, setReason] = useState("");
  /** Which appeal is collecting a note, and whether the answer is yes. */
  const [appealPrompt, setAppealPrompt] = useState<{ id: number; approve: boolean } | null>(null);
  const [appealNote, setAppealNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Both inboxes in one pass — this page is the whole of content moderation now, and two
      // sequential round trips to render one screen is one too many.
      const [reportRes, appealRes] = await Promise.all([
        authFetch(`${API_BASE_URL}/api/reports`),
        authFetch(`${API_BASE_URL}/api/republish-requests`),
      ]);
      if (reportRes.ok) setReports(await reportRes.json());
      if (appealRes.ok) setAppeals(await appealRes.json());
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  async function decideAppeal(id: number, approve: boolean, note?: string) {
    const res = await authFetch(`${API_BASE_URL}/api/republish-requests/${id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve, note }),
    });
    if (res.ok) {
      toast.success(approve
        ? "Re-published — the owner has been emailed"
        : "Appeal refused — the owner has been emailed");
      setAppeals((prev) => prev.filter((a) => a.id !== id));
    }
  }

  function submitAppealPrompt() {
    if (!appealPrompt) return;
    const { id, approve } = appealPrompt;
    const note = appealNote.trim() || undefined;
    setAppealPrompt(null);
    setAppealNote("");
    decideAppeal(id, approve, note);
  }

  useEffect(() => { load(); }, [load]);

  async function resolve(id: number, action: ResolveAction, why?: string) {
    const res = await authFetch(`${API_BASE_URL}/api/reports/${id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason: why }),
    });
    if (res.ok) {
      // Both outcomes that touch the file also email its owner, so the toast says so — otherwise
      // staff have no way to know a message went out in their name.
      toast.success(
        action === "remove" ? "Media hidden — the owner has been emailed"
          : action === "delete" ? "Media deleted — the owner has been emailed"
            : "Report dismissed",
      );
      setReports((prev) => prev.filter((r) => r.id !== id));
    }
  }

  function submitPrompt() {
    if (!prompt) return;
    const { id, action } = prompt;
    const why = reason.trim() || undefined;
    setPrompt(null);
    setReason("");
    resolve(id, action, why);
  }

  if (loading) return <div className="loading" style={{ margin: "var(--space-16) auto" }} />;

  return (
    <div className="container">
      <h1>Moderation</h1>
      <p className="text-muted">
        Pending reports. “Hide” makes the media private, “Delete” removes it for good, “Dismiss” closes
        the report and leaves the file alone. Hiding and deleting both email the owner your reason.
      </p>

      {reports.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "var(--space-12)", marginTop: "var(--space-6)" }}>
          <p className="text-muted">No pending reports. 🎉</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: "var(--space-6)" }}>
          {reports.map((r) => (
            <div key={r.id} className="card" style={{ padding: "var(--space-4)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ padding: "2px 8px", borderRadius: "var(--radius-sm)", background: "rgba(var(--danger-rgb),0.15)", color: "var(--danger)", fontWeight: 600, fontSize: "var(--font-size-xs)", textTransform: "uppercase" }}>{r.reason}</span>
                    <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.fileName || "Untitled"}</strong>
                    {!r.mediaIsPublic && <span style={{ fontSize: "var(--font-size-xs)", color: "var(--gray-500)" }}>(already private)</span>}
                  </div>
                  {r.details && <p style={{ fontSize: "var(--font-size-sm)", color: "var(--gray-600)", margin: "4px 0" }}>{r.details}</p>}
                  <p style={{ fontSize: "var(--font-size-xs)", color: "var(--gray-500)", margin: 0 }}>
                    Owner: {r.ownerEmail ?? "—"} · {new Date(r.createdAt).toLocaleString()}
                  </p>
                  {/* Who filed it. Anonymous is a real and common answer — reporting deliberately
                      needs no account — so it is stated rather than left as a blank space. The
                      running total is what separates one bad experience from a serial filer. */}
                  <p style={{ fontSize: "var(--font-size-xs)", color: "var(--gray-500)", margin: "2px 0 0" }}>
                    Reported by:{" "}
                    {r.reporterEmail || r.reporterName ? (
                      <>
                        {r.reporterHandle ? (
                          <Link to={`/u/${r.reporterHandle}`}>{r.reporterName ?? r.reporterHandle}</Link>
                        ) : (
                          <strong>{r.reporterName ?? "a signed-in user"}</strong>
                        )}
                        {r.reporterEmail && ` · ${r.reporterEmail}`}
                        {r.reporterTotalReports > 1 && ` · ${r.reporterTotalReports} reports filed`}
                      </>
                    ) : (
                      <em>anonymous</em>
                    )}
                  </p>
                </div>
                <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start" }}>
                  <button className="btn-danger" onClick={() => { setPrompt({ id: r.id, action: "remove" }); setReason(""); }}>
                    Hide media
                  </button>
                  <button className="btn-danger" onClick={() => { setPrompt({ id: r.id, action: "delete" }); setReason(""); }}>
                    Delete
                  </button>
                  <button className="btn-secondary" onClick={() => resolve(r.id, "dismiss")}>Dismiss</button>
                </div>
              </div>

              {/* The reason prompt is also the confirmation step: hiding and deleting both mail the
                  owner, and neither should be one stray click away. */}
              {prompt?.id === r.id && (
                <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap", marginTop: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "1px dashed var(--border-color)" }}>
                  <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--danger)" }}>
                    {prompt.action === "delete" ? "Delete permanently" : "Make private"}
                  </span>
                  <input
                    type="text" value={reason} autoFocus
                    placeholder={`Reason — emailed to ${r.ownerEmail ?? "the owner"}`}
                    onChange={(e) => setReason(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitPrompt();
                      if (e.key === "Escape") { setPrompt(null); setReason(""); }
                    }}
                    style={{ flex: "1 1 260px", minWidth: 180 }}
                  />
                  <button className="btn-danger" onClick={submitPrompt}>
                    {prompt.action === "delete" ? "Delete and notify" : "Hide and notify"}
                  </button>
                  <button className="btn-secondary" onClick={() => { setPrompt(null); setReason(""); }}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Appeals ──
          The other half of moderation. A takedown is a decision made without the owner in the
          room; this is where they get to answer it, so it sits on the same page as the takedowns
          rather than somewhere staff have to remember to visit. */}
      <h2 style={{ marginTop: "var(--space-10)" }}>
        Re-publish requests
        {appeals.length > 0 && <span style={{ color: "var(--primary)" }}> · {appeals.length} waiting</span>}
      </h2>
      <p className="text-muted" style={{ marginTop: 0 }}>
        Owners asking for a file we took down to go back up. Approving re-publishes it and hands
        control of its visibility back to them.
      </p>

      {appeals.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "var(--space-12)", marginTop: "var(--space-4)" }}>
          <p className="text-muted">No appeals waiting.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
          {appeals.map((a) => (
            <div key={a.id} className="card" style={{ padding: "var(--space-4)" }}>
              <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
                <div style={{ width: 72, height: 48, borderRadius: "var(--radius-sm)", overflow: "hidden", background: "var(--bg-elevated)", flexShrink: 0 }}>
                  {a.thumbnailUrl && <img src={a.thumbnailUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                </div>

                <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                    <strong>{a.fileName || "Untitled"}</strong>
                    {a.pendingReports > 0 && (
                      <span style={{ padding: "2px 8px", borderRadius: "var(--radius-sm)", background: "rgba(var(--danger-rgb),0.15)", color: "var(--danger)", fontWeight: 600, fontSize: "var(--font-size-xs)", textTransform: "uppercase" }}>
                        {a.pendingReports} open report{a.pendingReports === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: "var(--font-size-xs)", color: "var(--gray-500)", margin: "2px 0 0" }}>
                    {a.ownerHandle ? <Link to={`/u/${a.ownerHandle}`}>{a.ownerName}</Link> : a.ownerName}
                    {a.ownerEmail && ` · ${a.ownerEmail}`}
                    {" · asked "}{new Date(a.createdAt).toLocaleString()}
                  </p>

                  {/* Both sides of the argument, together. Deciding an appeal without the original
                      takedown reason in front of you is deciding it from memory. */}
                  {a.staffHiddenReason && (
                    <p style={{ fontSize: "var(--font-size-sm)", color: "var(--gray-600)", margin: "8px 0 0" }}>
                      <strong>We said:</strong> {a.staffHiddenReason}
                    </p>
                  )}
                  <p style={{ fontSize: "var(--font-size-sm)", margin: "4px 0 0", fontStyle: "italic" }}>
                    <strong style={{ fontStyle: "normal" }}>They say:</strong> “{a.reason}”
                  </p>
                </div>

                <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start" }}>
                  <button className="btn-primary" onClick={() => { setAppealPrompt({ id: a.id, approve: true }); setAppealNote(""); }}>
                    Re-publish
                  </button>
                  <button className="btn-secondary" onClick={() => { setAppealPrompt({ id: a.id, approve: false }); setAppealNote(""); }}>
                    Keep it down
                  </button>
                </div>
              </div>

              {appealPrompt?.id === a.id && (
                <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap", marginTop: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "1px dashed var(--border-color)" }}>
                  <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 600 }}>
                    {appealPrompt.approve ? "Re-publish" : "Keep it down"}
                  </span>
                  <input
                    type="text" value={appealNote} autoFocus
                    placeholder={appealPrompt.approve
                      ? "Optional note — emailed to the owner"
                      : `Why — emailed to ${a.ownerEmail ?? "the owner"}`}
                    onChange={(e) => setAppealNote(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitAppealPrompt();
                      if (e.key === "Escape") { setAppealPrompt(null); setAppealNote(""); }
                    }}
                    style={{ flex: "1 1 260px", minWidth: 180 }}
                  />
                  <button className={appealPrompt.approve ? "btn-primary" : "btn-danger"} onClick={submitAppealPrompt}>
                    {appealPrompt.approve ? "Re-publish and notify" : "Refuse and notify"}
                  </button>
                  <button className="btn-secondary" onClick={() => { setAppealPrompt(null); setAppealNote(""); }}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
