import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { API_BASE_URL } from "../config";
import { ProwMark } from "../brand/FerryMarks";

interface MediaUrl {
  url: string;
  contentType: string;
  thumbnailUrl?: string;
}

export function EmbedPlayer() {
  const { mediaId } = useParams<{ mediaId: string }>();
  const [data, setData] = useState<MediaUrl | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/media/${mediaId}/url?source=embed`);
        if (!res.ok) {
          throw new Error("Media not found or unavailable.");
        }
        const json: MediaUrl = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load media.");
      } finally {
        setLoading(false);
      }
    }
    if (mediaId) load();
  }, [mediaId]);

  if (loading) {
    return (
      <div className="embed-container embed-loading">
        <div className="embed-spinner" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="embed-container embed-error">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
        <p>{error || "Media unavailable"}</p>
      </div>
    );
  }

  const isVideo = data.contentType.startsWith("video/");
  const isImage = data.contentType.startsWith("image/");
  const isAudio = data.contentType.startsWith("audio/");

  return (
    <div className="embed-container">
      {isVideo && (
        <video
          src={data.url}
          controls
          autoPlay
          poster={data.thumbnailUrl || undefined}
          className="embed-media"
          controlsList="nodownload noplaybackrate"
          onContextMenu={(e) => e.preventDefault()}
        />
      )}
      {isImage && (
        <img
          src={data.url}
          alt="Embedded media"
          className="embed-media"
          onContextMenu={(e) => e.preventDefault()}
        />
      )}
      {isAudio && (
        <audio
          src={data.url}
          controls
          autoPlay
          style={{ width: "100%" }}
          controlsList="nodownload"
        />
      )}

      <a
        href={window.location.origin}
        target="_blank"
        rel="noopener noreferrer"
        className="embed-watermark"
      >
        <ProwMark size={14} minimal />
        Ferry
      </a>
    </div>
  );
}
