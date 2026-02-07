import { useState } from "react";
import { useAuth } from "../Auth/useAuth";
import { API_BASE_URL } from "../config";

export function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
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

  // Build the accept string from the allowed MIME types and extensions
  const accept = [...allowedMimeTypes, ...allowedExtensions.map((e) => `.${e}`)].join(",");

  function isValidFile(f: File) {
    if (!f) return false;

    const type = f.type || "";

    // If browser reports a specific media MIME type, prefer that
    if (type) {
      if (allowedMimeTypes.includes(type)) return true;

      // allow general categories (image/video/audio) but still require a known extension
      if (
        type.startsWith("image/") ||
        type.startsWith("video/") ||
        type.startsWith("audio/")
      ) {
        const ext = getExtension(f.name);
        return allowedExtensions.includes(ext);
      }
    }

    // Fallback to extension-only check when MIME is empty or untrusted
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
      return;
    }

    setUploading(true);
    setMessage("");

    try {
      // 1) Взимаме pre-signed URL от backend-а
      const presignRes = await authFetch(`${API_BASE_URL}/api/Upload/url`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!presignRes.ok) {
        throw new Error("Failed to get pre-signed URL");
      }

      const { url, mediaId } = await presignRes.json();

      // 2) Качваме файла директно в S3
      const putRes = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      });

      if (!putRes.ok) {
        throw new Error("Upload to S3 failed");
      }

      // 3) Казваме на backend-а, че upload-ът е завършен
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
      setMessage(`Upload complete! Media ID: ${media.id}`);

    } catch (err: unknown) {
      if (err instanceof Error) {
        setMessage(err.message);
      } else {
        setMessage("Unexpected error");
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Upload File</h2>

      <input
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
            setFile(null);
            e.currentTarget.value = "";
            return;
          }

          setMessage("");
          setFile(selected);
        }}
      />

      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        style={{ marginLeft: 10 }}
      >
        {uploading ? "Uploading..." : "Upload"}
      </button>

      {message && <p>{message}</p>}
    </div>
  );
}
