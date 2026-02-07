import { useEffect, useState } from "react";
import { useAuth } from "../Auth/useAuth";
import { API_BASE_URL } from "../config";

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

  if (!user) return <div>Loading...</div>;

  return (
    <div style={{ padding: 20 }}>
      <h1>Profile</h1>
      <p>Email: {user.email}</p>

      <h2>Your Media</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 20,
        }}
      >
        {user.media.map((m) => (
          <MediaItem
            key={m.id}
            media={m}
            url={urls[m.id]}
            onDelete={() => handleDeleteMedia(m.id)}
          />
        ))}
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
  if (!url) return <div>Loading...</div>;

  const style: React.CSSProperties = {
    width: "100%",
    borderRadius: 8,
    maxHeight: "50vh",
    objectFit: "contain",
    backgroundColor: "#000",
  };

  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  };

  const buttonStyle: React.CSSProperties = {
    padding: "8px 12px",
    backgroundColor: "#e74c3c",
    color: "white",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: "14px",
  };

  return (
    <div style={containerStyle}>
      {media.contentType.startsWith("image/") ? (
        <img src={url} style={style} />
      ) : (
        <video src={url} controls style={style} />
      )}
      <button onClick={onDelete} style={buttonStyle}>
        Delete
      </button>
    </div>
  );
}
