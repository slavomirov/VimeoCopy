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
}

interface UserData {
  id: string;
  email: string;
  media: Media[];
}

export function ProfilePage() {
  const { authFetch, claims } = useAuth();
  const [user, setUser] = useState<UserData | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});

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
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MediaItem({
  media,
  url,
  onDelete,
}: {
  media: Media;
  url?: string;
  onDelete: () => void;
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
        <p className="text-muted" style={{ fontSize: "var(--font-size-xs)", marginBottom: 0 }}>
          Status: <span style={{ color: "var(--success)", fontWeight: 600 }}>{media.status || 'Ready'}</span>
        </p>
      </div>

      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <button onClick={onDelete} className="btn-danger" style={{ flex: 1, fontSize: "var(--font-size-sm)" }}>
          Delete
        </button>
      </div>
    </div>
  );
}
