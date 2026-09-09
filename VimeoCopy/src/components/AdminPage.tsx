/**
 * Admin — the operator's view of the platform.
 *
 * Five tabs, because the jobs are genuinely separate and mixing them makes each one harder:
 * Overview (is anything wrong?), Users (fix it for one person), Media (take something down),
 * Plans (change what a tier is), Audit (what did we do last week?).
 *
 * Every mutation here happens to somebody who is not in the room. Two things follow from that and
 * shape the whole page: nothing destructive fires on a single click, and every action the server
 * records is one the operator can see recorded, on the Audit tab, in the same session.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../Auth/useAuth";
import { API_BASE_URL } from "../config";
import "../App.css";

/* ── Types (mirror the Admin*DTO shapes) ───────────────────── */

interface Overview {
  totalUsers: number;
  suspendedUsers: number;
  newUsers7d: number;
  newUsers30d: number;
  totalMedia: number;
  privateMedia: number;
  storedBytes: number;
  bandwidthUsedBytes: number;
  pendingReports: number;
  pendingDownloadRequests: number;
  planUsage: { planName: string; userCount: number }[];
}

interface AdminUser {
  id: string;
  email: string | null;
  userName: string | null;
  handle: string | null;
  displayName: string | null;
  createdAt: string;
  planName: string | null;
  planExpiration: string | null;
  usedMemory: number;
  buyedMemory: number | null;
  bonusMemory: number;
  usedBandwidth: number;
  buyedBandwidth: number | null;
  bonusBandwidth: number;
  bandwidthCycleStart: string | null;
  mediaCount: number;
  isProfilePublic: boolean;
  isSuspended: boolean;
  suspensionReason: string | null;
  roles: string[];
}

interface AdminMedia {
  id: string;
  fileName: string | null;
  contentType: string;
  fileSize: number;
  uploadedAt: string;
  status: string;
  isPublic: boolean;
  showOnMediaPage: boolean;
  downloadable: boolean;
  isProfileAsset: boolean;
  ownerId: string;
  ownerEmail: string | null;
  ownerHandle: string | null;
  thumbnailUrl: string | null;
  pendingReports: number;
}

interface AdminPlan {
  id: number;
  name: string;
  description: string | null;
  storageLimitMB: number;
  bandwidthMB: number;
  price: number;
  allowDownloads: boolean;
  userCount: number;
}

interface AuditEntry {
  id: number;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string;
  targetLabel: string | null;
  detail: string | null;
  createdAt: string;
}

interface Paged<T> { items: T[]; total: number; skip: number; take: number }

type Tab = "overview" | "users" | "media" | "plans" | "audit";

/* ── Formatting ────────────────────────────────────────────── */

