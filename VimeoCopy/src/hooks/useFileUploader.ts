import { useState, useRef, useCallback } from "react";
import { useAuth } from "../Auth/useAuth";
import { API_BASE_URL } from "../config";
import { generateThumbnail } from "../utils/thumbnailGenerator";

/* ── Types ─────────────────────────────────── */

export interface FileEntry {
  id: string;
  file: File;
  status: "queued" | "uploading" | "completing" | "done" | "error";
  progress: number;
  message: string;
  isPublic: boolean;
  /** Populated after upload completes successfully */
  mediaId?: string;
  /** User-picked thumbnail blob (overrides auto-generation) */
  customThumbnail?: Blob;
}

export interface UseFileUploaderOptions {
  /** Optional project ID — media will be auto-linked on the backend */
  projectId?: string;
}

let entryCounter = 0;

/* ── Constants ─────────────────────────────── */

const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/mpeg",
  "audio/mpeg",
  "audio/ogg",
];

const ALLOWED_EXTENSIONS = ["png", "jpg", "jpeg", "mp3", "mp4", "webm", "mov", "mpeg", "ogg"];

export const ACCEPT_STRING = [
  ...ALLOWED_MIME_TYPES,
  ...ALLOWED_EXTENSIONS.map((e) => `.${e}`),
].join(",");

