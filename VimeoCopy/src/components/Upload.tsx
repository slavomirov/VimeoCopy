import { useState } from "react";
import { useAuth } from "../Auth/useAuth";
import { API_BASE_URL } from "../config";

export function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const { authFetch } = useAuth();

  async function handleUpload() {
    if (!file) return;

    setUploading(true);
    setMessage("");

    try {
      // 1) Взимаме pre-signed URL от backend-а
      const presignRes = await authFetch(`${API_BASE_URL}/api/Upload/url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name
        }),
      });

      if (!presignRes.ok) {
        throw new Error("Failed to get pre-signed URL");
      }

      const { url } = await presignRes.json(); //+ new fileName generated from BE

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
          fileName: file.name,
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
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
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
