import { useEffect, useState } from "react";
import { useAuth } from "../Auth/useAuth";
import { API_BASE_URL } from "../config";
import "../App.css";

interface Media {
  id: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  uploadedAt: string;
  status: string;
  isPublic: boolean;
}

interface UserData {
  id: string;
  email: string;
  buyedMemory: number | null;
  usedMemory: number | null;
  freeMemory: number | null;
  planExpiration: string | null;
  planName: string | null;
  planDescription: string | null;
  media: Media[];
}

function formatMemoryFromMb(value: number | null | undefined) {
  if (value === null || value === undefined) return "N/A";

  const units = ["MB", "GB", "TB", "PB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  const decimals = Number.isInteger(size) ? 0 : 2;
  return `${size.toFixed(decimals)} ${units[unitIndex]}`;
}

export function ProfilePage() {
  const { authFetch, claims } = useAuth();
  const [user, setUser] = useState<UserData | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareLinkExpiry, setShareLinkExpiry] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);

  // Load user DTO
  useEffect(() => {
    async function load() {
      const userId = claims.sub;
      const res = await authFetch(`${API_BASE_URL}/getData/${userId}`);
      const data = await res.json();
      setUser(data);
    }
    load();
  }, [authFetch, claims]);

  // Handle media deletion
  async function handleDeleteMedia(mediaId: string) {
    if (!confirm("Are you sure you want to delete this media?")) {
      return;
    }

    try {
      const res = await authFetch(`${API_BASE_URL}/api/media/Media/Delete/${mediaId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete media");
      }

      // Remove from user state
      setUser((prevUser) => {
        if (!prevUser) return prevUser;
        return {
          ...prevUser,
          media: prevUser.media.filter((m) => m.id !== mediaId),
        };
      });

      // Remove from URLs cache
      setUrls((prevUrls) => {
        const newUrls = { ...prevUrls };
        delete newUrls[mediaId];
        return newUrls;
      });
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Failed to delete media"
      );
    }
  }

  // Handle toggling media visibility
  async function handleToggleVisibility(mediaId: string) {
    try {
      const res = await authFetch(`${API_BASE_URL}/api/media/${mediaId}/toggle-visibility`, {
        method: "PATCH",
      });

      if (!res.ok) {
        throw new Error("Failed to toggle visibility");
      }

      setUser((prevUser) => {
        if (!prevUser) return prevUser;
        return {
          ...prevUser,
          media: prevUser.media.map((m) =>
            m.id === mediaId ? { ...m, isPublic: !m.isPublic } : m
          ),
        };
      });
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Failed to toggle visibility"
      );
    }
  }

  // Handle creating a share link for private media
  async function handleShareMedia(mediaId: string) {
    setShareLoading(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/shared/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId, expirationHours: 24 }),
      });

      if (!res.ok) {
        throw new Error("Failed to create share link");
      }

      const data = await res.json();
      const link = `${window.location.origin}/shared/${data.token}`;
      setShareLink(link);
      setShareLinkExpiry(new Date(data.expiresAt).toLocaleString());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create share link");
    } finally {
      setShareLoading(false);
    }
  }

  // Load AWS URLs for each media item
  useEffect(() => {
    async function loadUrls() {
      if (!user) return;

      const newUrls: Record<string, string> = {};

      for (const m of user.media) {
        const res = await authFetch(`${API_BASE_URL}/api/media/${m.id}/url`);
        const data = await res.json();
        newUrls[m.id] = data.url;
      }

      setUrls(newUrls);
    }

    loadUrls();
  }, [user, authFetch]);

  if (!user) return <div className="loading" style={{ margin: "var(--space-16) auto" }}></div>;

  return (
    <div className="container">
      <div className="card">
        <div className="card-header">
          <h1 style={{ marginBottom: 0 }}>Creator Dashboard</h1>
        </div>

        <div className="card-body">
          <div style={{ marginBottom: "var(--space-6)" }}>
            <p style={{ color: "var(--gray-600)" }}>
              <span style={{ fontWeight: 600 }}>Account Email:</span> {user.email}
            </p>
            <p style={{ color: "var(--gray-600)" }}>
              <span style={{ fontWeight: 600 }}>Published Content:</span> {user.media.length} file{user.media.length !== 1 ? 's' : ''}
            </p>
            <p style={{ color: "var(--gray-600)" }}>
              <span style={{ fontWeight: 600 }}>Plan:</span> {user.planName ?? "N/A"}
            </p>
            <p style={{ color: "var(--gray-600)" }}>
              <span style={{ fontWeight: 600 }}>Buyed Memory:</span> {formatMemoryFromMb(user.buyedMemory)}
            </p>
            <p style={{ color: "var(--gray-600)" }}>
              <span style={{ fontWeight: 600 }}>Used Memory:</span> {formatMemoryFromMb(user.usedMemory)}
            </p>
            <p style={{ color: "var(--gray-600)" }}>
              <span style={{ fontWeight: 600 }}>Free Memory:</span> {formatMemoryFromMb(user.freeMemory)}
            </p>
            <p style={{ color: "var(--gray-600)" }}>
              <span style={{ fontWeight: 600 }}>Plan Expiration:</span> {user.planExpiration ? new Date(user.planExpiration).toLocaleString() : "N/A"}
            </p>
            <p style={{ color: "var(--gray-600)", marginBottom: 0 }}>
              <span style={{ fontWeight: 600 }}>Plan Description:</span> {user.planDescription ?? "N/A"}
            </p>
          </div>
        </div>
      </div>

      <div style={{ marginTop: "var(--space-8)" }}>
        <h2>Your Video Collection</h2>

        {user.media.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "var(--space-12)" }}>
            <p className="text-muted">Your media library is empty. <a href="/upload">Upload your first video</a> to get started!</p>
          </div>
        ) : (
          <div className="grid grid-2">
            {user.media.map((m) => (
              <MediaItem
                key={m.id}
                media={m}
                url={urls[m.id]}
                onDelete={() => handleDeleteMedia(m.id)}
                onToggleVisibility={() => handleToggleVisibility(m.id)}
                onShare={() => handleShareMedia(m.id)}
                shareLoading={shareLoading}
              />
            ))}
          </div>
        )}
      </div>

      {/* Share Link Modal */}
      {shareLink && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => { setShareLink(null); setShareLinkExpiry(null); }}
        >
          <div
            className="card"
            style={{ maxWidth: "500px", width: "90%", margin: "0 auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-header">
              <h2 className="card-title" style={{ marginBottom: 0 }}>Temporary Share Link</h2>
            </div>
            <div className="card-body">
              <p className="text-muted" style={{ fontSize: "var(--font-size-sm)", marginBottom: "var(--space-4)" }}>
                Anyone with this link can view the media — no account required. The link expires on <strong>{shareLinkExpiry}</strong>.
              </p>
              <div style={{
                display: "flex",
                gap: "var(--space-2)",
                alignItems: "center",
              }}>
                <input
                  type="text"
                  readOnly
                  value={shareLink}
                  style={{
                    flex: 1,
                    padding: "var(--space-3)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-color)",
                    backgroundColor: "var(--bg-elevated)",
                    color: "var(--text-primary)",
                    fontSize: "var(--font-size-sm)",
                  }}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  className="btn-primary"
                  style={{ whiteSpace: "nowrap" }}
                  onClick={() => {
                    navigator.clipboard.writeText(shareLink);
                    alert("Link copied to clipboard!");
                  }}
                >
                  Copy
                </button>
              </div>
              <div style={{ marginTop: "var(--space-4)", textAlign: "right" }}>
                <button
                  className="btn-secondary"
                  onClick={() => { setShareLink(null); setShareLinkExpiry(null); }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MediaItem({
  media,
  url,
  onDelete,
  onToggleVisibility,
  onShare,
  shareLoading,
}: {
  media: Media;
  url?: string;
  onDelete: () => void;
  onToggleVisibility: () => void;
  onShare: () => void;
  shareLoading: boolean;
}) {
  if (!url) return <div className="card" style={{ padding: "var(--space-8)", textAlign: "center" }}><div className="loading" style={{ margin: "0 auto" }}></div></div>;

  return (
    <div className="card">
      <div style={{ width: "100%", height: "200px", borderRadius: "var(--radius-lg)", overflow: "hidden", backgroundColor: "var(--bg-deep)", marginBottom: "var(--space-4)" }}>
        {media.contentType.startsWith("image/") ? (
          <img src={url} alt={media.fileName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <video src={url} controls style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}
      </div>

      <div style={{ marginBottom: "var(--space-3)" }}>
        <p style={{ fontWeight: 500, marginBottom: "var(--space-1)" }}>{media.fileName}</p>
        <p className="text-muted" style={{ fontSize: "var(--font-size-sm)", marginBottom: "var(--space-1)" }}>
          {(media.fileSize / (1024 * 1024)).toFixed(2)} MB
        </p>
        <p className="text-muted" style={{ fontSize: "var(--font-size-xs)", marginBottom: "var(--space-1)" }}>
          Status: <span style={{ color: "var(--success)", fontWeight: 600 }}>{media.status || 'Ready'}</span>
        </p>
        <p style={{ fontSize: "var(--font-size-xs)", marginBottom: 0 }}>
          <span style={{
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: "var(--radius-sm)",
            fontWeight: 600,
            fontSize: "var(--font-size-xs)",
            backgroundColor: media.isPublic ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
            color: media.isPublic ? "var(--success)" : "var(--danger)",
          }}>
            {media.isPublic ? "Public" : "Private"}
          </span>
        </p>
      </div>

      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <button
          onClick={onToggleVisibility}
          className={media.isPublic ? "btn-secondary" : "btn-primary"}
          style={{ flex: 1, fontSize: "var(--font-size-sm)" }}
        >
          {media.isPublic ? "Make Private" : "Make Public"}
        </button>
        {!media.isPublic && (
          <button
            onClick={onShare}
            disabled={shareLoading}
            className="btn-primary"
            style={{ flex: 1, fontSize: "var(--font-size-sm)" }}
          >
            {shareLoading ? "..." : "Share Link"}
          </button>
        )}
        <button onClick={onDelete} className="btn-danger" style={{ flex: 1, fontSize: "var(--font-size-sm)" }}>
          Delete
        </button>
      </div>
    </div>
  );
}
