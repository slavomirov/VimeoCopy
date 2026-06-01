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

export function ModerationPage() {
  const { authFetch } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

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

  async function resolve(id: number, action: "remove" | "dismiss") {
    const res = await authFetch(`${API_BASE_URL}/api/reports/${id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      toast.success(action === "remove" ? "Media hidden" : "Report dismissed");
      setReports((prev) => prev.filter((r) => r.id !== id));
    }
  }

  if (loading) return <div className="loading" style={{ margin: "var(--space-16) auto" }} />;

  return (
    <div className="container">
      <h1>Moderation</h1>
      <p className="text-muted">Pending reports. “Hide” makes the media private; “Dismiss” closes the report.</p>

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
                  <button className="btn-danger" onClick={() => resolve(r.id, "remove")}>Hide media</button>
                  <button className="btn-secondary" onClick={() => resolve(r.id, "dismiss")}>Dismiss</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