function formatBytes(value: number | null | undefined) {
  if (value == null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = Math.abs(value);
  let i = 0;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${value < 0 ? "-" : ""}${size.toFixed(size >= 100 || Number.isInteger(size) ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/** Cents to dollars — Plan.Price is stored in cents, like Stripe wants it. */
function formatPrice(cents: number) {
  return cents === 0 ? "Free" : `$${(cents / 100).toFixed(2)}`;
}

const UNITS: Record<string, number> = { MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };

/* ── Shared bits ───────────────────────────────────────────── */

function Pill({ children, tone = "var(--gray-500)" }: { children: React.ReactNode; tone?: string }) {
  return (
    <span style={{
      fontSize: "var(--font-size-xs)", fontWeight: 700, textTransform: "uppercase",
      letterSpacing: "0.06em", color: tone, border: `1px solid ${tone}`,
      borderRadius: "var(--radius-full)", padding: "1px 8px", whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="card" style={{ padding: "var(--space-4)" }}>
      <div style={{ fontSize: "var(--font-size-xs)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--gray-500)" }}>
        {label}
      </div>
      <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 800, marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--gray-500)", marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

/**
 * A destructive button that will not fire on one click.
 *
 * The confirmation is the button itself rather than a modal: an operator deleting the wrong row
 * usually knows the instant they see what they clicked, and a second click on a button that has
 * visibly changed is enough to catch that. It disarms after five seconds so a stale armed button
 * can't be triggered by a click meant for something else.
 */
function ConfirmButton({
  onConfirm, children, confirmLabel = "Click again to confirm", disabled, className = "btn-danger",
}: {
  onConfirm: () => void;
  children: React.ReactNode;
  confirmLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      type="button"
      className={armed ? "btn-danger" : className}
      disabled={disabled}
      onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}

/* ── Overview ──────────────────────────────────────────────── */

function OverviewTab({ api }: { api: Api }) {
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => { api.get<Overview>("overview").then(setData).catch(() => {}); }, [api]);

  if (!data) return <div className="loading" style={{ margin: "var(--space-12) auto" }} />;

  const attention = data.pendingReports + data.pendingDownloadRequests;

  return (
    <>
      {attention > 0 && (
        <div className="card" style={{ padding: "var(--space-4)", marginBottom: "var(--space-4)", borderColor: "var(--primary)" }}>
          <strong>{attention} item{attention === 1 ? "" : "s"} waiting.</strong>{" "}
          <span className="text-muted">
            {data.pendingReports} report{data.pendingReports === 1 ? "" : "s"} on the Moderation page,{" "}
            {data.pendingDownloadRequests} download request{data.pendingDownloadRequests === 1 ? "" : "s"} with their owners.
          </span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--space-3)" }}>
        <Stat label="Accounts" value={data.totalUsers} hint={`${data.newUsers7d} in the last 7 days · ${data.newUsers30d} in 30`} />
        <Stat label="Suspended" value={data.suspendedUsers} hint={data.suspendedUsers === 0 ? "nobody blocked" : "sign-in blocked"} />
        <Stat label="Files" value={data.totalMedia} hint={`${data.privateMedia} private`} />
        <Stat label="Stored" value={formatBytes(data.storedBytes)} hint="summed from the files themselves" />
        <Stat label="Bandwidth this cycle" value={formatBytes(data.bandwidthUsedBytes)} hint="across all accounts" />
        <Stat label="Open reports" value={data.pendingReports} hint="handled on the Moderation page" />
      </div>

      <h2 style={{ marginTop: "var(--space-8)" }}>Accounts per plan</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
        {data.planUsage.map((p) => (
          <div key={p.planName} className="card" style={{ padding: "var(--space-3) var(--space-5)" }}>
            <div style={{ fontWeight: 700 }}>{p.planName}</div>
            <div style={{ fontSize: "var(--font-size-xl)", fontWeight: 800 }}>{p.userCount}</div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ── Users ─────────────────────────────────────────────────── */

/**
 * A signed grant of storage or bandwidth.
 *
 * Amount plus unit plus direction, rather than a byte count typed by hand: the whole reason to
 * have this control is that "give them 50 GB" should not require anybody to multiply by 1024
 * three times and get it right under pressure.
 */
function GrantControl({
  label, onGrant, busy,
}: { label: string; onGrant: (bytes: number, reason: string) => void; busy: boolean }) {
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("GB");
  const [reason, setReason] = useState("");
  const [take, setTake] = useState(false);

  const bytes = useMemo(() => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * UNITS[unit]) * (take ? -1 : 1);
  }, [amount, unit, take]);

  return (
    <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ minWidth: 90, fontSize: "var(--font-size-sm)", fontWeight: 600 }}>{label}</span>
      <input
        type="number" min="0" step="any" value={amount} placeholder="0"
        onChange={(e) => setAmount(e.target.value)}
        style={{ width: 90 }}
      />
      <select value={unit} onChange={(e) => setUnit(e.target.value)} style={{ width: 76 }}>
        {Object.keys(UNITS).map((u) => <option key={u} value={u}>{u}</option>)}
      </select>
      <input
        type="text" value={reason} placeholder="reason (goes in the audit log)"
        onChange={(e) => setReason(e.target.value)}
        style={{ flex: "1 1 200px", minWidth: 140 }}
      />
      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--font-size-xs)", whiteSpace: "nowrap" }}>
        <input type="checkbox" checked={take} onChange={(e) => setTake(e.target.checked)} />
        take back
      </label>
      <button
        type="button"
        className={take ? "btn-secondary" : "btn-primary"}
        disabled={busy || bytes === 0}
        onClick={() => { onGrant(bytes, reason); setAmount(""); setReason(""); }}
      >
        {take ? "Remove" : "Grant"}
      </button>
    </div>
  );
}

function UserCard({ user, api, onChange, currentUserId }: {
  user: AdminUser;
  api: Api;
  onChange: (u: AdminUser | null) => void;
  currentUserId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [planName, setPlanName] = useState(user.planName ?? "Free");
  const [months, setMonths] = useState(1);
  const [planReason, setPlanReason] = useState("");
  const [suspendReason, setSuspendReason] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const isSelf = user.id === currentUserId;

  /**
   * Runs one action and folds the server's answer back into the row.
   *
   * The failure is swallowed on purpose: the api layer has already shown the server's message,
   * which is the one worth reading ("this is the only administrator"), and letting it escape a
   * click handler only produces an unhandled rejection nobody sees. What matters is that a refused
   * change leaves the row untouched rather than showing an edit the server never accepted.
   */
  const run = useCallback(async (fn: () => Promise<AdminUser | null>, message: string) => {
    setBusy(true);
    try {
      const updated = await fn();
      if (updated !== undefined) { onChange(updated); toast.success(message); }
    } catch {
      /* already reported by the api wrapper */
    } finally {
      setBusy(false);
    }
  }, [onChange]);

  const storagePct = user.buyedMemory ? Math.min(100, (user.usedMemory / user.buyedMemory) * 100) : 0;
  const bandwidthPct = user.buyedBandwidth ? Math.min(100, (user.usedBandwidth / user.buyedBandwidth) * 100) : 0;

  return (
    <div className="card" style={{ padding: "var(--space-4)", borderColor: user.isSuspended ? "var(--danger)" : undefined }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o); } }}
        style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap", cursor: "pointer" }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
            <strong>{user.email ?? user.userName ?? user.id}</strong>
            {isSelf && <Pill tone="var(--primary)">you</Pill>}
            {user.isSuspended && <Pill tone="var(--danger)">suspended</Pill>}
            {user.roles.filter((r) => r !== "User").map((r) => <Pill key={r} tone="var(--secondary)">{r}</Pill>)}
            {!user.isProfilePublic && <Pill>profile hidden</Pill>}
          </div>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--gray-500)", marginTop: 4 }}>
            {user.handle ? `@${user.handle} · ` : ""}{user.planName ?? "no plan"}
            {user.planExpiration ? ` until ${formatDate(user.planExpiration)}` : ""} · {user.mediaCount} file
            {user.mediaCount === 1 ? "" : "s"} · joined {formatDate(user.createdAt)}
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: "var(--font-size-xs)", color: "var(--gray-500)", whiteSpace: "nowrap" }}>
          <div>{formatBytes(user.usedMemory)} / {formatBytes(user.buyedMemory)} storage ({storagePct.toFixed(0)}%)</div>
          <div>{formatBytes(user.usedBandwidth)} / {formatBytes(user.buyedBandwidth)} bandwidth ({bandwidthPct.toFixed(0)}%)</div>
          {(user.bonusMemory !== 0 || user.bonusBandwidth !== 0) && (
            <div style={{ color: "var(--primary)" }}>
              granted: {formatBytes(user.bonusMemory)} storage, {formatBytes(user.bonusBandwidth)} bandwidth
            </div>
          )}
        </div>
      </div>

      {open && (
        <div style={{ marginTop: "var(--space-4)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--border-color)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {user.isSuspended && user.suspensionReason && (
            <p style={{ margin: 0, fontSize: "var(--font-size-sm)", color: "var(--danger)" }}>
              Suspended: {user.suspensionReason}
            </p>
          )}

          {/* Plan */}
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ minWidth: 90, fontSize: "var(--font-size-sm)", fontWeight: 600 }}>Plan</span>
            <select value={planName} onChange={(e) => setPlanName(e.target.value)} style={{ width: 130 }}>
              {["Free", "Silver", "Gold", "Platinum"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input
              type="number" min={1} max={36} value={months}
              onChange={(e) => setMonths(Math.max(1, Number(e.target.value) || 1))}
              style={{ width: 70 }} title="Months"
            />
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--gray-500)" }}>month(s)</span>
            <input
              type="text" value={planReason} placeholder="reason (goes in the audit log)"
              onChange={(e) => setPlanReason(e.target.value)}
              style={{ flex: "1 1 200px", minWidth: 140 }}
            />
            <button
              type="button" className="btn-primary" disabled={busy}
              onClick={() => run(
                () => api.post<AdminUser>(`users/${user.id}/plan`, { planName, months, reason: planReason }),
                `${planName} granted`,
              )}
            >
              Grant plan
            </button>
          </div>

          <GrantControl
            label="Storage" busy={busy}
            onGrant={(bytes, reason) => run(
              () => api.post<AdminUser>(`users/${user.id}/storage`, { deltaBytes: bytes, reason }),
              "Storage updated",
            )}
          />

          <GrantControl
            label="Bandwidth" busy={busy}
            onGrant={(bytes, reason) => run(
              () => api.post<AdminUser>(`users/${user.id}/bandwidth`, { deltaBytes: bytes, reason }),
              "Bandwidth updated",
            )}
          />

          {/* Roles + switches */}
          <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ minWidth: 90, fontSize: "var(--font-size-sm)", fontWeight: 600 }}>Roles</span>
            {["Admin", "Moderator"].map((role) => {
              const has = user.roles.some((r) => r.toLowerCase() === role.toLowerCase());
              // Removing your own Admin role is refused server-side; disabling it here means the
              // operator finds that out before they click rather than after.
              const locked = role === "Admin" && has && isSelf;
              return (
                <label key={role} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--font-size-sm)" }}>
                  <input
                    type="checkbox" checked={has} disabled={busy || locked}
                    title={locked ? "You can't remove your own administrator role" : undefined}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...user.roles, role]
                        : user.roles.filter((r) => r.toLowerCase() !== role.toLowerCase());
                      run(() => api.put<AdminUser>(`users/${user.id}/roles`, { roles: next }), "Roles updated");
                    }}
                  />
                  {role}
                </label>
              );
            })}

            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--font-size-sm)" }}>
              <input
                type="checkbox" checked={user.isProfilePublic} disabled={busy}
                onChange={(e) => run(
                  () => api.post<AdminUser>(`users/${user.id}/profile-visibility`, { value: e.target.checked }),
                  e.target.checked ? "Profile visible" : "Profile hidden",
                )}
              />
              Public profile
            </label>

            <button
              type="button" className="btn-secondary" disabled={busy}
              onClick={() => run(() => api.post<AdminUser>(`users/${user.id}/bandwidth/reset`, {}), "Bandwidth cycle reset")}
            >
              Reset bandwidth usage
            </button>
          </div>

          {/* Suspension */}
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ minWidth: 90, fontSize: "var(--font-size-sm)", fontWeight: 600 }}>Access</span>
            {user.isSuspended ? (
              <button
                type="button" className="btn-primary" disabled={busy}
                onClick={() => run(
                  () => api.post<AdminUser>(`users/${user.id}/suspend`, { suspended: false }),
                  "Sign-in restored",
                )}
              >
                Lift suspension
              </button>
            ) : (
              <>
                <input
                  type="text" value={suspendReason} placeholder="reason shown to them at sign-in"
                  onChange={(e) => setSuspendReason(e.target.value)}
                  style={{ flex: "1 1 240px", minWidth: 160 }}
                />
                <ConfirmButton
                  disabled={busy || isSelf}
                  confirmLabel="Click again to suspend"
                  onConfirm={() => run(
                    () => api.post<AdminUser>(`users/${user.id}/suspend`, { suspended: true, reason: suspendReason }),
                    "Account suspended",
                  )}
                >
                  Suspend
                </ConfirmButton>
              </>
            )}
          </div>

          {/* Deletion. Typing the address is the point: it is the one action with no undo, and it
              takes every file the account ever uploaded with it. */}
          {!isSelf && (
            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap", paddingTop: "var(--space-2)", borderTop: "1px dashed var(--border-color)" }}>
              <span style={{ minWidth: 90, fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--danger)" }}>Delete</span>
              <input
                type="text" value={deleteConfirm} placeholder={`type ${user.email ?? user.id} to confirm`}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                style={{ flex: "1 1 260px", minWidth: 180 }}
              />
              <button
                type="button" className="btn-danger"
                disabled={busy || deleteConfirm.trim() !== (user.email ?? user.id)}
                onClick={() => run(async () => {
                  await api.del(`users/${user.id}`);
                  return null;
                }, "Account deleted")}
              >
                Delete account and all {user.mediaCount} file{user.mediaCount === 1 ? "" : "s"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UsersTab({ api, currentUserId }: { api: Api; currentUserId: string | null }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const data = await api.get<Paged<AdminUser>>(`users?take=50&q=${encodeURIComponent(q)}`);
      setRows(data.items);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [api]);

  // Debounced: the search runs on every keystroke otherwise, and this one hits the user table.
  useEffect(() => {
    const t = setTimeout(() => { load(query).catch(() => {}); }, 250);
    return () => clearTimeout(t);
  }, [query, load]);

  return (
    <>
      <input
        type="search" value={query} placeholder="Search by email, handle or name…"
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: "100%", marginBottom: "var(--space-3)" }}
      />
      <p className="text-muted" style={{ fontSize: "var(--font-size-xs)", marginTop: 0 }}>
        {loading ? "Searching…" : `${rows.length} of ${total} account${total === 1 ? "" : "s"} · click a row to act on it`}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {rows.map((u) => (
          <UserCard
            key={u.id} user={u} api={api} currentUserId={currentUserId}
            onChange={(updated) => setRows((prev) =>
              updated === null ? prev.filter((r) => r.id !== u.id) : prev.map((r) => (r.id === u.id ? updated : r)))}
          />
        ))}
      </div>
    </>
  );
}

/* ── Media ─────────────────────────────────────────────────── */

/**
 * One file, with the three things staff do to it.
 *
 * Hiding and deleting both send the owner an email, so both stop to collect a reason first —
 * that reason is quoted to them verbatim, and "we made your file private" with no explanation is
 * the message that turns into a support ticket. Making a file public again asks for nothing: the
 * restore notice is good news and needs no justification.
 *
 * The reason prompt doubles as the are-you-sure. A destructive action that takes a deliberate
 * sentence to complete is not one you fire by mis-clicking a row.
 */
function MediaRow({ media: m, api, act, patch }: {
  media: AdminMedia;
  api: Api;
  act: (fn: () => Promise<void>) => void;
  patch: (id: string, updated: AdminMedia | null) => void;
}) {
  const [prompt, setPrompt] = useState<null | "hide" | "delete">(null);
  const [reason, setReason] = useState("");

  const close = () => { setPrompt(null); setReason(""); };

  return (
    <div className="card" style={{ padding: "var(--space-3)", display: "flex", gap: "var(--space-3)", alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ width: 72, height: 48, borderRadius: "var(--radius-sm)", overflow: "hidden", background: "var(--bg-elevated)", flexShrink: 0 }}>
        {m.thumbnailUrl && <img src={m.thumbnailUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      </div>

      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
          <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {m.fileName || "Untitled"}
          </strong>
          {!m.isPublic && <Pill tone="var(--danger)">private</Pill>}
          {m.isPublic && !m.showOnMediaPage && <Pill>off gallery</Pill>}
          {m.downloadable && <Pill tone="var(--success)">downloadable</Pill>}
          {m.isProfileAsset && <Pill>profile asset</Pill>}
          {m.pendingReports > 0 && <Pill tone="var(--danger)">{m.pendingReports} report(s)</Pill>}
        </div>
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--gray-500)", marginTop: 2 }}>
          {m.ownerEmail ?? m.ownerId} · {formatBytes(m.fileSize)} · {m.contentType} · {formatDate(m.uploadedAt)}
        </div>
      </div>

      {prompt ? (
        <div style={{ flex: "1 1 100%", display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap", paddingTop: "var(--space-2)", borderTop: "1px dashed var(--border-color)" }}>
          <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, color: prompt === "delete" ? "var(--danger)" : undefined }}>
            {prompt === "delete" ? "Delete permanently" : "Make private"}
          </span>
          <input
            type="text" value={reason} autoFocus
            placeholder={`Reason — emailed to ${m.ownerEmail ?? "the owner"}`}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") close(); }}
            style={{ flex: "1 1 240px", minWidth: 160 }}
          />
          <button
            type="button"
            className={prompt === "delete" ? "btn-danger" : "btn-primary"}
            onClick={() => {
              const why = reason.trim() || undefined;
              close();
              act(async () => {
                if (prompt === "delete") {
                  await api.del(`media/${m.id}${why ? `?reason=${encodeURIComponent(why)}` : ""}`);
                  patch(m.id, null);
                  toast.success("File deleted — the owner has been emailed");
                } else {
                  // Hiding sets both flags: a file that is private but still flagged for the
                  // gallery is a contradiction the owner would have to untangle later.
                  patch(m.id, await api.post<AdminMedia>(`media/${m.id}/visibility`, {
                    isPublic: false, showOnMediaPage: false, reason: why,
                  }));
                  toast.success("File hidden — the owner has been emailed");
                }
              });
            }}
          >
            {prompt === "delete" ? "Delete and notify" : "Hide and notify"}
          </button>
          <button type="button" className="btn-secondary" onClick={close}>Cancel</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          {m.isPublic ? (
            <button type="button" className="btn-secondary" onClick={() => setPrompt("hide")}>
              Make private
            </button>
          ) : (
            <button
              type="button" className="btn-secondary"
              onClick={() => act(async () => {
                patch(m.id, await api.post<AdminMedia>(`media/${m.id}/visibility`, {
                  isPublic: true, showOnMediaPage: true,
                }));
                toast.success("File is public again — the owner has been emailed");
              })}
            >
              Make public
            </button>
          )}

          <button
            type="button" className="btn-secondary"
            onClick={() => act(async () => {
              patch(m.id, await api.post<AdminMedia>(`media/${m.id}/downloadable`, { value: !m.downloadable }));
              toast.success(m.downloadable ? "Download withdrawn" : "Download offered");
            })}
          >
            {m.downloadable ? "Stop download" : "Allow download"}
          </button>

          <button type="button" className="btn-danger" onClick={() => setPrompt("delete")}>Delete</button>
        </div>
      )}
    </div>
  );
}

function MediaTab({ api }: { api: Api }) {
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState("");
  const [rows, setRows] = useState<AdminMedia[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (q: string, v: string) => {
    setLoading(true);
    try {
      const data = await api.get<Paged<AdminMedia>>(
        `media?take=50&q=${encodeURIComponent(q)}&visibility=${encodeURIComponent(v)}`);
      setRows(data.items);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const t = setTimeout(() => { load(query, visibility).catch(() => {}); }, 250);
    return () => clearTimeout(t);
  }, [query, visibility, load]);

  const patch = (id: string, updated: AdminMedia | null) =>
    setRows((prev) => (updated === null ? prev.filter((m) => m.id !== id) : prev.map((m) => (m.id === id ? updated : m))));

  /** Same bargain as the user tab: the api wrapper has already shown the server's message, so a
   *  refusal ends here rather than escaping a click handler as an unhandled rejection. */
  const act = (fn: () => Promise<void>) => { fn().catch(() => {}); };

  return (
    <>
      <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)", flexWrap: "wrap" }}>
        <input
          type="search" value={query} placeholder="Search by file name, description or owner…"
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: "1 1 260px" }}
        />
        <select value={visibility} onChange={(e) => setVisibility(e.target.value)} style={{ width: 140 }}>
          <option value="">All files</option>
          <option value="public">Public only</option>
          <option value="private">Private only</option>
        </select>
      </div>
      <p className="text-muted" style={{ fontSize: "var(--font-size-xs)", marginTop: 0 }}>
        {loading ? "Searching…" : `${rows.length} of ${total} file${total === 1 ? "" : "s"}`}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {rows.map((m) => (
          <MediaRow key={m.id} media={m} api={api} act={act} patch={patch} />
        ))}
      </div>
    </>
  );
}

