/**
 * Reusable upload UI components that can be embedded in any page/modal.
 * Uses the `useFileUploader` hook for all state & logic.
 */
import { useState } from "react";
import type { FileEntry } from "../hooks/useFileUploader";
import { ACCEPT_STRING, useFileUploader } from "../hooks/useFileUploader";
import "../App.css";

/* ── FileRow ────────────────────────────────── */

export function FileRow({
  entry,
  onRemove,
  onTogglePublic,
}: {
  entry: FileEntry;
  onRemove: () => void;
  onTogglePublic: () => void;
}) {
  const isActive = entry.status === "uploading" || entry.status === "completing";
  const isDone = entry.status === "done";
  const isError = entry.status === "error";
  const isQueued = entry.status === "queued";

  const fileIcon = entry.file.type.startsWith("video/")
    ? "🎬"
    : entry.file.type.startsWith("audio/")
      ? "🎵"
      : "🖼️";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "var(--space-3) var(--space-4)",
        backgroundColor: isError
          ? "rgba(239, 68, 68, 0.06)"
          : isDone
            ? "rgba(34, 197, 94, 0.06)"
            : "var(--bg-elevated)",
        borderRadius: "var(--radius-md)",
        border: `1px solid ${isError ? "rgba(239, 68, 68, 0.2)" : isDone ? "rgba(34, 197, 94, 0.2)" : "var(--border-color)"}`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Progress bar background */}
      {isActive && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${entry.progress}%`,
            backgroundColor: "rgba(34, 197, 94, 0.08)",
            transition: "width 0.3s ease",
            pointerEvents: "none",
          }}
        />
      )}

      <span style={{ fontSize: "var(--font-size-lg)", flexShrink: 0 }}>{fileIcon}</span>

      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        <p style={{
          fontWeight: 500,
          fontSize: "var(--font-size-sm)",
          marginBottom: "2px",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {entry.file.name}
        </p>
        <p className="text-muted" style={{ fontSize: "var(--font-size-xs)", marginBottom: 0 }}>
          {(entry.file.size / 1024 / 1024).toFixed(2)} MB
          {isActive && ` · ${entry.progress}%`}
          {isDone && " · Uploaded ✓"}
          {isError && ` · ${entry.message}`}
        </p>
      </div>

      {isQueued && (
        <button
          onClick={onTogglePublic}
          title={entry.isPublic ? "Public — click to make private" : "Private — click to make public"}
          style={{
            flexShrink: 0,
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "var(--font-size-xs)",
            padding: "2px 8px",
            borderRadius: "var(--radius-sm)",
            fontWeight: 600,
            backgroundColor: entry.isPublic ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
            color: entry.isPublic ? "var(--success)" : "var(--danger)",
          }}
        >
          {entry.isPublic ? "Public" : "Private"}
        </button>
      )}

      {isQueued && (
        <button
          onClick={onRemove}
          title="Remove"
          style={{
            flexShrink: 0,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--gray-400)",
            padding: "4px",
            borderRadius: "4px",
            transition: "color 0.15s",
            display: "flex",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--danger)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--gray-400)")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}

      {isActive && (
        <div className="loading" style={{ width: "20px", height: "20px", flexShrink: 0 }} />
      )}

      {isDone && (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" style={{ flexShrink: 0 }}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}

      {isError && (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" style={{ flexShrink: 0 }}>
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      )}
    </div>
  );
}

/* ── Full Upload Panel (dropzone + file list + button) ── */

export function UploadPanel({
  projectId,
  onAllUploaded,
  compact = false,
}: {
  projectId?: string;
  onAllUploaded?: (mediaIds: string[]) => void;
  compact?: boolean;
}) {
  const uploader = useFileUploader({ projectId });
  const [dragActive, setDragActive] = useState(false);

  function handleDrag(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }
  function handleDragIn(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) setDragActive(true);
  }
  function handleDragOut(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploader.addFiles(e.dataTransfer.files);
      e.dataTransfer.clearData();
    }
  }

  async function handleUpload() {
    const ids = await uploader.handleUploadAll();
    if (ids && ids.length > 0 && onAllUploaded) {
      onAllUploaded(ids);
    }
  }

  return (
    <div>
      {/* Dropzone */}
      <div
        className={`upload-dropzone ${dragActive ? "upload-dropzone-active" : ""}`}
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => uploader.inputRef.current?.click()}
        style={compact ? { padding: "var(--space-6) var(--space-4)" } : undefined}
      >
        <input
          ref={uploader.inputRef}
          type="file"
          accept={ACCEPT_STRING}
          multiple
          onChange={(e) => {
            if (e.target.files) uploader.addFiles(e.target.files);
            e.target.value = "";
          }}
          style={{ display: "none" }}
        />

        <svg width={compact ? "32" : "48"} height={compact ? "32" : "48"} viewBox="0 0 24 24" fill="none" stroke={dragActive ? "#22C55E" : "#64748B"} strokeWidth="2" style={{ marginBottom: "var(--space-2)", transition: "stroke 0.2s" }}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>

        {dragActive ? (
          <p style={{ fontWeight: 600, color: "var(--primary)", marginBottom: 0 }}>
            Drop files here
          </p>
        ) : (
          <>
            <p style={{ fontWeight: 500, marginBottom: "var(--space-1)", fontSize: compact ? "var(--font-size-sm)" : undefined }}>
              Drag & drop files here
            </p>
            <p className="text-muted" style={{ fontSize: "var(--font-size-xs)", marginBottom: 0 }}>
              or click to browse · MP4, WebM, MOV, PNG, JPG, MP3, OGG
            </p>
          </>
        )}
      </div>

      {/* Global vis toggle */}
      <div style={{ marginTop: "var(--space-3)", display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            cursor: "pointer",
            userSelect: "none",
            fontSize: "var(--font-size-sm)",
            color: "var(--gray-600)",
          }}
        >
          <input
            type="checkbox"
            checked={uploader.globalPublic}
            onChange={(e) => uploader.setGlobalPublic(e.target.checked)}
            style={{ width: "16px", height: "16px", accentColor: "var(--success)", cursor: "pointer" }}
          />
          <span style={{ fontWeight: 500 }}>Public</span>
        </label>
        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--gray-500)" }}>
          {uploader.globalPublic ? "Anyone can view" : "Only you can view"}
        </span>
      </div>

      {/* File list */}
      {uploader.files.length > 0 && (
        <div style={{ marginTop: "var(--space-4)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
            <p style={{ fontWeight: 600, fontSize: "var(--font-size-sm)", marginBottom: 0, color: "var(--gray-600)" }}>
              {uploader.files.length} file{uploader.files.length !== 1 ? "s" : ""}
              {uploader.doneCount > 0 && <span style={{ color: "var(--success)" }}> · {uploader.doneCount} uploaded</span>}
              {uploader.errorCount > 0 && <span style={{ color: "var(--danger)" }}> · {uploader.errorCount} failed</span>}
            </p>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              {uploader.doneCount > 0 && (
                <button onClick={uploader.clearCompleted} className="btn-secondary" style={{ fontSize: "var(--font-size-xs)", padding: "var(--space-1) var(--space-3)" }}>
                  Clear done
                </button>
              )}
              {!uploader.uploading && uploader.files.length > 0 && (
                <button onClick={uploader.clearAll} className="btn-secondary" style={{ fontSize: "var(--font-size-xs)", padding: "var(--space-1) var(--space-3)" }}>
                  Clear all
                </button>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", maxHeight: compact ? "250px" : undefined, overflowY: compact ? "auto" : undefined }}>
            {uploader.files.map((entry) => (
              <FileRow
                key={entry.id}
                entry={entry}
                onRemove={() => uploader.removeFile(entry.id)}
                onTogglePublic={() => uploader.toggleFilePublic(entry.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Upload button */}
      <div className="form-actions" style={{ marginTop: "var(--space-4)" }}>
        <button
          onClick={handleUpload}
          disabled={uploader.queuedCount === 0 || uploader.uploading}
          className="btn-primary"
          style={{ flex: 1 }}
        >
          {uploader.uploading
            ? "Uploading..."
            : uploader.queuedCount === 0
              ? "Add files to upload"
              : `Upload ${uploader.queuedCount} file${uploader.queuedCount !== 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}
