import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../Auth/useAuth";
import { API_BASE_URL } from "../config";
import "../App.css";

/**
 * Account & privacy self-service: change password, download my data (GDPR export),
 * and permanently delete the account. Talks to /api/account/*.
 */
export function SettingsPage() {
  const { authFetch, logout } = useAuth();
  const navigate = useNavigate();

  // Change password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Export
  const [exporting, setExporting] = useState(false);

  // Delete
  const [deleteText, setDeleteText] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);

    if (newPassword !== confirmPassword) {
      setPwMsg({ kind: "err", text: "New passwords don't match." });
      return;
    }

    setPwBusy(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/account/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setPwMsg({ kind: "err", text: data?.message || "Could not change password." });
        return;
      }
      setPwMsg({ kind: "ok", text: data?.message || "Password updated." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setPwMsg({ kind: "err", text: "Network error." });
    } finally {
      setPwBusy(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/account/export`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "vimeocopy-my-data.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("Could not export your data. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    setDeleteErr(null);
    setDeleteBusy(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/account`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setDeleteErr(data?.message || "Could not delete account.");
        return;
      }
      await logout();
      navigate("/", { replace: true });
    } catch {
      setDeleteErr("Network error.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 720 }}>
      <h1 style={{ marginBottom: "var(--space-6)" }}>Account settings</h1>

      {/* ── Change password ── */}
      <div className="card" style={{ marginBottom: "var(--space-6)" }}>
        <div className="card-header">
          <h2 style={{ margin: 0, fontSize: "var(--font-size-lg)" }}>Change password</h2>
        </div>
        <div className="card-body">
          <form onSubmit={handleChangePassword}>
            <div className="form-group">
              <label>Current password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="form-group">
              <label>New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div className="form-group">
              <label>Confirm new password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>

            {pwMsg && (
              <div className={`alert ${pwMsg.kind === "ok" ? "alert-success" : "alert-error"}`} style={{ marginBottom: "var(--space-3)" }}>
                {pwMsg.text}
              </div>
            )}

            <button type="submit" className="btn-primary" disabled={pwBusy}>
              {pwBusy ? "Saving…" : "Update password"}
            </button>
          </form>
        </div>
      </div>

      {/* ── Export data ── */}
      <div className="card" style={{ marginBottom: "var(--space-6)" }}>
        <div className="card-header">
          <h2 style={{ margin: 0, fontSize: "var(--font-size-lg)" }}>Your data</h2>
        </div>
        <div className="card-body">
          <p className="text-muted" style={{ marginTop: 0 }}>
            Download a copy of your account data as a JSON file (GDPR data portability).
          </p>
          <button type="button" className="btn-outline" onClick={handleExport} disabled={exporting}>
            {exporting ? "Preparing…" : "Download my data"}
          </button>
        </div>
      </div>

      {/* ── Danger zone ── */}
      <div className="card" style={{ border: "1px solid var(--danger, #e5484d)" }}>
        <div className="card-header">
          <h2 style={{ margin: 0, fontSize: "var(--font-size-lg)", color: "var(--danger, #e5484d)" }}>
            Delete account
          </h2>
        </div>
        <div className="card-body">
          <p className="text-muted" style={{ marginTop: 0 }}>
            This permanently deletes your account, all your uploaded media, projects and your public
            profile. <strong>This cannot be undone.</strong> Type <code>DELETE</code> to confirm.
          </p>
          <div className="form-group">
            <input
              type="text"
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              placeholder="Type DELETE"
              autoComplete="off"
            />
          </div>

          {deleteErr && (
            <div className="alert alert-error" style={{ marginBottom: "var(--space-3)" }}>
              {deleteErr}
            </div>
          )}

          <button
            type="button"
            className="btn-danger"
            onClick={handleDelete}
            disabled={deleteBusy || deleteText !== "DELETE"}
          >
            {deleteBusy ? "Deleting…" : "Permanently delete my account"}
          </button>
        </div>
      </div>
    </div>
  );
}
