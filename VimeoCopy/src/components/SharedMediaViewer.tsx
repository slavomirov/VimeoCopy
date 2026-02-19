import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { API_BASE_URL } from "../config";
import "../App.css";

interface SharedMediaData {
  url: string;
  contentType: string;
  expiresAt: string;
  thumbnailUrl?: string;
}

export function SharedMediaViewer() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedMediaData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/shared/view/${token}`);
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.message ?? "This link is invalid or has expired.");
        }
        const json: SharedMediaData = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load shared media.");
      } finally {
        setLoading(false);
      }
    }
    if (token) load();
  }, [token]);

  if (loading) {
    return (
      <div className="container" style={{ textAlign: "center", padding: "var(--space-16)" }}>
        <div className="loading" style={{ margin: "0 auto" }}></div>
        <p className="text-muted" style={{ marginTop: "var(--space-4)" }}>Loading shared media...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container" style={{ maxWidth: "600px", margin: "0 auto" }}>
        <div className="card" style={{ textAlign: "center", padding: "var(--space-12)" }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" style={{ margin: "0 auto var(--space-4)" }}>
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
          <h2 style={{ marginBottom: "var(--space-2)" }}>Link Expired or Invalid</h2>
          <p className="text-muted">{error || "This shared link is no longer available."}</p>
        </div>
      </div>
    );
  }

  const expiresDate = new Date(data.expiresAt);
  const isImage = data.contentType.startsWith("image/");
  const isAudio = data.contentType.startsWith("audio/");

  return (
    <div className="container" style={{ maxWidth: "900px", margin: "0 auto" }}>
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Shared Media</h2>
          <p className="text-muted" style={{ marginBottom: 0, fontSize: "var(--font-size-sm)" }}>
            This link expires on {expiresDate.toLocaleString()}
          </p>
        </div>

        <div className="card-body" style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
          {isImage ? (
            <img
              src={data.url}
              alt="Shared media"
              style={{
                maxWidth: "100%",
                maxHeight: "70vh",
                objectFit: "contain",
                borderRadius: "var(--radius-lg)",
              }}
            />
          ) : isAudio ? (
            <audio
              src={data.url}
              controls
              style={{ width: "100%" }}
              controlsList="nodownload"
            />
          ) : (
            <video
              src={data.url}
              controls
              autoPlay
              poster={data.thumbnailUrl || undefined}
              style={{
                maxWidth: "100%",
                maxHeight: "70vh",
                objectFit: "contain",
                borderRadius: "var(--radius-lg)",
              }}
              controlsList="nodownload noplaybackrate"
              onContextMenu={(e) => e.preventDefault()}
            />
          )}
        </div>
      </div>
    </div>
  );
}
