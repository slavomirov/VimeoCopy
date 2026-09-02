import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../Auth/useAuth";
import { API_BASE_URL } from "../config";
import { EnhancedPlayer } from "./EnhancedPlayer";
import { ReportButton } from "./ReportButton";
import { HoverPreview } from "./HoverPreview";
import { IconBeacon } from "../brand/FerryMarks";
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
  /** Presigned by the server with the list, so the grid needs no per-tile request. */
  previewUrl: string | null;
  thumbnailUrl: string | null;
  ownerDisplayName: string;
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

const PAGE_SIZE = 24;

/** Preview URLs now arrive with the list; these just reshape them into the lookup the grid uses. */
function urlMapFrom(page: PublicMedia[]) {
  return Object.fromEntries(
    page.filter(m => m.previewUrl).map(m => [m.id, m.previewUrl!])
  ) as Record<string, string>;
}

function thumbMapFrom(page: PublicMedia[]) {
  return Object.fromEntries(
    page.filter(m => m.thumbnailUrl).map(m => [m.id, m.thumbnailUrl!])
  ) as Record<string, string>;
}

/* ── Main Component ────────────────────────── */

export function Videos() {
  const [items, setItems] = useState<PublicMedia[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<PublicMedia | null>(null);
  const [playerUrl, setPlayerUrl] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const { authFetch } = useAuth();

  // Load media list. The response is a page, and each item already carries its presigned preview
  // URL — the grid used to fire one sequential request per tile, so 200 items meant 200 round
  // trips before a single thumbnail appeared.
  useEffect(() => {
    async function load() {
      const res = await authFetch(`${API_BASE_URL}/api/media?take=${PAGE_SIZE}`);
      if (!res.ok) {
        setLoaded(true);
        return;
      }

      const data = await res.json();
      const page: PublicMedia[] = data.items ?? [];

      setItems(page);
      setHasMore(Boolean(data.hasMore));
      setUrls(urlMapFrom(page));
      setThumbnailUrls(thumbMapFrom(page));
      setLoaded(true);
    }
    load();
  }, [authFetch]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/media?skip=${items.length}&take=${PAGE_SIZE}`);
      if (!res.ok) return;

      const data = await res.json();
      const page: PublicMedia[] = data.items ?? [];

      setItems(prev => [...prev, ...page]);
      setHasMore(Boolean(data.hasMore));
      setUrls(prev => ({ ...prev, ...urlMapFrom(page) }));
      setThumbnailUrls(prev => ({ ...prev, ...thumbMapFrom(page) }));
    } finally {
      setLoadingMore(false);
    }
  }, [authFetch, items.length]);

  // Opening the player is the metered action — fetch the real (charged) streaming URL here.
  const openMedia = useCallback(async (m: PublicMedia) => {
    setSelected(m);
    setPlayerUrl(urls[m.id] ?? null); // optimistic: show preview URL while the metered one loads
    try {
      const res = await authFetch(`${API_BASE_URL}/api/media/${m.id}/url`);
      if (res.ok) {
        const data = await res.json();
        setPlayerUrl(data.url);
      }
    } catch { /* keep optimistic url */ }
  }, [authFetch, urls]);

  // Project cover art whose media isn't itself on this page still needs a URL. This is the only
  // remaining per-item fetch, it runs for a handful of covers at most, and it runs in parallel.
  useEffect(() => {
    const thumbMediaIds = items
      .filter(m => m.projectThumbnailMediaId && !urls[m.projectThumbnailMediaId])
      .map(m => m.projectThumbnailMediaId!)
      .filter((v, i, a) => a.indexOf(v) === i);

    if (thumbMediaIds.length === 0) return;

    let cancelled = false;

    (async () => {
      const results = await Promise.all(
        thumbMediaIds.map(async id => {
          try {
            const res = await authFetch(`${API_BASE_URL}/api/media/${id}/preview`, { silent: true });
            if (!res.ok) return null;
            const data = await res.json();
            return [id, data.thumbnailUrl || data.url] as const;
          } catch {
            return null;
          }
        })
      );

      if (cancelled) return;

      const newUrls = Object.fromEntries(results.filter(r => r !== null)) as Record<string, string>;
      if (Object.keys(newUrls).length > 0) {
        setUrls(prev => ({ ...prev, ...newUrls }));
        setThumbnailUrls(prev => ({ ...prev, ...newUrls }));
      }
    })();

    return () => { cancelled = true; };
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
      (m.ownerDisplayName?.toLowerCase().includes(q)) ||
      (m.ownerHandle?.toLowerCase().includes(q)) ||
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
        // Skeletons, not a spinner: the grid's real shape appears immediately, so the
        // page doesn't reflow when data lands and the wait reads as shorter.
        <div className="grid grid-2" aria-busy="true" aria-label="Loading gallery">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="card media-skeleton" style={{ animationDelay: `${i * 0.05}s` }}>
              <div className="sk-preview" />
              <div className="sk-body">
                <div className="sk-line sk-line-lg" />
                <div className="sk-line sk-line-sm" />
                <div className="sk-owner">
                  <div className="sk-avatar" />
                  <div className="sk-line sk-line-xs" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="sea-empty fade-in-up">
          <IconBeacon size={48} />
          <h3>Nothing has sailed yet</h3>
          <p>
            When people publish work it arrives here, newest first — no ranking, no algorithm.
            Be the first to send something out.
          </p>
          <Link to="/upload" className="btn-primary">Load your work aboard</Link>
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
                    onMediaClick={openMedia}
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
                    onClick={() => openMedia(m)}
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

          {hasMore && (
            <div style={{ textAlign: "center", marginTop: "var(--space-8)" }}>
              <button type="button" className="btn-outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}

      {selected && playerUrl && (
        <EnhancedPlayer
          media={{
            fileName: selected.fileName,
            contentType: selected.contentType,
            description: selected.description,
            ownerName: selected.ownerDisplayName,
            ownerInitial: selected.ownerDisplayName.charAt(0).toUpperCase(),
            projectTitle: selected.projectTitle,
          }}
          url={playerUrl}
          onClose={() => { setSelected(null); setPlayerUrl(null); }}
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
    <div className="card media-skeleton" style={{ animationDelay: `${index * 0.05}s` }}>
      <div className="sk-preview" />
      <div className="sk-body">
        <div className="sk-line sk-line-lg" />
        <div className="sk-line sk-line-sm" />
      </div>
    </div>
  );

  const isImage = media.contentType.startsWith("image/");

  const isAudio = media.contentType.startsWith("audio/");

  return (
    // A clickable <div> is invisible to the keyboard and to screen readers. This is a
    // control, so it announces as one and responds to Enter/Space like every other button.
    <div
      className={`card media-gallery-card stagger-in ${compact ? "compact" : ""}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${media.fileName || "untitled media"}`}
      style={{ cursor: "pointer", overflow: "hidden", animationDelay: `${index * 0.06}s` }}
    >
      {/* Media preview */}
      <div className="media-gallery-preview">
        {isImage ? (
          <img src={thumbnailUrl || url} alt={media.fileName || "Media"} loading="lazy" />
        ) : isAudio ? (
          <>
            <img src={thumbnailUrl || url} alt={media.fileName || "Media"} loading="lazy" />
            <div className="media-play-overlay">
              <div className="media-play-btn">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="white" style={{ marginLeft: "2px" }}>
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Hover samples four moments from across the clip. */}
            <HoverPreview src={url} poster={thumbnailUrl} alt={media.fileName || "Media"} />
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
            title={`View ${media.ownerDisplayName}'s profile`}
          >
            <div className="media-owner-avatar">
              {media.ownerDisplayName.charAt(0).toUpperCase()}
            </div>
            <span className="media-owner-name">
              {media.ownerDisplayName}
            </span>
          </Link>
        ) : (
          <div className="media-gallery-owner">
            <div className="media-owner-avatar">
              {media.ownerDisplayName.charAt(0).toUpperCase()}
            </div>
            <span className="media-owner-name">
              {media.ownerDisplayName}
            </span>
          </div>
        )}

        <div className="media-gallery-meta">
          <span>{(media.fileSize / (1024 * 1024)).toFixed(1)} MB</span>
          <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            {new Date(media.uploadedAt).toLocaleDateString()}
            <ReportButton mediaId={media.id} />
          </span>
        </div>
      </div>
    </div>
  );
}
