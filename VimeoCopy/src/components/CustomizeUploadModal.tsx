/**
 * CustomizeUploadModal — everything about one queued upload, in one place.
 *
 * This replaces the row's separate Public and Thumb buttons. Those set two of the media's fields
 * and left the rest (description, gallery listing, downloads) to be fixed afterwards on the
 * dashboard — which is the wrong moment: the file is published by then. Every field the server
 * accepts at upload time is editable here, before anything is sent.
 *
 * Edits go into a draft and are committed on Save, so Cancel genuinely discards — including a
 * thumbnail that was captured and then thought better of.
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../Auth/useAuth";
import { API_BASE_URL } from "../config";
import { ThumbnailPicker } from "./ThumbnailPicker";
import type { EntryDetails, FileEntry } from "../hooks/useFileUploader";
import "../App.css";

export function CustomizeUploadModal({
  entry,
  onSave,
  onClose,
}: {
  entry: FileEntry;
  onSave: (patch: EntryDetails) => void;
  onClose: () => void;
}) {
  const { authFetch } = useAuth();

  // Draft state, seeded once from the entry. Deliberately not synced back to the entry on change:
  // a half-typed title must not become the upload's name if the modal is dismissed.
  const [name, setName] = useState(entry.displayName ?? entry.file.name);
  const [description, setDescription] = useState(entry.description ?? "");
  const [isPublic, setIsPublic] = useState(entry.isPublic);
  const [showOnMediaPage, setShowOnMediaPage] = useState(entry.showOnMediaPage ?? true);
  const [downloadable, setDownloadable] = useState(entry.downloadable ?? false);
  const [thumbnail, setThumbnail] = useState<Blob | undefined>(entry.customThumbnail);
  const [pickingThumbnail, setPickingThumbnail] = useState(false);

  /** Whether this plan includes downloads at all — decides toggle vs upsell, as on the dashboard. */
  const [downloadsAllowed, setDownloadsAllowed] = useState(false);

  const isVideo = entry.file.type.startsWith("video/");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`${API_BASE_URL}/api/media/downloads-allowed`, { silent: true });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setDownloadsAllowed(Boolean(data.allowed));
      } catch {
        /* treat as not allowed; the server clamps the flag anyway */
      }
    })();
    return () => { cancelled = true; };
  }, [authFetch]);

  // Preview of the pending thumbnail. Derived rather than stored, with an effect whose only job is
  // to revoke the URL once it is replaced or the modal closes.
  const thumbnailPreview = useMemo(() => (thumbnail ? URL.createObjectURL(thumbnail) : null), [thumbnail]);
  useEffect(() => {
    if (!thumbnailPreview) return;
    return () => URL.revokeObjectURL(thumbnailPreview);
  }, [thumbnailPreview]);

  // Escape closes, as it does for the other modals in the app.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleSave() {
    onSave({
      // An emptied title falls back to the file name rather than storing a blank one.
      displayName: name.trim() || entry.file.name,
      description: description.trim(),
      isPublic,
      showOnMediaPage,
      downloadable,
      customThumbnail: thumbnail,
    });
    onClose();
  }

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--overlay-medium)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "var(--space-4)",
      }}
      onClick={onClose}
    >
      <div
        className="card modal-card"
        style={{ maxWidth: "700px", width: "100%", maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)" }}>
          <div style={{ minWidth: 0 }}>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Customize upload</h2>
            <p className="text-muted" style={{ fontSize: "var(--font-size-xs)", marginBottom: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {entry.file.name}
            </p>
          </div>
          <button
            onClick={onClose}
            title="Close without saving"
            aria-label="Close without saving"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--gray-400)", padding: "4px", display: "flex", flexShrink: 0 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div>
            <label htmlFor="customize-name">Title</label>
            <input
              id="customize-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              placeholder={entry.file.name}
              title="The name this media is stored and listed under"
            />
            <p className="text-muted" style={{ fontSize: "var(--font-size-xs)", marginTop: "var(--space-1)", marginBottom: 0 }}>
              The name it is listed under. Leave it empty to keep the file name.
            </p>
          </div>

          <div>
            <label htmlFor="customize-description">Description</label>
            <textarea
              id="customize-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="What is this? Optional."
              title="Shown alongside the media"
              style={{ resize: "vertical" }}
            />
          </div>

          {/* Labels stay short because the app renders every <label> in caps; the sentence that
              explains each one goes underneath, in the muted voice used elsewhere. */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <div>
              <label className="media-visibility-toggle" title="Public media can be opened by anyone who has the link">
                <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                Public
              </label>
              <p className="text-muted" style={{ fontSize: "var(--font-size-xs)", marginBottom: 0 }}>
                {isPublic ? "Anyone with the link can watch it." : "Only you can watch it."}
              </p>
            </div>

            {/* Listing only means anything for something the public can reach in the first place. */}
            <div style={{ opacity: isPublic ? 1 : 0.5 }}>
              <label
                className="media-visibility-toggle"
                title={isPublic ? "Show this file on the public Media Gallery" : "Only public media can be listed on the gallery"}
              >
                <input
                  type="checkbox"
                  checked={showOnMediaPage && isPublic}
                  disabled={!isPublic}
                  onChange={(e) => setShowOnMediaPage(e.target.checked)}
                />
                List on the Media Gallery
              </label>
              <p className="text-muted" style={{ fontSize: "var(--font-size-xs)", marginBottom: 0 }}>
                {isPublic
                  ? "Appears in the public gallery, not just to people with the link."
                  : "Private media is never listed."}
              </p>
            </div>

            {downloadsAllowed ? (
              <div>
                <label className="media-visibility-toggle" title="Offer the original file as a download">
                  <input type="checkbox" checked={downloadable} onChange={(e) => setDownloadable(e.target.checked)} />
                  Allow downloads
                </label>
                <p className="text-muted" style={{ fontSize: "var(--font-size-xs)", marginBottom: 0 }}>
                  Viewers can save the original file, at full quality.
                </p>
              </div>
            ) : (
              /* Said out loud rather than hidden: a missing toggle reads as a missing feature. */
              <p className="text-muted" style={{ fontSize: "var(--font-size-xs)", marginBottom: 0 }}>
                Downloads aren't included in your plan, so the original file stays view-only.
              </p>
            )}
          </div>

          {isVideo && (
            <div>
              {/* A <label> so it picks up the same caps treatment as Title and Description. */}
              <label>Thumbnail</label>

              {!pickingThumbnail && (
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
                  {thumbnailPreview ? (
                    <img
                      src={thumbnailPreview}
                      alt="Chosen thumbnail"
                      style={{ width: "120px", borderRadius: "var(--radius-md)", border: "2px solid var(--primary)", objectFit: "cover" }}
                    />
                  ) : (
                    <p className="text-muted" style={{ fontSize: "var(--font-size-xs)", marginBottom: 0 }}>
                      A frame is picked automatically. Choose your own to override it.
                    </p>
                  )}
                  <button className="btn-outline" onClick={() => setPickingThumbnail(true)} style={{ fontSize: "var(--font-size-xs)" }}>
                    {thumbnail ? "Change thumbnail" : "Choose thumbnail"}
                  </button>
                  {thumbnail && (
                    <button
                      className="btn-secondary"
                      onClick={() => setThumbnail(undefined)}
                      title="Go back to the automatically generated thumbnail"
                      style={{ fontSize: "var(--font-size-xs)" }}
                    >
                      Use the automatic one
                    </button>
                  )}
                </div>
              )}

              {/* The picker as it always was — its Cancel backs out of choosing a thumbnail, not out
                  of the modal, and the frame it hands back is held in the draft until Save. */}
              {pickingThumbnail && (
                <ThumbnailPicker
                  videoFile={entry.file}
                  onCapture={(blob) => {
                    setThumbnail(blob);
                    setPickingThumbnail(false);
                  }}
                  onCancel={() => setPickingThumbnail(false)}
                  // Not "Cancel": the modal's own Cancel is right underneath and discards
                  // everything, whereas these two only decide the thumbnail.
                  cancelLabel="Back"
                  confirmLabel="Use this frame"
                />
              )}
            </div>
          )}
        </div>

        <div className="card-body" style={{ paddingTop: 0, display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave}>Save changes</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