/* ── Plans ─────────────────────────────────────────────────── */

function PlanRow({ plan, api, onSaved }: { plan: AdminPlan; api: Api; onSaved: (p: AdminPlan) => void }) {
  const [draft, setDraft] = useState(plan);
  const [busy, setBusy] = useState(false);

  const dirty =
    draft.storageLimitMB !== plan.storageLimitMB ||
    draft.bandwidthMB !== plan.bandwidthMB ||
    draft.price !== plan.price ||
    draft.allowDownloads !== plan.allowDownloads ||
    (draft.description ?? "") !== (plan.description ?? "");

  return (
    <div className="card" style={{ padding: "var(--space-4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-2)" }}>
        <strong>{plan.name}</strong>
        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--gray-500)" }}>
          {plan.userCount} account{plan.userCount === 1 ? "" : "s"} · currently {formatPrice(plan.price)}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
        <label style={{ fontSize: "var(--font-size-xs)" }}>
          Storage (MB)
          <input type="number" min={0} value={draft.storageLimitMB} style={{ width: "100%" }}
            onChange={(e) => setDraft({ ...draft, storageLimitMB: Number(e.target.value) || 0 })} />
        </label>
        <label style={{ fontSize: "var(--font-size-xs)" }}>
          Bandwidth (MB)
          <input type="number" min={0} value={draft.bandwidthMB} style={{ width: "100%" }}
            onChange={(e) => setDraft({ ...draft, bandwidthMB: Number(e.target.value) || 0 })} />
        </label>
        <label style={{ fontSize: "var(--font-size-xs)" }}>
          Price (cents)
          <input type="number" min={0} value={draft.price} style={{ width: "100%" }}
            onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) || 0 })} />
        </label>
        <label style={{ fontSize: "var(--font-size-xs)", display: "flex", alignItems: "flex-end", gap: 6, paddingBottom: 6 }}>
          <input type="checkbox" checked={draft.allowDownloads}
            onChange={(e) => setDraft({ ...draft, allowDownloads: e.target.checked })} />
          Allow downloads
        </label>
      </div>

      <input
        type="text" value={draft.description ?? ""} placeholder="Description"
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        style={{ width: "100%", marginTop: "var(--space-2)" }}
      />

      <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)", alignItems: "center" }}>
        <button
          type="button" className="btn-primary" disabled={!dirty || busy}
          onClick={async () => {
            setBusy(true);
            try {
              const saved = await api.put<AdminPlan>(`plans/${plan.id}`, {
                description: draft.description,
                storageLimitMB: draft.storageLimitMB,
                bandwidthMB: draft.bandwidthMB,
                price: draft.price,
                allowDownloads: draft.allowDownloads,
              });
              if (saved) { onSaved(saved); setDraft(saved); toast.success(`${plan.name} updated`); }
            } catch {
              // Reported by the api wrapper. The draft is left as it was so the edit isn't lost.
            } finally { setBusy(false); }
          }}
        >
          Save
        </button>
        {dirty && (
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => setDraft(plan)}>
            Reset
          </button>
        )}
        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--gray-500)" }}>
          Applies to new assignments and renewals — nobody's current allowance changes.
        </span>
      </div>
    </div>
  );
}

