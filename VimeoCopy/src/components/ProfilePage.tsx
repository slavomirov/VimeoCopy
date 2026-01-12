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
          <MediaItem key={m.id} media={m} url={urls[m.id]} />
        ))}
      </div>
    </div>
  );
}

function MediaItem({ media, url }: { media: Media; url?: string }) {
  if (!url) return <div>Loading...</div>;

  const style: React.CSSProperties = {
    width: "100%",
    borderRadius: 8,
    maxHeight: "50vh",
    objectFit: "contain",
    backgroundColor: "#000",
  };

  if (media.contentType.startsWith("image/")) {
    return <img src={url} style={style} />;
  }

  return <video src={url} controls style={style} />;
}
