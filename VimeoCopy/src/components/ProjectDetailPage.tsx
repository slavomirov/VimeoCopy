import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../Auth/useAuth";
import { API_BASE_URL } from "../config";
import { UploadPanel } from "./UploadUI";
import { ThumbnailPicker } from "./ThumbnailPicker";
import toast from "react-hot-toast";
import "../App.css";

interface ProjectMedia {
  id: string;
  contentType: string;
  fileSize: number;
  uploadedAt: string;
  isPublic: boolean;
  sortOrder: number;
}

interface ProjectDetail {
  id: string;
  title: string;
  description: string | null;
  thumbnailMediaId: string | null;
  createdAt: string;
  updatedAt: string;
  media: ProjectMedia[];
}

interface UserMedia {
  id: string;
  contentType: string;
  fileSize: number;
  uploadedAt: string;
  isPublic: boolean;
}

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { authFetch } = useAuth();
  const navigate = useNavigate();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAddMedia, setShowAddMedia] = useState(false);
  const [showUploadMedia, setShowUploadMedia] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [thumbPickerMediaId, setThumbPickerMediaId] = useState<string | null>(null);
  const [thumbUploading, setThumbUploading] = useState(false);

  const loadProject = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE_URL}/api/projects/${projectId}`);
      if (!res.ok) throw new Error();
      const data: ProjectDetail = await res.json();
      setProject(data);
    } catch {
      toast.error("Failed to load project");
    } finally {
      setLoading(false);
    }
  }, [authFetch, projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  // Load presigned URLs for all media in the project
  useEffect(() => {
    async function loadUrls() {
      if (!project) return;
      const newUrls: Record<string, string> = {};
      const newThumbs: Record<string, string> = {};
      for (const m of project.media) {
        if (urls[m.id]) continue;
        try {
          const res = await authFetch(`${API_BASE_URL}/api/media/${m.id}/url`);
          if (res.ok) {
            const data = await res.json();
            newUrls[m.id] = data.url;
            if (data.thumbnailUrl) {
              newThumbs[m.id] = data.thumbnailUrl;
            }
          }
        } catch { /* skip */ }
      }
      if (Object.keys(newUrls).length > 0) {
        setUrls((prev) => ({ ...prev, ...newUrls }));
      }
      if (Object.keys(newThumbs).length > 0) {
        setThumbnailUrls((prev) => ({ ...prev, ...newThumbs }));
      }
    }
    loadUrls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.media.length, authFetch]);

  // ── Change thumbnail on existing media ────
  async function handleThumbnailCapture(blob: Blob) {
    if (!thumbPickerMediaId) return;
    setThumbUploading(true);
    try {
      const urlRes = await authFetch(
        `${API_BASE_URL}/api/media/${thumbPickerMediaId}/thumbnail/upload-url`,
        { method: "POST" }
      );
      if (!urlRes.ok) throw new Error("Failed to get thumbnail upload URL");
      const { uploadUrl } = await urlRes.json();

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl, true);
        xhr.setRequestHeader("Content-Type", "image/jpeg");
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Upload failed")));
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(blob);
      });

      const confirmRes = await authFetch(
        `${API_BASE_URL}/api/media/${thumbPickerMediaId}/thumbnail/confirm`,
        { method: "POST" }
      );
      if (!confirmRes.ok) throw new Error("Failed to confirm thumbnail");

      // Refresh thumbnail URL
      const mediaRes = await authFetch(`${API_BASE_URL}/api/media/${thumbPickerMediaId}/url`);
      if (mediaRes.ok) {
        const data = await mediaRes.json();
        if (data.thumbnailUrl) {
          setThumbnailUrls((prev) => ({ ...prev, [thumbPickerMediaId]: data.thumbnailUrl }));
        }
      }
      setThumbPickerMediaId(null);
      toast.success("Thumbnail updated!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update thumbnail");
    } finally {
      setThumbUploading(false);
    }
  }

  // ── Edit project ─────────────────────────

  function startEdit() {
    if (!project) return;
    setEditTitle(project.title);
    setEditDesc(project.description || "");
    setEditing(true);
  }

  async function saveEdit() {
    if (!project || !editTitle.trim()) return;
    setSaving(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDesc.trim() || null,
        }),
      });
      if (!res.ok) throw new Error();
      const data: ProjectDetail = await res.json();
      setProject(data);
      setEditing(false);
      toast.success("Project updated!");
    } catch {
      toast.error("Failed to update project");
    } finally {
      setSaving(false);
    }
  }

  // ── Set thumbnail ────────────────────────

  async function setThumbnail(mediaId: string) {
    if (!project) return;
    try {
      const res = await authFetch(`${API_BASE_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thumbnailMediaId: mediaId }),
      });
      if (!res.ok) throw new Error();
      const data: ProjectDetail = await res.json();
      setProject(data);
      toast.success("Thumbnail updated!");
    } catch {
      toast.error("Failed to set thumbnail");
    }
  }

  // ── Remove media ─────────────────────────

  async function removeMedia(mediaId: string) {
    if (!project) return;
    try {
      const res = await authFetch(`${API_BASE_URL}/api/projects/${project.id}/media`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaIds: [mediaId] }),
      });
      if (!res.ok) throw new Error();
      const data: ProjectDetail = await res.json();
      setProject(data);
      toast.success("Media removed from project");
    } catch {
      toast.error("Failed to remove media");
    }
  }

  // ── Delete project ───────────────────────

  async function deleteProject() {
    if (!project) return;
    try {
      const res = await authFetch(`${API_BASE_URL}/api/projects/${project.id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) throw new Error();
      toast.success("Project deleted");
      navigate("/projects");
    } catch {
      toast.error("Failed to delete project");
    }
  }

  // ── Render ───────────────────────────────

  if (loading) {
    return (
      <div className="container" style={{ textAlign: "center", padding: "var(--space-16)" }}>
        <div className="loading" style={{ margin: "0 auto" }}></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container">
        <div className="card" style={{ textAlign: "center", padding: "var(--space-12)" }}>
          <h2>Project not found</h2>
          <p className="text-muted">
            <Link to="/projects">Back to Projects</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Breadcrumb */}
      <p style={{ marginBottom: "var(--space-4)", fontSize: "var(--font-size-sm)" }}>
        <Link to="/projects" style={{ color: "var(--primary)" }}>Projects</Link>
        <span className="text-muted"> / </span>
        <span>{project.title}</span>
      </p>

      {/* Header card */}
      <div className="card" style={{ marginBottom: "var(--space-6)" }}>
        {editing ? (
          <div className="form">
            <div className="form-group">
              <label>Title</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={200}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                maxLength={2000}
                rows={3}
                style={{ resize: "vertical" }}
              />
            </div>
            <div className="form-actions">
              <button className="btn-secondary" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={saveEdit} disabled={saving || !editTitle.trim()}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "var(--space-3)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 style={{ marginBottom: "var(--space-2)" }}>{project.title}</h1>
                {project.description && (
                  <p className="text-muted" style={{ marginBottom: "var(--space-2)" }}>
                    {project.description}
                  </p>
                )}
                <p className="text-muted" style={{ fontSize: "var(--font-size-xs)", marginBottom: 0 }}>
                  Created {new Date(project.createdAt).toLocaleDateString()} · Updated {new Date(project.updatedAt).toLocaleDateString()} · {project.media.length} file{project.media.length !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="media-actions" style={{ width: "auto" }}>
                <button className="btn-secondary" onClick={startEdit}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: "4px", verticalAlign: "middle" }}>
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit
                </button>
                <button className="btn-danger" onClick={() => setConfirmDelete(true)}>
                  Delete
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Actions bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-4)", flexWrap: "wrap", gap: "var(--space-3)" }}>
        <h2 style={{ marginBottom: 0 }}>Media</h2>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <button className="btn-primary" onClick={() => setShowUploadMedia(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: "6px", verticalAlign: "middle" }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Upload
          </button>
          <button className="btn-secondary" onClick={() => setShowAddMedia(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: "6px", verticalAlign: "middle" }}>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Existing
          </button>
        </div>
      </div>

      {/* Media grid */}
      {project.media.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "var(--space-12)" }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" strokeWidth="1.5" style={{ margin: "0 auto var(--space-4)", display: "block" }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <p className="text-muted" style={{ marginBottom: "var(--space-4)" }}>
            No media in this project yet.
          </p>
          <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn-primary" onClick={() => setShowUploadMedia(true)}>
              Upload Files
            </button>
            <button className="btn-secondary" onClick={() => setShowAddMedia(true)}>
              Add Existing Media
            </button>
          </div>
        </div>
      ) : (
        <div className="projects-grid">
          {project.media.map((m) => (
            <MediaCard
              key={m.id}
              media={m}
              url={urls[m.id]}
              thumbnailUrl={thumbnailUrls[m.id]}
              isThumbnail={project.thumbnailMediaId === m.id}
              onSetThumbnail={() => setThumbnail(m.id)}
              onRemove={() => removeMedia(m.id)}
              onChangeThumbnail={() => setThumbPickerMediaId(m.id)}
            />
          ))}
        </div>
      )}

      {/* Upload to Project Modal */}
      {showUploadMedia && (
        <UploadToProjectModal
          projectId={project.id}
          onClose={() => setShowUploadMedia(false)}
          onUploaded={() => {
            setShowUploadMedia(false);
            loadProject();
          }}
        />
      )}

      {/* Add Media Modal */}
      {showAddMedia && (
        <AddMediaModal
          projectId={project.id}
          existingMediaIds={project.media.map((m) => m.id)}
          onClose={() => setShowAddMedia(false)}
          onAdded={(data) => {
            setProject(data);
            setShowAddMedia(false);
          }}
        />
      )}

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "var(--space-4)" }}
          onClick={() => setConfirmDelete(false)}
        >
          <div className="card" style={{ maxWidth: "400px", width: "100%" }} onClick={(e) => e.stopPropagation()}>
            <div className="card-header">
              <h2 className="card-title" style={{ marginBottom: 0 }}>Delete Project?</h2>
            </div>
            <p className="text-muted" style={{ marginBottom: "var(--space-4)" }}>
              This will delete the project "{project.title}". Your media files will NOT be deleted.
            </p>
            <div className="form-actions">
              <button className="btn-secondary" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button className="btn-danger" onClick={deleteProject}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Thumbnail Picker Modal */}
      {thumbPickerMediaId && urls[thumbPickerMediaId] && createPortal(
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "var(--space-4)",
          }}
          onClick={() => !thumbUploading && setThumbPickerMediaId(null)}
        >
          <div
            className="card modal-card"
            style={{ maxWidth: "700px", width: "100%", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 className="card-title" style={{ marginBottom: 0 }}>Change Thumbnail</h2>
              <button
                onClick={() => !thumbUploading && setThumbPickerMediaId(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--gray-400)", padding: "4px", display: "flex" }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="card-body">
              {thumbUploading ? (
                <div style={{ textAlign: "center", padding: "var(--space-8)" }}>
                  <div className="loading" style={{ margin: "0 auto var(--space-4)" }}></div>
                  <p className="text-muted">Uploading thumbnail...</p>
                </div>
              ) : (
                <ThumbnailPicker
                  videoUrl={urls[thumbPickerMediaId]}
                  onCapture={handleThumbnailCapture}
                  onCancel={() => setThumbPickerMediaId(null)}
                />
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/* ── Media Card inside project ──────────── */

function MediaCard({
  media,
  url,
  thumbnailUrl,
  isThumbnail,
  onSetThumbnail,
  onRemove,
  onChangeThumbnail,
}: {
  media: ProjectMedia;
  url?: string;
  thumbnailUrl?: string;
  isThumbnail: boolean;
  onSetThumbnail: () => void;
  onRemove: () => void;
  onChangeThumbnail: () => void;
}) {
  const [playing, setPlaying] = useState(false);

  if (!url) {
    return (
      <div className="card" style={{ padding: "var(--space-8)", textAlign: "center" }}>
        <div className="loading" style={{ margin: "0 auto" }}></div>
      </div>
    );
  }

  const isImage = media.contentType.startsWith("image/");
  const isVideo = media.contentType.startsWith("video/");
  const isAudio = media.contentType.startsWith("audio/");

  return (
    <div className="card" style={{ position: "relative" }}>
      {isThumbnail && (
        <span className="project-thumb-badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: "3px", verticalAlign: "middle" }}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Thumbnail
        </span>
      )}

      <div
        style={{ width: "100%", height: "180px", borderRadius: "var(--radius-lg)", overflow: "hidden", backgroundColor: "var(--bg-deep)", marginBottom: "var(--space-3)", position: "relative", cursor: isVideo && !playing ? "pointer" : "default" }}
        onClick={() => { if (isVideo && !playing) setPlaying(true); }}
      >
        {isImage && (
          <img src={thumbnailUrl || url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}
        {isVideo && !playing && (
          <>
            {thumbnailUrl ? (
              <img src={thumbnailUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <video src={url} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            )}
            <div style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.3)",
            }}>
              <div style={{
                width: "44px",
                height: "44px",
                borderRadius: "50%",
                backgroundColor: "rgba(34, 197, 94, 0.9)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 12px rgba(34, 197, 94, 0.4)",
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white" style={{ marginLeft: "2px" }}>
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              </div>
            </div>
          </>
        )}
        {isVideo && playing && (
          <video src={url} controls autoPlay style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        )}
        {isAudio && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <audio src={url} controls style={{ width: "90%" }} />
          </div>
        )}
      </div>

      <div style={{ marginBottom: "var(--space-2)" }}>
        <p className="text-muted" style={{ fontSize: "var(--font-size-xs)", marginBottom: "var(--space-1)" }}>
          {(media.fileSize / (1024 * 1024)).toFixed(2)} MB · {media.contentType.split("/")[1]?.toUpperCase()}
        </p>
        <p style={{ fontSize: "var(--font-size-xs)", marginBottom: 0 }}>
          <span style={{
            display: "inline-block",
            padding: "1px 6px",
            borderRadius: "var(--radius-sm)",
            fontWeight: 600,
            fontSize: "10px",
            backgroundColor: media.isPublic ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
            color: media.isPublic ? "var(--success)" : "var(--danger)",
          }}>
            {media.isPublic ? "Public" : "Private"}
          </span>
        </p>
      </div>

      <div className="media-actions">
        {(isImage || isVideo) && !isThumbnail && (
          <button className="btn-secondary" onClick={onSetThumbnail} style={{ fontSize: "var(--font-size-xs)" }}>
            Set Thumbnail
          </button>
        )}
        {isVideo && (
          <button className="btn-outline" onClick={onChangeThumbnail} style={{ fontSize: "var(--font-size-xs)" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: "3px", verticalAlign: "middle" }}>
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            Thumb
          </button>
        )}
        <button className="btn-danger" onClick={onRemove} style={{ fontSize: "var(--font-size-xs)" }}>
          Remove
        </button>
      </div>
    </div>
  );
}

/* ── Upload to Project Modal ─────────────── */

function UploadToProjectModal({
  projectId,
  onClose,
  onUploaded,
}: {
  projectId: string;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [uploaded, setUploaded] = useState(false);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "var(--space-4)" }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: "650px", width: "100%", maxHeight: "85vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Upload to Project</h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--gray-400)",
              padding: "4px",
              display: "flex",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="card-body">
          <UploadPanel
            projectId={projectId}
            compact
            onAllUploaded={(ids) => {
              if (ids.length > 0) {
                setUploaded(true);
                toast.success(`Uploaded ${ids.length} file${ids.length !== 1 ? "s" : ""} to project`);
              }
            }}
          />
          {uploaded && (
            <div style={{ marginTop: "var(--space-3)", textAlign: "center" }}>
              <button className="btn-primary" onClick={onUploaded} style={{ minWidth: "160px" }}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Add Media Modal ────────────────────── */

function AddMediaModal({
  projectId,
  existingMediaIds,
  onClose,
  onAdded,
}: {
  projectId: string;
  existingMediaIds: string[];
  onClose: () => void;
  onAdded: (data: ProjectDetail) => void;
}) {
  const { authFetch, claims } = useAuth();
  const [allMedia, setAllMedia] = useState<UserMedia[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const existingSet = new Set(existingMediaIds);

  // Load user's media - use the same DTO endpoint as profile page
  useEffect(() => {
    async function load() {
      try {
        const userId = claims.sub;
        const res = await authFetch(`${API_BASE_URL}/getData/${userId}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setAllMedia(data.media || []);
      } catch {
        toast.error("Failed to load your media");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [authFetch, claims.sub]);

  // Load thumbnail URLs for add-media grid
  useEffect(() => {
    async function loadUrls() {
      const needed = allMedia.filter((m) => !urls[m.id] && !existingSet.has(m.id));
      if (needed.length === 0) return;
      const newUrls: Record<string, string> = {};
      for (const m of needed.slice(0, 50)) {
        try {
          const res = await authFetch(`${API_BASE_URL}/api/media/${m.id}/url`);
          if (res.ok) {
            const data = await res.json();
            // Prefer thumbnail for the small grid display
            newUrls[m.id] = data.thumbnailUrl || data.url;
          }
        } catch { /* skip */ }
      }
      if (Object.keys(newUrls).length > 0) {
        setUrls((prev) => ({ ...prev, ...newUrls }));
      }
    }
    loadUrls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMedia.length, authFetch]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAdd() {
    if (selectedIds.size === 0) return;
    setSaving(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/projects/${projectId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaIds: Array.from(selectedIds) }),
      });
      if (!res.ok) throw new Error();
      const data: ProjectDetail = await res.json();
      toast.success(`Added ${selectedIds.size} file${selectedIds.size !== 1 ? "s" : ""}`);
      onAdded(data);
    } catch {
      toast.error("Failed to add media");
    } finally {
      setSaving(false);
    }
  }

  const availableMedia = allMedia.filter((m) => !existingSet.has(m.id));

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "var(--space-4)" }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: "700px", width: "100%", maxHeight: "80vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-header">
          <h2 className="card-title" style={{ marginBottom: 0 }}>Add Media to Project</h2>
        </div>

        {loading ? (
          <div style={{ padding: "var(--space-8)", textAlign: "center" }}>
            <div className="loading" style={{ margin: "0 auto" }}></div>
          </div>
        ) : availableMedia.length === 0 ? (
          <div style={{ padding: "var(--space-8)", textAlign: "center" }}>
            <p className="text-muted">
              {allMedia.length === 0
                ? "You have no media files. Upload some first!"
                : "All your media is already in this project."}
            </p>
          </div>
        ) : (
          <>
            <p className="text-muted" style={{ fontSize: "var(--font-size-sm)", marginBottom: "var(--space-3)" }}>
              Select media to add ({selectedIds.size} selected)
            </p>
            <div style={{ flex: 1, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "var(--space-3)", padding: "var(--space-2)" }}>
              {availableMedia.map((m) => {
                const isSelected = selectedIds.has(m.id);
                const thumbUrl = urls[m.id];
                const isImage = m.contentType.startsWith("image/");
                const isVideo = m.contentType.startsWith("video/");

                return (
                  <div
                    key={m.id}
                    onClick={() => toggleSelect(m.id)}
                    className={`add-media-item ${isSelected ? "selected" : ""}`}
                  >
                    <div className="add-media-thumb">
                      {thumbUrl && isImage && <img src={thumbUrl} alt="" />}
                      {thumbUrl && isVideo && <video src={thumbUrl} muted />}
                      {!thumbUrl && (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--gray-400)", fontSize: "var(--font-size-2xl)" }}>
                          {isVideo ? "🎬" : m.contentType.startsWith("audio/") ? "🎵" : "🖼️"}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <div className="add-media-check">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    )}
                    <p style={{ fontSize: "10px", textAlign: "center", marginTop: "var(--space-1)", marginBottom: 0 }} className="text-muted">
                      {(m.fileSize / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="form-actions" style={{ marginTop: "var(--space-4)" }}>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={selectedIds.size === 0 || saving}
            onClick={handleAdd}
          >
            {saving ? "Adding..." : `Add ${selectedIds.size} file${selectedIds.size !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
