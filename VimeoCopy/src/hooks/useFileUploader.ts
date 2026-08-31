import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "../Auth/useAuth";
import { API_BASE_URL } from "../config";
import { generateThumbnail } from "../utils/thumbnailGenerator";
import toast from "react-hot-toast";

/* ── Types ─────────────────────────────────── */

export interface FileEntry {
  id: string;
  file: File;
  /** Content type the server agreed to at presign time, resolved from MIME or extension. */
  contentType: string;
  status: "queued" | "uploading" | "completing" | "done" | "error";
  progress: number;
  message: string;
  isPublic: boolean;
  /** Populated after upload completes successfully */
  mediaId?: string;
  /** User-picked thumbnail blob (overrides auto-generation) */
  customThumbnail?: Blob;
  /** Optional project this file should be linked to on completion. */
  projectId?: string;
}

export interface UseFileUploaderOptions {
  /** Optional project ID — media will be auto-linked on the backend */
  projectId?: string;
}

let entryCounter = 0;

/* ── Constants ─────────────────────────────── */

/**
 * Fallback only. The real list comes from GET /api/upload/allowed-types — keeping a second
 * hand-maintained copy here is what let the client accept audio the server rejected, so every MP3
 * uploaded in full and then failed at the confirm step.
 */
const FALLBACK_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/mpeg",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
];

const EXTENSION_BY_MIME: Record<string, string[]> = {
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/webp": ["webp"],
  "video/mp4": ["mp4"],
  "video/webm": ["webm"],
  "video/quicktime": ["mov"],
  "video/mpeg": ["mpeg", "mpg"],
  "audio/mpeg": ["mp3"],
  "audio/ogg": ["ogg"],
  "audio/wav": ["wav"],
};

/** How many files upload at once. Unlimited parallel transfers starve each other's bandwidth. */
const MAX_CONCURRENT_UPLOADS = 3;

/** Server cap on one presign batch; the client chunks to match instead of over-asking. */
const PRESIGN_BATCH_SIZE = 20;

function extensionsFor(mimeTypes: string[]) {
  return [...new Set(mimeTypes.flatMap((m) => EXTENSION_BY_MIME[m] ?? []))];
}

export function acceptStringFor(mimeTypes: string[]) {
  return [...mimeTypes, ...extensionsFor(mimeTypes).map((e) => `.${e}`)].join(",");
}

/** Used until the server's list arrives. */
export const ACCEPT_STRING = acceptStringFor(FALLBACK_MIME_TYPES);