function PlansTab({ api }: { api: Api }) {
  const [plans, setPlans] = useState<AdminPlan[] | null>(null);

  useEffect(() => { api.get<AdminPlan[]>("plans").then(setPlans).catch(() => {}); }, [api]);

  if (!plans) return <div className="loading" style={{ margin: "var(--space-12) auto" }} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {plans.map((p) => (
        <PlanRow key={p.id} plan={p} api={api}
          onSaved={(saved) => setPlans((prev) => prev!.map((x) => (x.id === saved.id ? saved : x)))} />
      ))}
    </div>
  );
}

/* ── Audit ─────────────────────────────────────────────────── */

function AuditTab({ api }: { api: Api }) {
  const [data, setData] = useState<Paged<AuditEntry> | null>(null);

  useEffect(() => { api.get<Paged<AuditEntry>>("audit?take=100").then(setData).catch(() => {}); }, [api]);

  if (!data) return <div className="loading" style={{ margin: "var(--space-12) auto" }} />;

  if (data.items.length === 0) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "var(--space-12)" }}>
        <p className="text-muted">Nothing has been done from this page yet.</p>
      </div>
    );
  }

  return (
    <>
      <p className="text-muted" style={{ fontSize: "var(--font-size-xs)", marginTop: 0 }}>
        Newest first · {data.total} entr{data.total === 1 ? "y" : "ies"} · nothing here can be edited or removed
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {data.items.map((a) => (
          <div key={a.id} className="card" style={{ padding: "var(--space-3)", display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "baseline" }}>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--gray-500)", width: 120, flexShrink: 0 }}>
              {formatDateTime(a.createdAt)}
            </span>
            <Pill tone="var(--secondary)">{a.action}</Pill>
            <span style={{ flex: "1 1 240px", minWidth: 0, fontSize: "var(--font-size-sm)" }}>
              <strong>{a.targetLabel || a.targetId}</strong>
              {a.detail && <span style={{ color: "var(--gray-600)" }}> — {a.detail}</span>}
            </span>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--gray-500)" }}>by {a.actorEmail ?? "unknown"}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ── Page ──────────────────────────────────────────────────── */

/**
 * The thin API wrapper the tabs share.
 *
 * It exists so a failed call is handled once, in one place, rather than each tab inventing its own
 * error path — and so a rejected mutation leaves the row exactly as it was instead of optimistically
 * showing a change the server refused.
 */
interface Api {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body: unknown) => Promise<T | null>;
  put: <T>(path: string, body: unknown) => Promise<T | null>;
  del: (path: string) => Promise<void>;
}

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "users", label: "Users" },
  { key: "media", label: "Media" },
  { key: "plans", label: "Plans" },
  { key: "audit", label: "Audit log" },
];

