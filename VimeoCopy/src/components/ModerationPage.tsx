import { useEffect, useState, useCallback } from "react";
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
}

type ResolveAction = "remove" | "delete" | "dismiss";

export function ModerationPage() {
  const { authFetch, roles } = useAuth();
  // Hiding is reversible and any moderator may do it. Deleting destroys somebody's file and every
  // other report against it, so it is administrators only — enforced server-side too; this just
  // keeps a button off the screen that would only ever come back 403.
  const isAdmin = roles.includes("Admin");
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  /** Which report is collecting a reason, and for which outcome. */
  const [prompt, setPrompt] = useState<{ id: number; action: "remove" | "delete" } | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/reports`);
      if (res.ok) setReports(await res.json());
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { load(); }, [load]);

  async function resolve(id: number, action: ResolveAction, why?: string) {
    const res = await authFetch(`${API_BASE_URL}/api/reports/${id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason: why }),
    });
    if (res.ok) {
      // Both outcomes that touch the file also email its owner, so the toast says so — otherwise
      // a moderator has no way to know a message went out in their name.
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
                </div>
                <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start" }}>
                  <button className="btn-danger" onClick={() => { setPrompt({ id: r.id, action: "remove" }); setReason(""); }}>
                    Hide media
                  </button>
                  {isAdmin && (
                    <button className="btn-danger" onClick={() => { setPrompt({ id: r.id, action: "delete" }); setReason(""); }}>
                      Delete
                    </button>
                  )}
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
    </div>
  );
}
