import { useState } from "react";
import { useAuth } from "../Auth/useAuth";
import { API_BASE_URL } from "../config";
import "../App.css";

export function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");
  const { authFetch } = useAuth();

  const allowedMimeTypes = [
    "image/png",
    "image/jpeg",
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/mpeg",
    "audio/mpeg",
    "audio/ogg",
  ];

  const allowedExtensions = [
    "png",
    "jpg",
    "jpeg",
    "mp3",
    "mp4",
    "webm",
    "mov",
    "mpeg",
    "ogg",
  ];

  const accept = [...allowedMimeTypes, ...allowedExtensions.map((e) => `.${e}`)].join(",");

  function isValidFile(f: File) {
    if (!f) return false;

    const type = f.type || "";

    if (type) {
      if (allowedMimeTypes.includes(type)) return true;

      if (
        type.startsWith("image/") ||
        type.startsWith("video/") ||
        type.startsWith("audio/")
      ) {
        const ext = getExtension(f.name);
        return allowedExtensions.includes(ext);
      }
    }

    const ext = getExtension(f.name);
    return allowedExtensions.includes(ext);
  }

  function getExtension(fileName: string) {
    const parts = fileName.split(".");
    return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
  }

  async function handleUpload() {
    if (!file) return;

    if (!isValidFile(file)) {
      setMessage("Invalid file type — upload blocked.");
      setMessageType("error");
      return;
    }

    setUploading(true);
    setMessage("");

    try {
      const presignRes = await authFetch(`${API_BASE_URL}/api/Upload/url`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!presignRes.ok) {
        throw new Error("Failed to get pre-signed URL");
      }

      const { url, mediaId } = await presignRes.json();

      const putRes = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      });

      if (!putRes.ok) {
        throw new Error("Upload to S3 failed");
      }

      const completeRes = await authFetch(`${API_BASE_URL}/api/Upload/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaId: mediaId,
          fileSize: file.size,
          contentType: file.type,
        }),
      });

      if (!completeRes.ok) {
        throw new Error("Failed to complete upload");
      }

      const media = await completeRes.json();
      setMessage(`Upload successful! Media ID: ${media.id}`);
      setMessageType("success");
      setFile(null);

    } catch (err: unknown) {
      if (err instanceof Error) {
        setMessage(err.message);
      } else {
        setMessage("Unexpected error");
      }
      setMessageType("error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: "600px", margin: "0 auto" }}>
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Upload Your Media</h2>
          <p className="text-muted" style={{ marginBottom: 0, fontSize: "var(--font-size-sm)" }}>
            Share your content with the world. Supported formats: MP4, WebM, MOV, PNG, JPG, MP3, OGG
          </p>
        </div>

        <div className="card-body">
          <div className="form-group">
            <label htmlFor="file-input">Choose File</label>
            <div style={{
              position: "relative",
              border: "2px dashed rgba(34, 197, 94, 0.3)",
              borderRadius: "var(--radius-lg)",
              padding: "var(--space-8)",
              textAlign: "center",
              backgroundColor: "rgba(34, 197, 94, 0.03)",
              cursor: "pointer",
              transition: "var(--transition)",
            }}>
              <input
                id="file-input"
                type="file"
                accept={accept}
                onChange={(e) => {
                  const selected = e.target.files?.[0] ?? null;
                  if (!selected) {
                    setFile(null);
                    return;
                  }

                  if (!isValidFile(selected)) {
                    setMessage(
                      "Invalid file type. Allowed: png, jpg, jpeg, mp3, mp4, webm, mov, mpeg, ogg"
                    );
                    setMessageType("error");
                    setFile(null);
                    e.currentTarget.value = "";
                    return;
                  }

                  setMessage("");
                  setFile(selected);
                }}
                style={{ display: "none" }}
              />
              <label htmlFor="file-input" style={{ cursor: "pointer", display: "block" }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" style={{ margin: "0 auto var(--space-4)" }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <p style={{ fontWeight: 500, marginBottom: "var(--space-1)" }}>
                  {file ? file.name : "Click or drag to upload"}
                </p>
                <p className="text-muted" style={{ fontSize: "var(--font-size-sm)" }}>
                  Choose a media file from your device
                </p>
              </label>
            </div>

            {file && (
              <div style={{ marginTop: "var(--space-4)", padding: "var(--space-4)", backgroundColor: "var(--bg-elevated)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
                <p style={{ color: "var(--gray-600)", fontSize: "var(--font-size-sm)", margin: 0 }}>
                  <strong>{file.name}</strong> ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              </div>
            )}
          </div>

          {message && (
            <div className={`alert ${messageType === "success" ? "alert-success" : "alert-error"}`}>
              {message}
            </div>
          )}

          <div className="form-actions">
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="btn-primary"
              style={{ flex: 1 }}
            >
              {uploading ? "Publishing..." : "Publish Media"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
