import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../Auth/useAuth";
import { API_BASE_URL } from "../config";
import { UploadPanel } from "./UploadUI";
import toast from "react-hot-toast";
import "../App.css";

interface ProjectSummary {
  id: string;
  title: string;
  description: string | null;
  thumbnailMediaId: string | null;
  mediaCount: number;
  createdAt: string;
  updatedAt: string;
}

export function ProjectsPage() {
  const { authFetch, accessToken } = useAuth();
  const isLoggedIn = !!accessToken;
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});

  const loadProjects = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE_URL}/api/projects`);
      if (!res.ok) throw new Error();
      const data: ProjectSummary[] = await res.json();
      setProjects(data);
    } catch {
      toast.error("Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    if (isLoggedIn) loadProjects();
    else setLoading(false);
  }, [isLoggedIn, loadProjects]);

  // Load thumbnail URLs for projects that have one
  useEffect(() => {
    async function loadThumbnails() {
      const needed = projects.filter(
        (p) => p.thumbnailMediaId && !thumbnailUrls[p.thumbnailMediaId]
      );
      if (needed.length === 0) return;

      const newUrls: Record<string, string> = {};
      for (const p of needed) {
        try {
          const res = await authFetch(
            `${API_BASE_URL}/api/media/${p.thumbnailMediaId}/url`
          );
          if (res.ok) {
            const data = await res.json();
            newUrls[p.thumbnailMediaId!] = data.thumbnailUrl || data.url;
          }
        } catch {
          /* skip */
        }
      }
      if (Object.keys(newUrls).length > 0) {
        setThumbnailUrls((prev) => ({ ...prev, ...newUrls }));
      }
    }
    loadThumbnails();
  }, [projects, authFetch, thumbnailUrls]);

  if (!isLoggedIn) {
    return (
      <div className="container">
        <div className="card" style={{ textAlign: "center", padding: "var(--space-12)" }}>
          <h2>Projects</h2>
          <p className="text-muted">
            Please <Link to="/profile">log in</Link> to create and manage projects.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container" style={{ textAlign: "center", padding: "var(--space-16)" }}>
        <div className="loading" style={{ margin: "0 auto" }}></div>
        <p className="text-muted" style={{ marginTop: "var(--space-4)" }}>Loading projects...</p>
      </div>
    );
  }

  return (
    <div className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-6)", flexWrap: "wrap", gap: "var(--space-3)" }}>
        <div>
          <h1 style={{ marginBottom: "var(--space-1)" }}>Projects</h1>
          <p className="text-muted">{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: "6px", verticalAlign: "middle" }}>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "var(--space-12)" }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" strokeWidth="1.5" style={{ margin: "0 auto var(--space-4)", display: "block" }}>
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <p className="text-muted" style={{ marginBottom: "var(--space-4)" }}>
            No projects yet. Create your first project to organize your media!
          </p>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            Create Project
          </button>
        </div>
      ) : (
        <div className="projects-grid">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              thumbnailUrl={p.thumbnailMediaId ? thumbnailUrls[p.thumbnailMediaId] : undefined}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadProjects();
          }}
        />
      )}
    </div>
  );
}

/* ── Project Card ──────────────────────────── */

function ProjectCard({
  project,
  thumbnailUrl,
}: {
  project: ProjectSummary;
  thumbnailUrl?: string;
}) {
  return (
    <Link to={`/projects/${project.id}`} className="project-card card" style={{ textDecoration: "none", display: "block" }}>
      <div className="project-card-thumb">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={project.title} />
        ) : (
          <div className="project-card-placeholder">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" strokeWidth="1.5">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </div>
        )}
      </div>

      <div style={{ padding: "var(--space-4)" }}>
        <h3 style={{ marginBottom: "var(--space-1)", fontSize: "var(--font-size-base)" }}>
          {project.title}
        </h3>
        {project.description && (
          <p className="text-muted" style={{ fontSize: "var(--font-size-sm)", marginBottom: "var(--space-2)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {project.description}
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>
            {project.mediaCount} file{project.mediaCount !== 1 ? "s" : ""}
          </span>
          <span className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>
            {new Date(project.updatedAt).toLocaleDateString()}
          </span>
        </div>
      </div>
    </Link>
  );
}

/* ── Create Project Modal ──────────────────── */

function CreateProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<"details" | "upload">("details");
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);

    try {
      const res = await authFetch(`${API_BASE_URL}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim() || null }),
      });

      if (!res.ok) throw new Error("Failed to create project");
      const data = await res.json();
      setCreatedProjectId(data.id);
      toast.success("Project created!");
      setStep("upload");
    } catch {
      toast.error("Failed to create project");
    } finally {
      setSaving(false);
    }
  }

  function handleDone() {
    onCreated();
    if (createdProjectId) {
      navigate(`/projects/${createdProjectId}`);
    }
  }

  function handleSkip() {
    onCreated();
    if (createdProjectId) {
      navigate(`/projects/${createdProjectId}`);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "var(--overlay-medium)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "var(--space-4)" }}
      onClick={step === "details" ? onClose : undefined}
    >
      <div
        className="card"
        style={{ maxWidth: step === "upload" ? "650px" : "500px", width: "100%", maxHeight: "85vh", overflowY: "auto", transition: "max-width 0.3s ease" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Step indicator */}
        <div className="card-header">
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-2)" }}>
            <div style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              backgroundColor: "var(--primary)",
              color: "var(--bg-deep)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "var(--font-size-xs)",
              fontWeight: 700,
              flexShrink: 0,
            }}>
              {step === "details" ? "1" : "✓"}
            </div>
            <div style={{
              height: "2px",
              flex: 1,
              backgroundColor: step === "upload" ? "var(--primary)" : "var(--border-color)",
              transition: "background-color 0.3s",
            }} />
            <div style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              backgroundColor: step === "upload" ? "var(--primary)" : "var(--bg-elevated)",
              color: step === "upload" ? "var(--bg-deep)" : "var(--gray-500)",
              border: step === "upload" ? "none" : "2px solid var(--border-color)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "var(--font-size-xs)",
              fontWeight: 700,
              flexShrink: 0,
            }}>
              2
            </div>
          </div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>
            {step === "details" ? "New Project" : "Upload Files"}
          </h2>
          {step === "upload" && (
            <p className="text-muted" style={{ fontSize: "var(--font-size-sm)", marginBottom: 0, marginTop: "var(--space-1)" }}>
              Upload files directly into <strong>{title}</strong> — or skip this step
            </p>
          )}
        </div>

        {step === "details" ? (
          <form onSubmit={handleCreate} className="form">
            <div className="form-group">
              <label htmlFor="proj-title">Title</label>
              <input
                id="proj-title"
                type="text"
                placeholder="My awesome project"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label htmlFor="proj-desc">Description (optional)</label>
              <textarea
                id="proj-desc"
                placeholder="What is this project about?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                rows={3}
                style={{ resize: "vertical" }}
              />
            </div>
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving || !title.trim()}>
                {saving ? "Creating..." : "Create & Upload Files"}
              </button>
            </div>
          </form>
        ) : (
          <div className="card-body">
            <UploadPanel
              projectId={createdProjectId!}
              compact
              onAllUploaded={(ids) => {
                if (ids.length > 0) {
                  toast.success(`Uploaded ${ids.length} file${ids.length !== 1 ? "s" : ""} to project`);
                }
              }}
            />
            <div className="form-actions" style={{ marginTop: "var(--space-4)", justifyContent: "flex-end" }}>
              <button className="btn-secondary" onClick={handleSkip}>
                Skip & Go to Project
              </button>
              <button className="btn-primary" onClick={handleDone}>
                Done — View Project
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
