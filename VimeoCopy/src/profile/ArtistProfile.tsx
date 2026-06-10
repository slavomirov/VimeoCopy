import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { API_BASE_URL } from "../config";
import { EnhancedPlayer } from "../components/EnhancedPlayer";
import { useAuth } from "../Auth/useAuth";
import {
  parseTheme,
  themeToCssVars,
  ensureFontLoaded,
  type ArtistTheme,
} from "./artistTheme";
import "../App.css";
import "./artist-profile.css";

interface Work {
  id: string;
  fileName: string | null;
  contentType: string;
  description: string | null;
  hasThumbnail: boolean;
  uploadedAt: string;
  projectId: string | null;
  projectTitle: string | null;
}

interface Album {
  id: string;
  title: string;
  description: string | null;
  workCount: number;
  coverUrl: string | null;
}

interface PublicProfile {
  handle: string;
  displayName: string;
  bio: string | null;
  websiteUrl: string | null;
  location: string | null;
  createdAt: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  themeJson: string | null;
  works: Work[];
  albums: Album[];
}

export function ArtistProfile() {
  const { handle } = useParams<{ handle: string }>();
  const { claims } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "notfound">("loading");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Work | null>(null);
  const [playerUrl, setPlayerUrl] = useState<string | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);

  // Load profile
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setProfile(null);
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/profiles/${encodeURIComponent(handle ?? "")}`);
        if (!res.ok) { if (!cancelled) setStatus("notfound"); return; }
        const data: PublicProfile = await res.json();
        if (cancelled) return;
        setProfile(data);
        setStatus("ok");
      } catch {
        if (!cancelled) setStatus("notfound");
      }
    })();
    return () => { cancelled = true; };
  }, [handle]);

  const theme: ArtistTheme = useMemo(() => parseTheme(profile?.themeJson), [profile?.themeJson]);

  // Lazy-load the chosen fonts
  useEffect(() => {
    ensureFontLoaded(theme.headingFont);
    ensureFontLoaded(theme.bodyFont);
  }, [theme.headingFont, theme.bodyFont]);

  // Resolve presigned URLs for each work
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    (async () => {
      for (const w of profile.works) {
        if (urls[w.id]) continue;
        try {
          // Unmetered preview — rendering the gallery must not burn the artist's bandwidth.
          const res = await fetch(`${API_BASE_URL}/api/media/${w.id}/preview`);
          if (!res.ok) continue;
          const data = await res.json();
          if (cancelled) return;
          setUrls((p) => ({ ...p, [w.id]: data.url }));
          if (data.thumbnailUrl) setThumbs((p) => ({ ...p, [w.id]: data.thumbnailUrl }));
        } catch { /* skip */ }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // Opening a work is the metered action — fetch the charged streaming URL here.
  async function openWork(w: Work) {
    setSelected(w);
    setPlayerUrl(urls[w.id] ?? null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/media/${w.id}/url`);
      if (res.ok) {
        const data = await res.json();
        setPlayerUrl(data.url);
      }
    } catch { /* keep optimistic preview url */ }
  }

  if (status === "loading") {
    return (
      <div className="ap-center">
        <div className="loading" />
        <p className="text-muted">Loading profile…</p>
      </div>
    );
  }

  if (status === "notfound" || !profile) {
    return (
      <div className="ap-center">
        <h1>Profile not found</h1>
        <p className="text-muted">No artist with the handle “{handle}”.</p>
        <Link to="/artists" className="btn-primary">Discover artists</Link>
      </div>
    );
  }

  const isOwner = !!claims?.sub && profile.handle === (claims.handle as string | undefined);
  const cssVars = themeToCssVars(theme);

  const visibleWorks = selectedAlbum
    ? profile.works.filter((w) => w.projectId === selectedAlbum)
    : profile.works;
  const selectedAlbumTitle = selectedAlbum
    ? profile.albums.find((a) => a.id === selectedAlbum)?.title ?? null
    : null;

  return (
    <div className="artist-profile" style={cssVars}>
      {profile.bannerUrl && (
        <div className="ap-banner"><img src={profile.bannerUrl} alt="" /></div>
      )}

      <header className="ap-header">
        {profile.avatarUrl ? (
          <img className="ap-avatar" src={profile.avatarUrl} alt={profile.displayName} />
        ) : (
          <div className="ap-avatar ap-avatar-fallback">{profile.displayName.charAt(0)}</div>
        )}
        <div className="ap-identity">
          <h1 className="ap-name">{profile.displayName}</h1>
          <div className="ap-handle">@{profile.handle}</div>
        </div>
      </header>

      <div className="ap-meta">
        {profile.bio && <p className="ap-bio">{profile.bio}</p>}
        <div className="ap-links">
          {profile.location && (
            <span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
              </svg>
              {profile.location}
            </span>
          )}
          {profile.websiteUrl && (
            <span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <a href={normalizeUrl(profile.websiteUrl)} target="_blank" rel="noreferrer noopener">
                {prettyUrl(profile.websiteUrl)}
              </a>
            </span>
          )}
          <span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Since {new Date(profile.createdAt).getFullYear()}
          </span>
        </div>
      </div>

      {profile.albums.length > 0 && (
        <>
          <div className="ap-section-head">
            <h2>Albums</h2>
            <span className="ap-count">{profile.albums.length} album{profile.albums.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="ap-albums">
            {profile.albums.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`ap-album ${selectedAlbum === a.id ? "active" : ""}`}
                onClick={() => setSelectedAlbum(selectedAlbum === a.id ? null : a.id)}
              >
                <div className="ap-album-cover">
                  {a.coverUrl
                    ? <img src={a.coverUrl} alt={a.title} loading="lazy" />
                    : <div className="ap-album-cover-empty" />}
                  <span className="ap-album-count">{a.workCount}</span>
                </div>
                <div className="ap-album-info">
                  <p className="ap-album-title">{a.title}</p>
                  {a.description && <p className="ap-album-desc">{a.description}</p>}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="ap-section-head">
        <h2>{selectedAlbumTitle ?? "Works"}</h2>
        <div className="ap-section-actions">
          {selectedAlbum && (
            <button type="button" className="ap-show-all" onClick={() => setSelectedAlbum(null)}>
              Show all
            </button>
          )}
          <span className="ap-count">{visibleWorks.length} piece{visibleWorks.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {visibleWorks.length === 0 ? (
        <div className="ap-empty">This artist hasn’t published any public works yet.</div>
      ) : (
        <div className="ap-gallery">
          {visibleWorks.map((w) => (
            <WorkTile
              key={w.id}
              work={w}
              url={urls[w.id]}
              thumb={thumbs[w.id]}
              onOpen={() => openWork(w)}
            />
          ))}
        </div>
      )}

      {isOwner && (
        <div className="ap-owner-bar">
          <Link to="/profile/customize" className="btn-primary">Customize profile</Link>
        </div>
      )}

      {selected && playerUrl && (
        <EnhancedPlayer
          media={{
            fileName: selected.fileName,
            contentType: selected.contentType,
            description: selected.description,
            ownerName: profile.displayName,
            ownerInitial: profile.displayName.charAt(0).toUpperCase(),
            projectTitle: selected.projectTitle,
          }}
          url={playerUrl}
          onClose={() => { setSelected(null); setPlayerUrl(null); }}
        />
      )}
    </div>
  );
}

function WorkTile({
  work, url, thumb, onOpen,
}: { work: Work; url?: string; thumb?: string; onOpen: () => void }) {
  const isImage = work.contentType.startsWith("image/");
  const isVideo = work.contentType.startsWith("video/");
  const isAudio = work.contentType.startsWith("audio/");

  return (
    <div className="ap-work" onClick={onOpen}>
      <div className="ap-work-media">
        {!url ? (
          <div className="ap-work-loading"><div className="loading" /></div>
        ) : isImage ? (
          <img src={thumb || url} alt={work.fileName || "Work"} loading="lazy" />
        ) : isVideo ? (
          <>
            {thumb ? <img src={thumb} alt={work.fileName || "Work"} loading="lazy" /> : <video src={url} />}
            <div className="ap-play">
              <div className="ap-play-btn">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff" style={{ marginLeft: 2 }}>
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              </div>
            </div>
          </>
        ) : (
          <div className="ap-work-loading">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" strokeWidth="1.5">
              <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
            </svg>
          </div>
        )}
        <span className="ap-badge">{isImage ? "IMG" : isAudio ? "AUD" : "VID"}</span>
      </div>
      <div className="ap-work-caption">
        <p className="ap-work-title">{work.fileName || "Untitled"}</p>
        {work.description && <p className="ap-work-desc">{work.description}</p>}
        {work.projectTitle && <span className="ap-work-project">{work.projectTitle}</span>}
      </div>
    </div>
  );
}

function normalizeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
function prettyUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}
