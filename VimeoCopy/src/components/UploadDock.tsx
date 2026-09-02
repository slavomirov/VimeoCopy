import { useState } from "react";
import { Link } from "react-router-dom";
import { useUpload } from "./UploadProvider";
import { WakeLoader, ProwMark } from "../brand/FerryMarks";

/**
 * The Dock — persistent upload widget. Mounted in the app shell so it stays visible
 * while the user navigates, and it survives route changes.
 *
 * The name was already nautical before the rebrand; now it behaves like one. Work is
 * "loaded aboard", each file rides its own crossing, and a finished upload has "sailed".
 */
export function UploadDock() {
  const { files, uploading, doneCount, errorCount, queuedCount, clearCompleted } = useUpload();
  const [collapsed, setCollapsed] = useState(false);

  if (files.length === 0) return null;

  const active = files.filter((f) => f.status === "uploading" || f.status === "completing").length;
  const overall = Math.round(files.reduce((sum, f) => sum + f.progress, 0) / files.length);

  return (
    <div
      style={{
        position: "fixed",
        bottom: "var(--space-4)",
        right: "var(--space-4)",
        zIndex: 1000,
        width: collapsed ? 260 : 340,
        maxWidth: "calc(100vw - 2rem)",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-color)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-xl)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        onClick={() => setCollapsed((c) => !c)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          padding: "var(--space-3) var(--space-4)",
          cursor: "pointer",
          borderBottom: collapsed ? "none" : "1px solid var(--border-color)",
        }}
      >
        {uploading ? (
          <WakeLoader size={18} label="Loading aboard" />
        ) : (
          <ProwMark size={18} minimal />
        )}
        <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)", flex: 1, color: "var(--gray-900)" }}>
          {uploading ? `Loading ${active || queuedCount} aboard…` : "The Dock"}
          {!uploading && doneCount > 0 && (
            <span style={{ color: "var(--success)" }}> · {doneCount} aboard</span>
          )}
          {errorCount > 0 && <span style={{ color: "var(--danger)" }}> · {errorCount} missed the crossing</span>}
        </span>
        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--gray-500)" }}>{overall}%</span>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" strokeWidth="2"
          style={{ transform: collapsed ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {!collapsed && (
        <div style={{ maxHeight: 240, overflowY: "auto", padding: "var(--space-2) var(--space-3)" }}>
          {files.map((f) => (
            <div key={f.id} style={{ padding: "var(--space-2) 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)", marginBottom: 4 }}>
                <span style={{
                  fontSize: "var(--font-size-xs)", color: "var(--gray-700)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {f.file.name}
                </span>
                <span style={{
                  fontSize: "var(--font-size-xs)", flexShrink: 0,
                  color: f.status === "error" ? "var(--danger)" : f.status === "done" ? "var(--success)" : "var(--gray-500)",
                }}>
                  {f.status === "error" ? "Missed it" : f.status === "done" ? "Aboard" : `${f.progress}%`}
                </span>
              </div>
              <div style={{ height: 4, background: "var(--bg-deep)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${f.progress}%`,
                  background: f.status === "error"
                    ? "var(--danger)"
                    : "linear-gradient(90deg, var(--primary), var(--secondary))",
                  transition: "width 0.3s ease",
                }} />
              </div>
            </div>
          ))}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "var(--space-2)" }}>
            <Link to="/upload" style={{ fontSize: "var(--font-size-xs)", color: "var(--primary)", textDecoration: "none" }}>
              Open the loading dock
            </Link>
            {doneCount > 0 && (
              <button
                onClick={clearCompleted}
                className="btn-secondary"
                style={{ fontSize: "var(--font-size-xs)", padding: "2px 10px" }}
              >
                Clear finished
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