function getExtension(fileName: string) {
  const parts = fileName.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

function isValidFile(f: File) {
  if (!f) return false;
  const type = f.type || "";
  if (type && ALLOWED_MIME_TYPES.includes(type)) return true;
  if (
    type &&
    (type.startsWith("image/") || type.startsWith("video/") || type.startsWith("audio/"))
  ) {
    return ALLOWED_EXTENSIONS.includes(getExtension(f.name));
  }
  return ALLOWED_EXTENSIONS.includes(getExtension(f.name));
}

/* ── Hook ──────────────────────────────────── */

export function useFileUploader(options: UseFileUploaderOptions = {}) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [globalPublic, setGlobalPublicRaw] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const { authFetch } = useAuth();

  /* ── Helpers ──────────────── */

  function updateEntry(id: string, patch: Partial<FileEntry>) {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  /* ── Add files ────────────── */

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const newEntries: FileEntry[] = [];
      const invalid: string[] = [];

      for (const f of Array.from(incoming)) {
        if (isValidFile(f)) {
          newEntries.push({
            id: `file-${++entryCounter}`,
            file: f,
            status: "queued",
            progress: 0,
            message: "",
            isPublic: globalPublic,
          });
        } else {
          invalid.push(f.name);
        }
      }

      if (invalid.length > 0) {
        alert(`Skipped invalid files:\n${invalid.join("\n")}`);
      }

      if (newEntries.length > 0) {
        setFiles((prev) => [...prev, ...newEntries]);
      }
    },
    [globalPublic]
  );

  /* ── Remove / toggle ──────── */

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function toggleFilePublic(id: string) {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, isPublic: !f.isPublic } : f))
    );
  }

  function setCustomThumbnail(id: string, blob: Blob | undefined) {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, customThumbnail: blob } : f))
    );
  }

  function setGlobalPublic(value: boolean) {
    setGlobalPublicRaw(value);
    setFiles((prev) =>
      prev.map((f) => (f.status === "queued" ? { ...f, isPublic: value } : f))
    );
  }

  /* ── Upload all ───────────── */

  async function handleUploadAll() {
    const queued = files.filter((f) => f.status === "queued");
    if (queued.length === 0) return;

    setUploading(true);
    const uploadedMediaIds: string[] = [];

    try {
      // Get batch presigned URLs
      const presignRes = await authFetch(`${API_BASE_URL}/api/Upload/urls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: queued.length }),
      });

      if (!presignRes.ok) throw new Error("Failed to get upload URLs");

      const presignedUrls: { url: string; mediaId: string; thumbnailUploadUrl: string }[] = await presignRes.json();

      // Upload each file in parallel
      const uploads = queued.map(async (entry, idx) => {
        const { url, mediaId, thumbnailUploadUrl } = presignedUrls[idx];

        try {
          updateEntry(entry.id, { status: "uploading", progress: 5 });

          // Use custom thumbnail if user picked one, otherwise auto-generate
          const thumbnailPromise = entry.customThumbnail
            ? Promise.resolve(entry.customThumbnail)
            : generateThumbnail(entry.file);

          // Upload to S3 via XMLHttpRequest for progress tracking
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("PUT", url, true);
            xhr.setRequestHeader("Content-Type", "application/octet-stream");

            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 85);
                updateEntry(entry.id, { progress: pct });
              }
            };

            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) resolve();
              else reject(new Error(`S3 upload failed (${xhr.status})`));
            };

            xhr.onerror = () => reject(new Error("Network error during upload"));
            xhr.send(entry.file);
          });

          // Upload thumbnail if generated
          updateEntry(entry.id, { progress: 90 });
          let hasThumbnail = false;
          try {
            const thumbBlob = await thumbnailPromise;
            if (thumbBlob && thumbnailUploadUrl) {
              const thumbXhr = new XMLHttpRequest();
              await new Promise<void>((resolve, reject) => {
                thumbXhr.open("PUT", thumbnailUploadUrl, true);
                thumbXhr.setRequestHeader("Content-Type", "image/jpeg");
                thumbXhr.onload = () => {
                  if (thumbXhr.status >= 200 && thumbXhr.status < 300) {
                    hasThumbnail = true;
                    resolve();
                  } else {
                    resolve(); // thumbnail failure is non-fatal
                  }
                };
                thumbXhr.onerror = () => resolve(); // non-fatal
                thumbXhr.send(thumbBlob);
              });
            }
          } catch {
            // thumbnail generation/upload failure is non-fatal
          }

          // Complete upload
          updateEntry(entry.id, { status: "completing", progress: 95 });

          const completeBody: Record<string, unknown> = {
            mediaId,
            fileSize: entry.file.size,
            contentType: entry.file.type,
            isPublic: entry.isPublic,
            hasThumbnail,
            fileName: entry.file.name,
          };

          if (options.projectId) {
            completeBody.projectId = options.projectId;
          }

          const completeRes = await authFetch(`${API_BASE_URL}/api/Upload/complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(completeBody),
          });

          if (!completeRes.ok) {
            const errBody = await completeRes.json().catch(() => null);
            throw new Error(errBody?.message || "Failed to complete upload");
          }

          updateEntry(entry.id, { status: "done", progress: 100, message: "Uploaded", mediaId });
          uploadedMediaIds.push(mediaId);
        } catch (err) {
          updateEntry(entry.id, {
            status: "error",
            progress: 0,
            message: err instanceof Error ? err.message : "Upload failed",
          });
        }
      });

      await Promise.all(uploads);
    } catch (err) {
      for (const entry of queued) {
        updateEntry(entry.id, {
          status: "error",
          message: err instanceof Error ? err.message : "Upload failed",
        });
      }
    } finally {
      setUploading(false);
    }

    return uploadedMediaIds;
  }

  /* ── Counts ───────────────── */

  const queuedCount = files.filter((f) => f.status === "queued").length;
  const doneCount = files.filter((f) => f.status === "done").length;
  const errorCount = files.filter((f) => f.status === "error").length;

  function clearCompleted() {
    setFiles((prev) => prev.filter((f) => f.status !== "done"));
  }

  function clearAll() {
    setFiles([]);
  }

  return {
    files,
    uploading,
    globalPublic,
    setGlobalPublic,
    inputRef,
    addFiles,
    removeFile,
    toggleFilePublic,
    setCustomThumbnail,
    handleUploadAll,
    queuedCount,
    doneCount,
    errorCount,
    clearCompleted,
    clearAll,
  };
}
