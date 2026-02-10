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
    <div className="container">
      <div style={{ marginBottom: "var(--space-8)" }}>
        <h1>Media Gallery</h1>
        <p className="text-muted">{items.length} files in total</p>
      </div>

      {items.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "var(--space-12)" }}>
          <p className="text-muted">No media files available. <a href="/upload">Upload one now</a></p>
        </div>
      ) : (
        <div className="grid grid-2">
          {items.map((m) => (
            <MediaItem
              key={m.id}
              media={m}
              url={urls[m.id]}
              onClick={() => setSelected(m)}
            />
          ))}
        </div>
      )}

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
  if (!url) return (
    <div className="card" style={{ padding: "var(--space-8)", textAlign: "center" }}>
      <div className="loading" style={{ margin: "0 auto" }}></div>
    </div>
  );

  return (
    <div
      className="card"
      onClick={onClick}
      style={{ cursor: "pointer", overflow: "hidden" }}
    >
      <div
        style={{
          width: "100%",
          height: "200px",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          backgroundColor: "var(--bg-deep)",
          marginBottom: "var(--space-4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {media.contentType.startsWith("image/") ? (
          <img
            src={url}
            alt={media.fileName}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <video
            src={url}
            controls
            controlsList="nodownload noplaybackrate"
            onContextMenu={(e) => e.preventDefault()}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        )}
      </div>

      <div>
        <p style={{ fontWeight: 500, marginBottom: "var(--space-1)", fontSize: "var(--font-size-sm)" }}>
          {media.fileName}
        </p>
        <p className="text-muted" style={{ fontSize: "var(--font-size-xs)", marginBottom: 0 }}>
          {(media.fileSize / (1024 * 1024)).toFixed(2)} MB · {new Date(media.uploadedAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
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

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.95)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        cursor: "zoom-out",
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: "absolute",
          top: "var(--space-4)",
          right: "var(--space-4)",
          cursor: "pointer",
        }}
        onClick={onClose}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </div>

      {media.contentType.startsWith("image/") ? (
        <img
          src={url}
          alt={media.fileName}
          style={{
            maxWidth: "90vw",
            maxHeight: "90vh",
            objectFit: "contain",
            borderRadius: "var(--radius-lg)",
          }}
        />
      ) : (
        <video
          src={url}
          controls
          autoPlay
          style={{
            maxWidth: "90vw",
            maxHeight: "90vh",
            objectFit: "contain",
            borderRadius: "var(--radius-lg)",
          }}
          controlsList="nodownload noplaybackrate"
          onContextMenu={(e) => e.preventDefault()}
        />
      )}
    </div>
  );
}
