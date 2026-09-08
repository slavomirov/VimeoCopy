import { useState } from "react";
import { Link } from "react-router-dom";
import { useUpload } from "./UploadProvider";
import { WakeLoader, ProwMark, FerryBoat } from "../brand/FerryMarks";
import type { FileEntry } from "../hooks/useFileUploader";

/**
 * Four crests over the lane's width, so translating the wave by exactly one crest loops seamlessly.
 * Same construction as the backdrop swell, at dock scale.
 */
const LANE_SWELL =
  "M0,13 c15,-7 45,7 60,0 c15,-7 45,7 60,0 c15,-7 45,7 60,0 c15,-7 45,7 60,0 V26 H0 Z";

/**
 * One file's crossing, as water rather than a bar.
 *
 * A progress bar says "68%" and nothing else; this says the same thing in the app's own language —
 * the boat is 68% of the way across, the water behind it is the distance already covered, and the
 * boat keeps bobbing while the transfer is alive. `left` is transitioned rather than animated, so
 * every progress event glides the boat along instead of teleporting it.
 */
function DockLane({ entry }: { entry: FileEntry }) {
  const done = entry.status === "done";
  const failed = entry.status === "error";
  // A finished file has made port, whatever the last progress event said.
  const pct = done ? 100 : Math.max(0, Math.min(100, entry.progress));

  return (
    <div
      className="dock-lane"
      data-state={failed ? "error" : done ? "done" : entry.status}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${entry.file.name} upload progress`}
    >
      <svg className="dock-swell dock-swell-back" viewBox="0 0 240 26" preserveAspectRatio="none" aria-hidden="true">
        <path d={LANE_SWELL} />
      </svg>
      <svg className="dock-swell dock-swell-front" viewBox="0 0 240 26" preserveAspectRatio="none" aria-hidden="true">
        <path d={LANE_SWELL} />
      </svg>
      {/* Water already crossed. */}
      <span className="dock-wake" style={{ width: `${pct}%` }} aria-hidden="true" />
      <span
        className="dock-boat"
        // Inset by half a boat at each end so it is never clipped by the lane — see .dock-boat.
        style={{ left: `calc(var(--dock-boat) / 2 + (100% - var(--dock-boat)) * ${pct / 100})` }}
        aria-hidden="true"
      >
        <FerryBoat size={22} />
      </span>
    </div>
  );
}

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
              <DockLane entry={f} />
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
