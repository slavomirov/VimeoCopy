import { useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { useAuth } from "../Auth/useAuth";
import { API_BASE_URL } from "../config";

const REASONS = [
  { value: "copyright", label: "Copyright infringement" },
  { value: "explicit", label: "Explicit / adult content" },
  { value: "violence", label: "Violence or hate" },
  { value: "spam", label: "Spam or misleading" },
  { value: "other", label: "Other" },
];

/** Small "Report" control + modal. Works for anonymous visitors too. */
export function ReportButton({ mediaId, className, style }: { mediaId: string; className?: string; style?: React.CSSProperties }) {
  const { accessToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("copyright");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/reports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ mediaId, reason, details }),
      });
      if (!res.ok) throw new Error();
      toast.success("Thanks — our moderators will review this.");
      setOpen(false);
      setDetails("");
    } catch {
      toast.error("Couldn’t submit report.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        style={{ background: "none", border: "none", color: "var(--gray-400)", cursor: "pointer", fontSize: "var(--font-size-xs)", padding: 4, ...style }}
        title="Report this media"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: "middle" }}>
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
        </svg>
      </button>

      {open && createPortal(
        <div
          style={{ position: "fixed", inset: 0, background: "var(--overlay-medium)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000, padding: "var(--space-4)" }}
          onClick={(e) => { e.stopPropagation(); setOpen(false); }}
        >
          <div className="card" style={{ maxWidth: 440, width: "100%" }} onClick={(e) => e.stopPropagation()}>
            <div className="card-header"><h2 className="card-title" style={{ marginBottom: 0 }}>Report media</h2></div>
            <div className="card-body">
              <label style={{ display: "block", fontSize: "var(--font-size-sm)", fontWeight: 600, marginBottom: "var(--space-2)" }}>Reason</label>
              <select value={reason} onChange={(e) => setReason(e.target.value)}
                style={{ width: "100%", padding: "var(--space-3)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", background: "var(--bg-input)", color: "var(--text-on-surface)", marginBottom: "var(--space-4)" }}>
                {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <label style={{ display: "block", fontSize: "var(--font-size-sm)", fontWeight: 600, marginBottom: "var(--space-2)" }}>Details (optional)</label>
              <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={1000}
                placeholder="Anything that helps us review…"
                style={{ width: "100%", padding: "var(--space-3)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", background: "var(--bg-input)", color: "var(--text-on-surface)", resize: "vertical" }} />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", marginTop: "var(--space-4)" }}>
                <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
                <button className="btn-danger" onClick={submit} disabled={submitting}>{submitting ? "Submitting…" : "Submit report"}</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
