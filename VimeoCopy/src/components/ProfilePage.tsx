import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useAuth } from "../Auth/useAuth";
import { API_BASE_URL } from "../config";
import { ThumbnailPicker } from "./ThumbnailPicker";
import { EnhancedPlayer } from "./EnhancedPlayer";
import "../App.css";

interface Media {
  id: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  uploadedAt: string;
  status: string;
  isPublic: boolean;
  hasThumbnail: boolean;
  showOnMediaPage: boolean;
  description: string | null;
}

interface UserData {
  id: string;
  email: string;
  buyedMemory: number | null;
  usedMemory: number | null;
  freeMemory: number | null;
  buyedBandwidth: number | null;
  usedBandwidth: number | null;
  freeBandwidth: number | null;
  planExpiration: string | null;
  planName: string | null;
  planDescription: string | null;
  media: Media[];
}

function formatBytes(value: number | null | undefined) {
  if (value === null || value === undefined) return "N/A";

  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
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
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareLinkExpiry, setShareLinkExpiry] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [embedMedia, setEmbedMedia] = useState<Media | null>(null);
  const [thumbPickerMediaId, setThumbPickerMediaId] = useState<string | null>(null);
  const [thumbUploading, setThumbUploading] = useState(false);
  const [editingDesc, setEditingDesc] = useState<string | null>(null);
  const [descDraft, setDescDraft] = useState("");
  const [viewerMedia, setViewerMedia] = useState<{ media: Media; url: string } | null>(null);

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

  // Handle toggling ShowOnMediaPage
  async function handleToggleShowOnMediaPage(mediaId: string, currentValue: boolean) {
    try {
      const res = await authFetch(`${API_BASE_URL}/api/media/${mediaId}/details`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showOnMediaPage: !currentValue }),
      });

      if (!res.ok) throw new Error("Failed to update media details");

      setUser((prevUser) => {
        if (!prevUser) return prevUser;
        return {
          ...prevUser,
          media: prevUser.media.map((m) =>
            m.id === mediaId ? { ...m, showOnMediaPage: !currentValue } : m
          ),
        };
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update");
    }
  }

  // Handle saving description
  async function handleSaveDescription(mediaId: string, description: string) {
    try {
      const res = await authFetch(`${API_BASE_URL}/api/media/${mediaId}/details`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });

      if (!res.ok) throw new Error("Failed to update description");

      setUser((prevUser) => {
        if (!prevUser) return prevUser;
        return {
          ...prevUser,
          media: prevUser.media.map((m) =>
            m.id === mediaId ? { ...m, description } : m
          ),
        };
      });
      setEditingDesc(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update description");
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

  // Handle uploading a custom thumbnail for an existing media
  async function handleThumbnailCapture(blob: Blob) {
    if (!thumbPickerMediaId) return;
    setThumbUploading(true);
    try {
      // 1. Get presigned PUT URL
      const urlRes = await authFetch(
        `${API_BASE_URL}/api/media/${thumbPickerMediaId}/thumbnail/upload-url`,
        { method: "POST" }
      );
      if (!urlRes.ok) throw new Error("Failed to get thumbnail upload URL");
      const { uploadUrl } = await urlRes.json();

      // 2. Upload thumbnail to S3
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl, true);
        xhr.setRequestHeader("Content-Type", "image/jpeg");
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Upload failed")));
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(blob);
      });

      // 3. Confirm thumbnail on backend
      const confirmRes = await authFetch(
        `${API_BASE_URL}/api/media/${thumbPickerMediaId}/thumbnail/confirm`,
        { method: "POST" }
      );
      if (!confirmRes.ok) throw new Error("Failed to confirm thumbnail");

      // 4. Refresh thumbnail URL
      const mediaRes = await authFetch(`${API_BASE_URL}/api/media/${thumbPickerMediaId}/url`);
      if (mediaRes.ok) {
        const data = await mediaRes.json();
        if (data.thumbnailUrl) {
          setThumbnailUrls((prev) => ({ ...prev, [thumbPickerMediaId]: data.thumbnailUrl }));
        }
      }

      setThumbPickerMediaId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update thumbnail");
    } finally {
      setThumbUploading(false);
    }
  }

  // Load AWS URLs for each media item
  useEffect(() => {
    async function loadUrls() {
      if (!user) return;

      const newUrls: Record<string, string> = {};
      const newThumbs: Record<string, string> = {};

      for (const m of user.media) {
        const res = await authFetch(`${API_BASE_URL}/api/media/${m.id}/url`);
        const data = await res.json();
        newUrls[m.id] = data.url;
        if (data.thumbnailUrl) {
          newThumbs[m.id] = data.thumbnailUrl;
        }
      }

      setUrls(newUrls);
      setThumbnailUrls(newThumbs);
    }

    loadUrls();
  }, [user, authFetch]);

  if (!user) return <div className="loading" style={{ margin: "var(--space-16) auto" }}></div>;

  return (
    <div className="container">
      <div className="card">
        <div className="card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-3)" }}>
          <h1 style={{ marginBottom: 0 }}>Creator Dashboard</h1>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <Link to="/settings" className="btn-secondary">Account settings</Link>
          <Link to="/profile/customize" className="btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Customize public profile
          </Link>
          </div>
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
              <span style={{ fontWeight: 600 }}>Buyed Memory:</span> {formatBytes(user.buyedMemory)}
            </p>
            <p style={{ color: "var(--gray-600)" }}>
              <span style={{ fontWeight: 600 }}>Used Memory:</span> {formatBytes(user.usedMemory)}
            </p>
            <p style={{ color: "var(--gray-600)" }}>
              <span style={{ fontWeight: 600 }}>Free Memory:</span> {formatBytes(user.freeMemory)}
            </p>
            <p style={{ color: "var(--gray-600)" }}>
              <span style={{ fontWeight: 600 }}>Bandwidth:</span>{" "}
              {formatBytes(user.usedBandwidth)} used / {formatBytes(user.buyedBandwidth)} total
              {user.freeBandwidth !== null && user.freeBandwidth !== undefined && (
                <> · {formatBytes(user.freeBandwidth)} remaining</>
              )}
            </p>
            {user.buyedBandwidth ? (
              <div style={{
                height: 8,
                width: "100%",
                background: "var(--bg-elevated)",
                borderRadius: 4,
                overflow: "hidden",
                marginTop: -4,
                marginBottom: "var(--space-2)",
              }}>
                <div style={{
                  height: "100%",
                  width: `${Math.min(100, ((user.usedBandwidth ?? 0) / user.buyedBandwidth) * 100)}%`,
                  background: ((user.usedBandwidth ?? 0) / user.buyedBandwidth) >= 0.9
                    ? "var(--danger)"
                    : "linear-gradient(90deg, var(--primary), var(--secondary))",
                  transition: "width 0.3s ease",
                }} />
              </div>
            ) : null}
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
            <p className="text-muted">Your media library is empty. <Link to="/upload">Upload your first video</Link> to get started!</p>
          </div>
        ) : (
          <div className="grid grid-2">
            {user.media.map((m) => (
              <MediaItem
                key={m.id}
                media={m}
                url={urls[m.id]}
                thumbnailUrl={thumbnailUrls[m.id]}
                onDelete={() => handleDeleteMedia(m.id)}
                onToggleVisibility={() => handleToggleVisibility(m.id)}
                onToggleShowOnMediaPage={() => handleToggleShowOnMediaPage(m.id, m.showOnMediaPage)}
                onShare={() => handleShareMedia(m.id)}
                onEmbed={() => setEmbedMedia(m)}
                onChangeThumbnail={() => setThumbPickerMediaId(m.id)}
                onExpand={() => urls[m.id] && setViewerMedia({ media: m, url: urls[m.id] })}
                shareLoading={shareLoading}
                isEditingDesc={editingDesc === m.id}
                descDraft={editingDesc === m.id ? descDraft : ""}
                onStartEditDesc={() => { setEditingDesc(m.id); setDescDraft(m.description || ""); }}
                onDescDraftChange={setDescDraft}
                onSaveDesc={() => handleSaveDescription(m.id, descDraft)}
                onCancelDesc={() => setEditingDesc(null)}
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
            background: "var(--overlay-medium)",
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

      {/* Embed Code Modal */}
      {embedMedia && (
        <EmbedModal
          media={embedMedia}
          onClose={() => setEmbedMedia(null)}
        />
      )}

      {/* Enhanced Player */}
      {viewerMedia && (
        <EnhancedPlayer
          media={{
            fileName: viewerMedia.media.fileName,
            contentType: viewerMedia.media.contentType,
            description: viewerMedia.media.description,
            ownerName: String(claims.name || claims.email || "You").split("@")[0],
            ownerInitial: String(claims.name || claims.email || "U").charAt(0).toUpperCase(),
          }}
          url={viewerMedia.url}
          onClose={() => setViewerMedia(null)}
        />
      )}

      {/* Thumbnail Picker Modal */}
      {thumbPickerMediaId && urls[thumbPickerMediaId] && createPortal(
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--overlay-medium)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "var(--space-4)",
          }}
          onClick={() => !thumbUploading && setThumbPickerMediaId(null)}
        >
          <div
            className="card modal-card"
            style={{ maxWidth: "700px", width: "100%", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 className="card-title" style={{ marginBottom: 0 }}>Change Thumbnail</h2>
              <button
                onClick={() => !thumbUploading && setThumbPickerMediaId(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--gray-400)", padding: "4px", display: "flex" }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="card-body">
              {thumbUploading ? (
                <div style={{ textAlign: "center", padding: "var(--space-8)" }}>
                  <div className="loading" style={{ margin: "0 auto var(--space-4)" }}></div>
                  <p className="text-muted">Uploading thumbnail...</p>
                </div>
              ) : (
                <ThumbnailPicker
                  videoUrl={urls[thumbPickerMediaId]}
                  onCapture={handleThumbnailCapture}
                  onCancel={() => setThumbPickerMediaId(null)}
                />
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function MediaItem({
  media,
  url,
  thumbnailUrl,
  onDelete,
  onToggleVisibility,
  onToggleShowOnMediaPage,
  onShare,
  onEmbed,
  onChangeThumbnail,
  onExpand,
  shareLoading,
  isEditingDesc,
  descDraft,
  onStartEditDesc,
  onDescDraftChange,
  onSaveDesc,
  onCancelDesc,
}: {
  media: Media;
  url?: string;
  thumbnailUrl?: string;
  onDelete: () => void;
  onToggleVisibility: () => void;
  onToggleShowOnMediaPage: () => void;
  onShare: () => void;
  onEmbed: () => void;
  onChangeThumbnail: () => void;
  onExpand: () => void;
  shareLoading: boolean;
  isEditingDesc: boolean;
  descDraft: string;
  onStartEditDesc: () => void;
  onDescDraftChange: (v: string) => void;
  onSaveDesc: () => void;
  onCancelDesc: () => void;
}) {

  if (!url) return <div className="card" style={{ padding: "var(--space-8)", textAlign: "center" }}><div className="loading" style={{ margin: "0 auto" }}></div></div>;

  const isImage = media.contentType.startsWith("image/");
  const isVideo = media.contentType.startsWith("video/");
  const isAudio = media.contentType.startsWith("audio/");

  return (
    <div className="card">
      <div style={{ width: "100%", height: "200px", borderRadius: "var(--radius-lg)", overflow: "hidden", backgroundColor: "var(--bg-deep)", marginBottom: "var(--space-4)", position: "relative", cursor: (isVideo || isImage || isAudio) ? "pointer" : "default" }}
        onClick={() => {
          if (isVideo) { onExpand(); }
          else if (isImage || isAudio) { onExpand(); }
        }}
      >
        {isImage && (
          <>
            <img src={thumbnailUrl || url} alt={media.fileName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            {/* Expand overlay */}
            <div style={{
              position: "absolute", top: "var(--space-2)", right: "var(--space-2)",
              width: "32px", height: "32px", borderRadius: "50%",
              backgroundColor: "rgba(0,0,0,0.5)", display: "flex",
              alignItems: "center", justifyContent: "center",
              opacity: 0.7, transition: "opacity 0.2s",
            }} className="expand-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            </div>
          </>
        )}
        {isVideo && (
          <>
            {thumbnailUrl ? (
              <img src={thumbnailUrl} alt={media.fileName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <video src={url} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            )}
            {/* Play button overlay */}
            <div style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--overlay-light)",
              transition: "background 0.2s",
            }}>
              <div style={{
                width: "52px",
                height: "52px",
                borderRadius: "50%",
                backgroundColor: "rgba(var(--primary-rgb), 0.9)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 12px rgba(var(--primary-rgb), 0.4)",
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--btn-primary-text)" style={{ marginLeft: "2px" }}>
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              </div>
            </div>
          </>
        )}

        {isAudio && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: "var(--space-3)" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" strokeWidth="1.5">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            <audio src={url} controls style={{ width: "90%" }} />
          </div>
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
            backgroundColor: media.isPublic ? "rgba(var(--primary-rgb), 0.15)" : "rgba(var(--danger-rgb), 0.15)",
            color: media.isPublic ? "var(--success)" : "var(--danger)",
          }}>
            {media.isPublic ? "Public" : "Private"}
          </span>
        </p>

        {/* Description */}
        <div style={{ marginTop: "var(--space-2)" }}>
          {isEditingDesc ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              <textarea
                className="media-desc-input"
                rows={2}
                placeholder="Add a description..."
                value={descDraft}
                onChange={(e) => onDescDraftChange(e.target.value)}
              />
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <button className="btn-primary" style={{ fontSize: "var(--font-size-xs)", padding: "var(--space-1) var(--space-3)" }} onClick={onSaveDesc}>Save</button>
                <button className="btn-secondary" style={{ fontSize: "var(--font-size-xs)", padding: "var(--space-1) var(--space-3)" }} onClick={onCancelDesc}>Cancel</button>
              </div>
            </div>
          ) : (
            <p
              onClick={onStartEditDesc}
              style={{
                fontSize: "var(--font-size-xs)",
                color: media.description ? "var(--gray-400)" : "var(--gray-500)",
                cursor: "pointer",
                fontStyle: media.description ? "normal" : "italic",
                marginBottom: 0,
                transition: "color 0.2s ease",
              }}
              title="Click to edit description"
            >
              {media.description || "Click to add description..."}
            </p>
          )}
        </div>

        {/* Show on Media Page toggle */}
        <label className="media-visibility-toggle" style={{ marginTop: "var(--space-2)" }}>
          <input
            type="checkbox"
            checked={media.showOnMediaPage}
            onChange={onToggleShowOnMediaPage}
          />
          Show on Media Gallery
        </label>
      </div>

      <div className="media-actions">
        <button
          onClick={onToggleVisibility}
          className={media.isPublic ? "btn-secondary" : "btn-primary"}
        >
          {media.isPublic ? "Make Private" : "Make Public"}
        </button>
        {!media.isPublic && (
          <button
            onClick={onShare}
            disabled={shareLoading}
            className="btn-primary"
          >
            {shareLoading ? "..." : "Share Link"}
          </button>
        )}
        <button
          onClick={onEmbed}
          className="btn-outline"
          title="Get embed code"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: "4px", verticalAlign: "middle" }}>
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
          Embed
        </button>
        {media.contentType.startsWith("video/") && (
          <button onClick={onChangeThumbnail} className="btn-outline" title="Change thumbnail">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: "4px", verticalAlign: "middle" }}>
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            Thumbnail
          </button>
        )}
        <button onClick={onDelete} className="btn-danger">
          Delete
        </button>
      </div>
    </div>
  );
}

function EmbedModal({ media, onClose }: { media: Media; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [width, setWidth] = useState("640");
  const [height, setHeight] = useState("360");

  const embedUrl = `${window.location.origin}/embed/${media.id}`;
  const iframeCode = `<iframe src="${embedUrl}" width="${width}" height="${height}" frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>`;

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--overlay-medium)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: "600px", width: "90%", margin: "0 auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-header">
          <h2 className="card-title" style={{ marginBottom: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: "8px", verticalAlign: "middle" }}>
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
            Embed Player
          </h2>
        </div>
        <div className="card-body">
          <p className="text-muted" style={{ fontSize: "var(--font-size-sm)", marginBottom: "var(--space-4)" }}>
            Copy the embed code below and paste it into any website's HTML to embed <strong>{media.fileName}</strong>.
          </p>

          {!media.isPublic && (
            <div style={{
              padding: "var(--space-3) var(--space-4)",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "rgba(var(--warning-rgb), 0.1)",
              border: "1px solid rgba(var(--warning-rgb), 0.3)",
              color: "var(--warning)",
              fontSize: "var(--font-size-sm)",
              marginBottom: "var(--space-4)",
            }}>
              ⚠ This media is currently <strong>private</strong>. The embed will not work until you make it public.
            </div>
          )}

          {/* Size controls */}
          <div className="embed-size-controls">
            <div style={{ flex: 1, minWidth: "80px" }}>
              <label style={{ fontSize: "var(--font-size-xs)", marginBottom: "var(--space-1)" }}>Width (px)</label>
              <input
                type="number"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--font-size-sm)" }}
              />
            </div>
            <div style={{ flex: 1, minWidth: "80px" }}>
              <label style={{ fontSize: "var(--font-size-xs)", marginBottom: "var(--space-1)" }}>Height (px)</label>
              <input
                type="number"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--font-size-sm)" }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--space-2)" }}>
              {[
                { label: "SD", w: "640", h: "360" },
                { label: "HD", w: "1280", h: "720" },
              ].map((preset) => (
                <button
                  key={preset.label}
                  className="btn-secondary"
                  style={{ fontSize: "var(--font-size-xs)", padding: "var(--space-2) var(--space-3)" }}
                  onClick={() => { setWidth(preset.w); setHeight(preset.h); }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Iframe code */}
          <label style={{ fontSize: "var(--font-size-xs)", marginBottom: "var(--space-1)" }}>Embed Code</label>
          <div style={{ position: "relative" }}>
            <textarea
              readOnly
              value={iframeCode}
              rows={3}
              style={{
                width: "100%",
                padding: "var(--space-3)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-color)",
                backgroundColor: "var(--bg-elevated)",
                color: "var(--gray-900)",
                fontSize: "var(--font-size-sm)",
                fontFamily: "'Courier New', Courier, monospace",
                resize: "none",
              }}
              onFocus={(e) => e.target.select()}
            />
            <button
              className="btn-primary"
              style={{
                position: "absolute",
                top: "var(--space-2)",
                right: "var(--space-2)",
                fontSize: "var(--font-size-xs)",
                padding: "var(--space-1) var(--space-3)",
              }}
              onClick={() => copyToClipboard(iframeCode, "iframe")}
            >
              {copied === "iframe" ? "Copied!" : "Copy"}
            </button>
          </div>

          {/* Direct URL */}
          <label style={{ fontSize: "var(--font-size-xs)", marginBottom: "var(--space-1)", marginTop: "var(--space-4)", display: "block" }}>Direct Player URL</label>
          <div style={{
            display: "flex",
            gap: "var(--space-2)",
            alignItems: "center",
          }}>
            <input
              type="text"
              readOnly
              value={embedUrl}
              style={{
                flex: 1,
                padding: "var(--space-3)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-color)",
                backgroundColor: "var(--bg-elevated)",
                color: "var(--gray-900)",
                fontSize: "var(--font-size-sm)",
              }}
              onFocus={(e) => e.target.select()}
            />
            <button
              className="btn-primary"
              style={{ whiteSpace: "nowrap", fontSize: "var(--font-size-sm)" }}
              onClick={() => copyToClipboard(embedUrl, "url")}
            >
              {copied === "url" ? "Copied!" : "Copy"}
            </button>
          </div>

          {/* Preview */}
          <label style={{ fontSize: "var(--font-size-xs)", marginBottom: "var(--space-1)", marginTop: "var(--space-4)", display: "block" }}>Preview</label>
          <div style={{
            borderRadius: "var(--radius-md)",
            overflow: "hidden",
            border: "1px solid var(--border-color)",
            backgroundColor: "var(--bg-deep)",
            maxHeight: "300px",
          }}>
            <iframe
              src={embedUrl}
              width="100%"
              height="250"
              style={{ border: "none", display: "block" }}
              allow="autoplay; fullscreen"
              allowFullScreen
            />
          </div>

          <div style={{ marginTop: "var(--space-4)", textAlign: "right" }}>
            <button
              className="btn-secondary"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
