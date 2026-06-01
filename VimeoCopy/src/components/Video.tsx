import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../Auth/useAuth";
import { API_BASE_URL } from "../config";
import { EnhancedPlayer } from "./EnhancedPlayer";
import "../App.css";

/* ── Types ─────────────────────────────────── */

interface PublicMedia {
  id: string;
  fileName: string | null;
  contentType: string;
  fileSize: number;
  uploadedAt: string;
  status: string;
  isPublic: boolean;
  description: string | null;
  hasThumbnail: boolean;
  ownerEmail: string;
  ownerUsername: string | null;
  ownerHandle: string | null;
  projectId: string | null;
  projectTitle: string | null;
  projectDescription: string | null;
  projectThumbnailMediaId: string | null;
  projectMediaCount: number | null;
}

interface ProjectGroup {
  projectId: string;
  projectTitle: string;
  projectDescription: string | null;
  projectThumbnailMediaId: string | null;
  projectMediaCount: number;
  media: PublicMedia[];
}

type FilterMode = "all" | "standalone" | "projects";

/* ── Main Component ────────────────────────── */

export function Videos() {
  const [items, setItems] = useState<PublicMedia[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<PublicMedia | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const { authFetch } = useAuth();

  // Load media list
  useEffect(() => {
    async function load() {
      const res = await authFetch(`${API_BASE_URL}/api/media`);
      const data = await res.json();
      setItems(data);
      setLoaded(true);
    }
    load();
  }, [authFetch]);

  // Load URLs for visible media items
  const loadUrlsForMedia = useCallback(async (mediaList: PublicMedia[]) => {
    const newUrls: Record<string, string> = {};
    const newThumbs: Record<string, string> = {};

    for (const m of mediaList) {
      if (urls[m.id]) continue;
      try {
        const res = await authFetch(`${API_BASE_URL}/api/media/${m.id}/url`);
        const data = await res.json();
        newUrls[m.id] = data.url;
        if (data.thumbnailUrl) {
          newThumbs[m.id] = data.thumbnailUrl;
        }
      } catch { /* skip */ }
    }

    if (Object.keys(newUrls).length > 0) setUrls(prev => ({ ...prev, ...newUrls }));
    if (Object.keys(newThumbs).length > 0) setThumbnailUrls(prev => ({ ...prev, ...newThumbs }));
  }, [authFetch, urls]);

  useEffect(() => {
    if (items.length > 0) loadUrlsForMedia(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Also load project thumbnail URLs
  useEffect(() => {
    const thumbMediaIds = items
      .filter(m => m.projectThumbnailMediaId && !urls[m.projectThumbnailMediaId])
      .map(m => m.projectThumbnailMediaId!)
      .filter((v, i, a) => a.indexOf(v) === i);

    if (thumbMediaIds.length === 0) return;

    async function loadProjectThumbs() {
      const newUrls: Record<string, string> = {};
      for (const id of thumbMediaIds) {
        try {
          const res = await authFetch(`${API_BASE_URL}/api/media/${id}/url`);
          const data = await res.json();
          newUrls[id] = data.thumbnailUrl || data.url;
        } catch { /* skip */ }
      }
      if (Object.keys(newUrls).length > 0) {
        setUrls(prev => ({ ...prev, ...newUrls }));
        setThumbnailUrls(prev => ({ ...prev, ...newUrls }));
      }
    }
    loadProjectThumbs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // ── Derived data ──

  // Group project media
  const projectGroups: ProjectGroup[] = [];
  const projectMap = new Map<string, ProjectGroup>();
  const standaloneMedia: PublicMedia[] = [];

  for (const m of items) {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      (m.fileName?.toLowerCase().includes(q)) ||
      (m.description?.toLowerCase().includes(q)) ||
      (m.ownerUsername?.toLowerCase().includes(q)) ||
      (m.ownerEmail.toLowerCase().includes(q)) ||
      (m.projectTitle?.toLowerCase().includes(q));

    if (!matchesSearch) continue;

    if (m.projectId) {
      if (!projectMap.has(m.projectId)) {
        const group: ProjectGroup = {
          projectId: m.projectId,
          projectTitle: m.projectTitle!,
          projectDescription: m.projectDescription,
          projectThumbnailMediaId: m.projectThumbnailMediaId,
          projectMediaCount: m.projectMediaCount || 0,
          media: [],
        };
        projectMap.set(m.projectId, group);
        projectGroups.push(group);
      }
      projectMap.get(m.projectId)!.media.push(m);
    } else {
      standaloneMedia.push(m);
    }
  }

  const filteredStandalone = filter === "projects" ? [] : standaloneMedia;
  const filteredProjects = filter === "standalone" ? [] : projectGroups;
  const totalVisible = filteredStandalone.length + filteredProjects.reduce((acc, p) => acc + p.media.length, 0);

  return (
    <div className="container media-gallery-page">
      {/* Header */}
      <div className="media-gallery-header fade-in-down">
        <div>
          <h1 className="media-gallery-title">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: "10px", verticalAlign: "middle" }}>
              <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
              <line x1="7" y1="2" x2="7" y2="22" />
              <line x1="17" y1="2" x2="17" y2="22" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <line x1="2" y1="7" x2="7" y2="7" />
              <line x1="2" y1="17" x2="7" y2="17" />
              <line x1="17" y1="7" x2="22" y2="7" />
              <line x1="17" y1="17" x2="22" y2="17" />
            </svg>
            Media Gallery
          </h1>
          <p className="text-muted">{totalVisible} file{totalVisible !== 1 ? "s" : ""} available</p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="media-filters-bar fade-in-up" style={{ animationDelay: "0.1s" }}>
        <div className="media-search-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" strokeWidth="2" className="media-search-icon">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search media, owners, projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="media-search-input"
          />
        </div>

        <div className="media-filter-tabs">
          {([
            { key: "all" as FilterMode, label: "All", icon: "M4 6h16M4 12h16M4 18h16" },
            { key: "standalone" as FilterMode, label: "Files", icon: "M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" },
            { key: "projects" as FilterMode, label: "Projects", icon: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" },
          ]).map((f) => (
            <button
              key={f.key}
              className={`media-filter-tab ${filter === f.key ? "active" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d={f.icon} />
              </svg>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {!loaded ? (
        <div style={{ textAlign: "center", padding: "var(--space-16)" }}>
          <div className="loading" style={{ margin: "0 auto" }}></div>
          <p className="text-muted" style={{ marginTop: "var(--space-4)" }}>Loading gallery...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="card fade-in-up" style={{ textAlign: "center", padding: "var(--space-12)" }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" strokeWidth="1.5" style={{ margin: "0 auto var(--space-4)", display: "block" }}>
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
            <line x1="7" y1="2" x2="7" y2="22" />
            <line x1="17" y1="2" x2="17" y2="22" />
            <line x1="2" y1="12" x2="22" y2="12" />
          </svg>
          <p className="text-muted">No media files available. <a href="/upload">Upload one now</a></p>
        </div>
      ) : (
        <>
          {/* ── Project Cards Section ──────────────── */}
          {filteredProjects.length > 0 && (
            <div className="fade-in-up" style={{ animationDelay: "0.15s", marginBottom: "var(--space-8)" }}>
              <h2 className="media-section-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                Projects
              </h2>
              <div className="media-projects-grid">
                {filteredProjects.map((pg, i) => (
                  <ProjectMediaCard
                    key={pg.projectId}
                    group={pg}
                    thumbUrl={pg.projectThumbnailMediaId ? (thumbnailUrls[pg.projectThumbnailMediaId] || urls[pg.projectThumbnailMediaId]) : undefined}
                    isExpanded={expandedProject === pg.projectId}
                    onToggle={() => setExpandedProject(expandedProject === pg.projectId ? null : pg.projectId)}
                    mediaUrls={urls}
                    mediaThumbUrls={thumbnailUrls}
                    onMediaClick={setSelected}
                    index={i}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Standalone Media Grid ─────────────── */}
          {filteredStandalone.length > 0 && (
            <div className="fade-in-up" style={{ animationDelay: "0.2s" }}>
              {filteredProjects.length > 0 && (
                <h2 className="media-section-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                    <polyline points="13 2 13 9 20 9" />
                  </svg>
                  Individual Files
                </h2>
              )}
              <div className="grid grid-2">
                {filteredStandalone.map((m, i) => (
                  <GalleryMediaItem
                    key={m.id}
                    media={m}
                    url={urls[m.id]}
                    thumbnailUrl={thumbnailUrls[m.id]}
                    onClick={() => setSelected(m)}
                    index={i}
                  />
                ))}
              </div>
            </div>
          )}

          {totalVisible === 0 && (
            <div className="card fade-in-up" style={{ textAlign: "center", padding: "var(--space-12)" }}>
              <p className="text-muted">No results match your search.</p>
            </div>
          )}
        </>
      )}

      {selected && urls[selected.id] && (
        <EnhancedPlayer
          media={{
            fileName: selected.fileName,
            contentType: selected.contentType,
            description: selected.description,
            ownerName: selected.ownerUsername || selected.ownerEmail.split("@")[0],
            ownerInitial: (selected.ownerUsername || selected.ownerEmail).charAt(0).toUpperCase(),
            projectTitle: selected.projectTitle,
          }}
          url={urls[selected.id]}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

/* ── Project Media Card (Collapsible) ──────── */

function ProjectMediaCard({
  group,
  thumbUrl,
  isExpanded,
  onToggle,
  mediaUrls,
  mediaThumbUrls,
  onMediaClick,
  index,
}: {
  group: ProjectGroup;
  thumbUrl?: string;
  isExpanded: boolean;
  onToggle: () => void;
  mediaUrls: Record<string, string>;
  mediaThumbUrls: Record<string, string>;
  onMediaClick: (m: PublicMedia) => void;
  index: number;
}) {
  return (
    <div className={`media-project-card stagger-in ${isExpanded ? "expanded" : ""}`} style={{ animationDelay: `${index * 0.08}s` }}>
      {/* Project Header - clickable */}
      <div className="media-project-header" onClick={onToggle}>
        <div className="media-project-thumb">
          {thumbUrl ? (
            <img src={thumbUrl} alt={group.projectTitle} />
          ) : (
            <div className="media-project-thumb-placeholder">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" strokeWidth="1.5">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </div>
          )}
          <div className="media-project-overlay">
            <span className="media-project-count">{group.projectMediaCount} files</span>
          </div>
        </div>

        <div className="media-project-info">
          <h3 className="media-project-name">{group.projectTitle}</h3>
          {group.projectDescription && (
            <p className="media-project-desc">{group.projectDescription}</p>
          )}
          <div className="media-project-meta">
            <span>{group.media.length} file{group.media.length !== 1 ? "s" : ""} shown</span>
          </div>
        </div>

        <div className={`media-project-chevron ${isExpanded ? "rotated" : ""}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {/* Collapsible media grid */}
      <div className={`media-project-content ${isExpanded ? "open" : ""}`}>
        <div className="media-project-media-grid">
          {group.media.map((m, i) => (
            <GalleryMediaItem
              key={m.id}
              media={m}
              url={mediaUrls[m.id]}
              thumbnailUrl={mediaThumbUrls[m.id]}
              onClick={() => onMediaClick(m)}
              index={i}
              compact
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Gallery Media Item ────────────────────── */

function GalleryMediaItem({
  media,
  url,
  thumbnailUrl,
  onClick,
  index,
  compact = false,
}: {
  media: PublicMedia;
  url?: string;
  thumbnailUrl?: string;
  onClick: () => void;
  index: number;
  compact?: boolean;
}) {
  if (!url) return (
    <div className="card stagger-in" style={{ padding: "var(--space-8)", textAlign: "center", animationDelay: `${index * 0.06}s` }}>
      <div className="loading" style={{ margin: "0 auto" }}></div>
    </div>
  );

  const isImage = media.contentType.startsWith("image/");

  return (
    <div
      className={`card media-gallery-card stagger-in ${compact ? "compact" : ""}`}
      onClick={onClick}
      style={{ cursor: "pointer", overflow: "hidden", animationDelay: `${index * 0.06}s` }}
    >
      {/* Media preview */}
      <div className="media-gallery-preview">
        {isImage ? (
          <img src={thumbnailUrl || url} alt={media.fileName || "Media"} />
        ) : (
          <>
            {thumbnailUrl ? (
              <img src={thumbnailUrl} alt={media.fileName || "Media"} />
            ) : (
              <video src={url} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            )}
            <div className="media-play-overlay">
              <div className="media-play-btn">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="white" style={{ marginLeft: "2px" }}>
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              </div>
            </div>
          </>
        )}

        {/* Type badge */}
        <span className="media-type-badge">
          {isImage ? "IMG" : media.contentType.startsWith("audio/") ? "AUD" : "VID"}
        </span>
      </div>

      {/* Info section */}
      <div className="media-gallery-info">
        <p className="media-gallery-filename">
          {media.fileName || "Untitled"}
        </p>

        {media.description && (
          <p className="media-gallery-description">{media.description}</p>
        )}

        {/* Owner */}
        {media.ownerHandle ? (
          <Link
            to={`/u/${media.ownerHandle}`}
            className="media-gallery-owner"
            onClick={(e) => e.stopPropagation()}
            style={{ textDecoration: "none", color: "inherit" }}
            title={`View ${media.ownerUsername || media.ownerHandle}'s profile`}
          >
            <div className="media-owner-avatar">
              {(media.ownerUsername || media.ownerEmail).charAt(0).toUpperCase()}
            </div>
            <span className="media-owner-name">
              {media.ownerUsername || media.ownerEmail.split("@")[0]}
            </span>
          </Link>
        ) : (
          <div className="media-gallery-owner">
            <div className="media-owner-avatar">
              {(media.ownerUsername || media.ownerEmail).charAt(0).toUpperCase()}
            </div>
            <span className="media-owner-name">
              {media.ownerUsername || media.ownerEmail.split("@")[0]}
            </span>
          </div>
        )}

        <div className="media-gallery-meta">
          <span>{(media.fileSize / (1024 * 1024)).toFixed(1)} MB</span>
          <span>{new Date(media.uploadedAt).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}