export function AdminPage() {
  const { authFetch, claims } = useAuth();
  // The token's `sub` is the account id. The page needs it to recognise the operator's own row:
  // the server refuses self-suspension and self-demotion, and the UI should say so before the click.
  const currentUserId = typeof claims.sub === "string" ? claims.sub : null;
  const [tab, setTab] = useState<Tab>("overview");

  const api = useMemo<Api>(() => {
    const base = `${API_BASE_URL}/api/admin`;

    // Errors are surfaced here rather than thrown on to the caller: the server's message is the
    // useful one ("this is the only administrator"), and every caller would otherwise repeat this.
    async function send<T>(path: string, init?: RequestInit): Promise<T | null> {
      const res = await authFetch(`${base}/${path}`, { ...init, silent: true });
      if (res.ok) return res.status === 204 ? null : ((await res.json()) as T);

      let message = `Request failed (${res.status})`;
      try {
        const body = await res.json();
        if (body?.message) message = body.message;
        else if (body?.error) message = body.error;
      } catch { /* not JSON — the status is all we have */ }
      toast.error(message);
      throw new Error(message);
    }

    const json = (body: unknown) => ({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    return {
      get: <T,>(path: string) => send<T>(path) as Promise<T>,
      post: <T,>(path: string, body: unknown) => send<T>(path, { method: "POST", ...json(body) }),
      put: <T,>(path: string, body: unknown) => send<T>(path, { method: "PUT", ...json(body) }),
      del: async (path: string) => { await send(path, { method: "DELETE" }); },
    };
  }, [authFetch]);

  return (
    <div className="container">
      <h1>Admin</h1>
      <p className="text-muted">
        Everything here changes somebody else's account. Every change is written to the audit log with your name on it.
      </p>

      <div className="admin-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={tab === t.key ? "admin-tab is-active" : "admin-tab"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: "var(--space-6)" }}>
        {tab === "overview" && <OverviewTab api={api} />}
        {tab === "users" && <UsersTab api={api} currentUserId={currentUserId} />}
        {tab === "media" && <MediaTab api={api} />}
        {tab === "plans" && <PlansTab api={api} />}
        {tab === "audit" && <AuditTab api={api} />}
      </div>
    </div>
  );
}