function getExtension(fileName: string) {
  const parts = fileName.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

/**
 * Resolves the content type the server will be asked to accept. Browsers sometimes report an empty
 * or wrong type, so fall back to the extension — and return null when we can't land on something
 * the server allows, rather than uploading a file that is certain to be rejected at the end.
 */
function resolveContentType(f: File, allowed: string[]): string | null {
  const type = (f.type || "").toLowerCase();
  if (allowed.includes(type)) return type;

  const ext = getExtension(f.name);
  const byExtension = allowed.find((mime) => (EXTENSION_BY_MIME[mime] ?? []).includes(ext));
  return byExtension ?? null;
}

/* ── Hook ──────────────────────────────────── */

export function useFileUploader(options: UseFileUploaderOptions = {}) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [globalPublic, setGlobalPublicRaw] = useState(true);
  const [allowedTypes, setAllowedTypes] = useState<string[]>(FALLBACK_MIME_TYPES);
  const inputRef = useRef<HTMLInputElement>(null);
  // In-flight transfers, so removing a file can actually stop it.
  const xhrsRef = useRef<Map<string, XMLHttpRequest>>(new Map());
  const { authFetch } = useAuth();

  // The server owns the allowlist; ask it once and build the file picker from the answer.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/upload/allowed-types`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.contentTypes) && data.contentTypes.length > 0) {
          setAllowedTypes(data.contentTypes);
        }
      } catch {
        /* keep the fallback list */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ── Helpers ──────────────── */

  function updateEntry(id: string, patch: Partial<FileEntry>) {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  /* ── Add files ────────────── */

  const addFiles = useCallback(
    (incoming: FileList | File[], projectId?: string) => {
      const newEntries: FileEntry[] = [];
      const invalid: string[] = [];

      for (const f of Array.from(incoming)) {
        const contentType = resolveContentType(f, allowedTypes);
        if (contentType) {
          newEntries.push({
            id: `file-${++entryCounter}`,
            file: f,
            contentType,
            status: "queued",
            progress: 0,
            message: "",
            isPublic: globalPublic,
            projectId,
          });
        } else {
          invalid.push(f.name);
        }
      }

      if (invalid.length > 0) {
        toast.error(
          invalid.length === 1
            ? `${invalid[0]} isn't a supported file type.`
            : `${invalid.length} files aren't supported types and were skipped.`
        );
      }

      if (newEntries.length > 0) {
        setFiles((prev) => [...prev, ...newEntries]);
      }
    },
    [globalPublic, allowedTypes]
  );

  /* ── Remove / toggle ──────── */

  function removeFile(id: string) {
    // Actually stop the transfer. Dropping the row from state used to leave the XHR running,
    // so a "cancelled" upload kept consuming the connection to the end.
    const xhr = xhrsRef.current.get(id);
    if (xhr) {
      xhr.abort();
      xhrsRef.current.delete(id);
    }
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
      // The server caps a batch at 20, so chunk to match. Asking for more used to return fewer
      // URLs than files, and the missing entries failed the whole batch — including the files
      // that would have uploaded fine.
      const presignedUrls: { url: string; mediaId: string; thumbnailUploadUrl: string }[] = [];

      for (let i = 0; i < queued.length; i += PRESIGN_BATCH_SIZE) {
        const chunk = queued.slice(i, i + PRESIGN_BATCH_SIZE);

        const presignRes = await authFetch(`${API_BASE_URL}/api/Upload/urls`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentTypes: chunk.map((f) => f.contentType) }),
          silent: true,
        });

        if (!presignRes.ok) {
          const body = await presignRes.json().catch(() => null);
          throw new Error(body?.message || "Couldn't start the upload. Please try again.");
        }

        presignedUrls.push(...(await presignRes.json()));
      }

      const uploadOne = async (entry: FileEntry, idx: number) => {
        const slot = presignedUrls[idx];
        if (!slot) return; // defensive: chunking above keeps these aligned

        const { url, mediaId, thumbnailUploadUrl } = slot;

        try {
          updateEntry(entry.id, { status: "uploading", progress: 5 });

          // Use custom thumbnail if user picked one, otherwise auto-generate
          const thumbnailPromise = entry.customThumbnail
            ? Promise.resolve(entry.customThumbnail)
            : generateThumbnail(entry.file);

          // Upload to S3 via XMLHttpRequest for progress tracking
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhrsRef.current.set(entry.id, xhr);
            xhr.open("PUT", url, true);
            xhr.setRequestHeader("Content-Type", "application/octet-stream");

            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 85);
                updateEntry(entry.id, { progress: pct });
              }
            };

            xhr.onload = () => {
              xhrsRef.current.delete(entry.id);
              if (xhr.status >= 200 && xhr.status < 300) resolve();
              else reject(new Error(`Storage rejected the upload (${xhr.status}).`));
            };

            xhr.onerror = () => {
              xhrsRef.current.delete(entry.id);
              reject(new Error("The connection dropped during upload."));
            };

            xhr.onabort = () => {
              xhrsRef.current.delete(entry.id);
              reject(new Error("Upload cancelled."));
            };

            xhr.send(entry.file);
          });

          // Upload thumbnail if generated
          updateEntry(entry.id, { progress: 90 });
          let hasThumbnail = false;
          try {
            const thumbBlob = await thumbnailPromise;
            if (thumbBlob && thumbnailUploadUrl) {
              const thumbXhr = new XMLHttpRequest();
              await new Promise<void>((resolve) => {
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
            // The resolved type, not the raw browser guess — the server validates against this.
            contentType: entry.contentType,
            isPublic: entry.isPublic,
            hasThumbnail,
            fileName: entry.file.name,
          };

          const linkProjectId = entry.projectId ?? options.projectId;
          if (linkProjectId) {
            completeBody.projectId = linkProjectId;
          }

          const completeRes = await authFetch(`${API_BASE_URL}/api/Upload/complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(completeBody),
            // The failure is shown on the file's own row; a toast as well would double up.
            silent: true,
          });

          if (!completeRes.ok) {
            const errBody = await completeRes.json().catch(() => null);
            throw new Error(errBody?.message || "Couldn't finish the upload.");
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
      };

      // Bounded worker pool. Starting every file at once made them all crawl and pushed slow
      // connections into timeouts they wouldn't otherwise hit.
      let next = 0;
      const workers = Array.from(
        { length: Math.min(MAX_CONCURRENT_UPLOADS, queued.length) },
        async () => {
          while (next < queued.length) {
            const idx = next++;
            await uploadOne(queued[idx], idx);
          }
        }
      );

      await Promise.all(workers);
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
    allowedTypes,
    acceptString: acceptStringFor(allowedTypes),
  };
}
