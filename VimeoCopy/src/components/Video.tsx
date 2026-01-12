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

export function Videos() {
  const [items, setItems] = useState<Media[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Media | null>(null);
  const { authFetch } = useAuth();

  // Load media list
  useEffect(() => {
    async function load() {
      const res = await authFetch(`${API_BASE_URL}/api/media`);
      const data = await res.json();
      setItems(data);
    }
    load();
  }, [authFetch]);

  // Load URLs for all media items ONCE
  useEffect(() => {
    async function loadAllUrls() {
      const newUrls: Record<string, string> = {};

      for (const m of items) {
        const res = await authFetch(`${API_BASE_URL}/api/media/${m.id}/url`);
        const data = await res.json();
        newUrls[m.id] = data.url;
      }

      setUrls(newUrls);
    }

    if (items.length > 0) loadAllUrls();
  }, [items, authFetch]);

  return (
    <div style={{ padding: 20 }}>
      <h1>Media Gallery</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 20,
        }}
      >
        {items.map((m) => (
          <MediaItem
            key={m.id}
            media={m}
            url={urls[m.id]}
            onClick={() => setSelected(m)}
          />
        ))}
      </div>

      {selected && (
        <FullscreenViewer
          media={selected}
          url={urls[selected.id]}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function MediaItem({
  media,
  url,
  onClick,
}: {
  media: Media;
  url?: string;
  onClick: () => void;
}) {
  if (!url) return <div>Loading...</div>;

  const commonStyle: React.CSSProperties = {
    maxHeight: "50vh",
    width: "100%",
    height: "auto",
    objectFit: "contain",
    borderRadius: 8,
    backgroundColor: "#000",
    cursor: "pointer",
    display: "block",
  };

  if (media.contentType.startsWith("image/")) {
    return <img src={url} style={commonStyle} onClick={onClick} />;
  }

  if (media.contentType.startsWith("video/")) {
    return (
      <video
        src={url}
        controls
        controlsList="nodownload noplaybackrate"
        onContextMenu={(e) => e.preventDefault()}
        style={commonStyle}
        onClick={onClick}
      />
    );
  }

  return <div>Unsupported file</div>;
}

function FullscreenViewer({
  media,
  url,
  onClose,
}: {
  media: Media;
  url?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!url) return null;

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.9)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    cursor: "zoom-out",
  };

  const mediaStyle: React.CSSProperties = {
    maxWidth: "90vw",
    maxHeight: "90vh",
    objectFit: "contain",
    borderRadius: 8,
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      {media.contentType.startsWith("image/") ? (
        <img src={url} style={mediaStyle} />
      ) : (
        <video
          src={url}
          controls
          autoPlay
          style={mediaStyle}
          controlsList="nodownload noplaybackrate"
          onContextMenu={(e) => e.preventDefault()}
        />
      )}
    </div>
  );
}
