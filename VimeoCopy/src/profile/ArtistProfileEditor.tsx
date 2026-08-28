import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../Auth/useAuth";
import { API_BASE_URL } from "../config";
import {
  PRESETS, FONTS, DEFAULT_THEME, parseTheme, themeToCssVars,
  ensureFontLoaded, contrastRatio, type ArtistTheme, type RadiusStyle,
} from "./artistTheme";
import "../App.css";
import "./artist-profile.css";

interface MediaLite {
  id: string;
  fileName: string | null;
  contentType: string;
}

const PROFILE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PROFILE_IMAGE_BYTES = 10 * 1024 * 1024;

const COLOR_FIELDS: { key: keyof ArtistTheme; label: string }[] = [
  { key: "bg", label: "Background" },
  { key: "surface", label: "Cards" },
  { key: "text", label: "Text" },
  { key: "textMuted", label: "Muted text" },
  { key: "accent", label: "Accent" },
  { key: "border", label: "Borders" },
];

export function ArtistProfileEditor() {
  const { authFetch, claims } = useAuth();
  const navigate = useNavigate();
  const userId = claims?.sub as string | undefined;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // form state
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [location, setLocation] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [avatarMediaId, setAvatarMediaId] = useState<string | null>(null);
  const [bannerMediaId, setBannerMediaId] = useState<string | null>(null);
  const [bannerOffsetY, setBannerOffsetY] = useState(50);
  const [theme, setTheme] = useState<ArtistTheme>(DEFAULT_THEME);

  // media for avatar/banner picking
  const [media, setMedia] = useState<MediaLite[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null);

  // Load current profile + media
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const [profRes, dataRes] = await Promise.all([
          authFetch(`${API_BASE_URL}/api/profiles/me`),
          authFetch(`${API_BASE_URL}/getData/${userId}`),
        ]);

        if (profRes.ok) {
          const p = await profRes.json();
          setHandle(p.handle ?? "");
          setDisplayName(p.displayName ?? "");
          setBio(p.bio ?? "");
          setWebsiteUrl(p.websiteUrl ?? "");
          setLocation(p.location ?? "");
          setIsPublic(p.isProfilePublic ?? true);
          setAvatarMediaId(p.avatarMediaId ?? null);
          setBannerMediaId(p.bannerMediaId ?? null);
          setBannerOffsetY(typeof p.bannerOffsetY === "number" ? p.bannerOffsetY : 50);
          setTheme(parseTheme(p.themeJson));

          // An image uploaded just for the profile is deliberately absent from the media library,
          // so its preview has to come from the profile payload itself.
          const seeded: Record<string, string> = {};
          if (p.avatarMediaId && p.avatarUrl) seeded[p.avatarMediaId] = p.avatarUrl;
          if (p.bannerMediaId && p.bannerUrl) seeded[p.bannerMediaId] = p.bannerUrl;
          if (Object.keys(seeded).length > 0) setThumbs((prev) => ({ ...prev, ...seeded }));
        }

        if (dataRes.ok) {
          const d = await dataRes.json();
          const list: MediaLite[] = (d.media ?? []).map((m: MediaLite) => ({
            id: m.id, fileName: m.fileName, contentType: m.contentType,
          }));
          setMedia(list);
          // fetch thumbnails/urls for image-ish previews
          for (const m of list) {
            try {
              const r = await authFetch(`${API_BASE_URL}/api/media/${m.id}/preview`);
              if (!r.ok) continue;
              const u = await r.json();
              setThumbs((prev) => ({ ...prev, [m.id]: u.thumbnailUrl || u.url }));
            } catch { /* skip */ }
          }
        }
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // keep fonts loaded for the preview
  useEffect(() => {
    ensureFontLoaded(theme.headingFont);
    ensureFontLoaded(theme.bodyFont);
  }, [theme.headingFont, theme.bodyFont]);

  const cssVars = useMemo(() => themeToCssVars(theme), [theme]);
  const textContrast = contrastRatio(theme.text, theme.surface);
  const lowContrast = textContrast < 4.5;

  function setThemeField<K extends keyof ArtistTheme>(key: K, value: ArtistTheme[K]) {
    setTheme((t) => ({ ...t, [key]: value, preset: undefined }));
  }

  // Uploads straight to storage, then registers the object as a private profile asset. The server
  // attaches it to the profile immediately — "Save profile" just re-sends the same id.
  async function uploadProfileImage(kind: "avatar" | "banner", file: File) {
    if (!PROFILE_IMAGE_TYPES.includes(file.type)) {
      toast.error("Choose a JPEG, PNG or WebP image.");
      return;
    }
    if (file.size > MAX_PROFILE_IMAGE_BYTES) {
      toast.error("That image is larger than 10 MB.");
      return;
    }

    setUploading(kind);
    try {
      const urlRes = await authFetch(`${API_BASE_URL}/api/profiles/me/images/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type }),
      });
      if (!urlRes.ok) return; // authFetch already toasts the error
      const { uploadUrl, mediaId } = await urlRes.json();

      const put = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!put.ok) {
        toast.error("Upload failed. Please try again.");
        return;
      }

      const confirmRes = await authFetch(`${API_BASE_URL}/api/profiles/me/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId, kind, contentType: file.type, fileName: file.name }),
      });
      if (!confirmRes.ok) return;
      const saved = await confirmRes.json();

      setThumbs((prev) => ({ ...prev, [saved.mediaId]: saved.url }));
      if (kind === "avatar") {
        setAvatarMediaId(saved.mediaId);
      } else {
        setBannerMediaId(saved.mediaId);
        setBannerOffsetY(typeof saved.bannerOffsetY === "number" ? saved.bannerOffsetY : 50);
      }
      toast.success(kind === "avatar" ? "Avatar updated" : "Banner updated");
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(null);
    }
  }

  async function handleSave() {
    if (handle && !/^[a-z0-9_-]{3,30}$/.test(handle.trim().toLowerCase())) {
      toast.error("Handle must be 3–30 chars: lowercase letters, numbers, '-' or '_'.");
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/profiles/me`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: handle.trim().toLowerCase() || null,
          displayName: displayName.trim() || null,
          bio: bio.trim() || null,
          websiteUrl: websiteUrl.trim() || null,
          location: location.trim() || null,
          avatarMediaId,
          bannerMediaId,
          bannerOffsetY,
          themeJson: JSON.stringify(theme),
          isProfilePublic: isPublic,
        }),
      });
      if (!res.ok) return; // authFetch already toasts the error
      toast.success("Profile saved");
      if (handle.trim()) navigate(`/u/${handle.trim().toLowerCase()}`);
    } finally {
      setSaving(false);
    }
  }

  if (!userId) {
    return <div className="ap-center"><h2>Please log in to customize your profile.</h2></div>;
  }
  if (loading) {
    return <div className="ap-center"><div className="loading" /><p className="text-muted">Loading…</p></div>;
  }

  return (
    <div className="container" style={{ paddingBottom: "var(--space-16)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-6)", flexWrap: "wrap", gap: "var(--space-3)" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Customize your profile</h1>
          <p className="text-muted" style={{ margin: 0 }}>Make your public space yours — no algorithm, no metrics, just your work.</p>
        </div>
        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          {handle && <Link to={`/u/${handle}`} className="btn-outline">View public page</Link>}
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save profile"}
          </button>
        </div>
      </div>

      <div className="ap-editor-grid">
        {/* ── Form ── */}
        <div>
          <div className="card">
            <div className="card-header"><h2 className="card-title" style={{ marginBottom: 0 }}>Identity</h2></div>
            <div className="card-body">
              <div className="ap-field">
                <label>Handle <span className="ap-hint">— your public URL: /u/{handle || "your-handle"}</span></label>
                <input className="ap-input" value={handle}
                  onChange={(e) => setHandle(e.target.value.toLowerCase())}
                  placeholder="jane-doe" maxLength={30} />
              </div>
              <div className="ap-field">
                <label>Display name</label>
                <input className="ap-input" value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)} placeholder="Jane Doe" maxLength={60} />
              </div>
              <div className="ap-field">
                <label>Artist statement / bio</label>
                <textarea className="ap-textarea" value={bio}
                  onChange={(e) => setBio(e.target.value)} placeholder="A few words about you and your work…" maxLength={1000} />
              </div>
              <div className="ap-color-grid">
                <div className="ap-field" style={{ marginBottom: 0 }}>
                  <label>Website</label>
                  <input className="ap-input" value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="yoursite.com" maxLength={300} />
                </div>
                <div className="ap-field" style={{ marginBottom: 0 }}>
                  <label>Location</label>
                  <input className="ap-input" value={location}
                    onChange={(e) => setLocation(e.target.value)} placeholder="Berlin" maxLength={100} />
                </div>
              </div>
              <label className="media-visibility-toggle" style={{ marginTop: "var(--space-4)" }}>
                <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                Profile is public (visible in search & by link)
              </label>
            </div>
          </div>

          {/* Images */}
          <div className="card" style={{ marginTop: "var(--space-6)" }}>
            <div className="card-header"><h2 className="card-title" style={{ marginBottom: 0 }}>Avatar & banner</h2></div>
            <div className="card-body">
              <p className="text-muted" style={{ fontSize: "var(--font-size-sm)", marginTop: 0 }}>
                Upload an image from your computer, or reuse something you have already published.
                Images uploaded here stay private — they never appear on the media or projects pages.
              </p>
              <div className="ap-field">
                <label>Avatar</label>
                <ProfileImageUpload kind="avatar" busy={uploading === "avatar"} onPick={uploadProfileImage} />
                <MediaPicker media={media} thumbs={thumbs} selected={avatarMediaId} onSelect={setAvatarMediaId} />
              </div>
              <div className="ap-field" style={{ marginBottom: 0 }}>
                <label>Banner</label>
                <ProfileImageUpload kind="banner" busy={uploading === "banner"} onPick={uploadProfileImage} />
                <MediaPicker media={media} thumbs={thumbs} selected={bannerMediaId} onSelect={setBannerMediaId} />
                {bannerMediaId && thumbs[bannerMediaId] && (
                  <BannerAdjuster
                    url={thumbs[bannerMediaId]}
                    offsetY={bannerOffsetY}
                    onChange={setBannerOffsetY}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Theme */}
          <div className="card" style={{ marginTop: "var(--space-6)" }}>
            <div className="card-header"><h2 className="card-title" style={{ marginBottom: 0 }}>Theme</h2></div>
            <div className="card-body">
              <div className="ap-field">
                <label>Start from a mood</label>
                <div className="ap-preset-row">
                  {PRESETS.map((p) => (
                    <button key={p.preset} className={`ap-preset-chip ${theme.preset === p.preset ? "active" : ""}`}
                      onClick={() => setTheme({ ...p })} type="button">
                      <span className="ap-swatch" style={{ background: p.accent }} />
                      {p.preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ap-field">
                <label>Colors</label>
                <div className="ap-color-grid">
                  {COLOR_FIELDS.map((f) => (
                    <div className="ap-color-row" key={f.key}>
                      <input type="color" value={String(theme[f.key])}
                        onChange={(e) => setThemeField(f.key, e.target.value as ArtistTheme[typeof f.key])} />
                      <span>{f.label}</span>
                    </div>
                  ))}
                </div>
                {lowContrast && (
                  <div className="ap-contrast-warn">
                    ⚠ Low contrast between text and cards ({textContrast.toFixed(1)}:1). Aim for 4.5:1 so your work stays readable.
                  </div>
                )}
              </div>

              <div className="ap-color-grid">
                <div className="ap-field" style={{ marginBottom: 0 }}>
                  <label>Heading font</label>
                  <select className="ap-input" value={theme.headingFont}
                    onChange={(e) => setThemeField("headingFont", e.target.value)}>
                    {FONTS.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
                  </select>
                </div>
                <div className="ap-field" style={{ marginBottom: 0 }}>
                  <label>Body font</label>
                  <select className="ap-input" value={theme.bodyFont}
                    onChange={(e) => setThemeField("bodyFont", e.target.value)}>
                    {FONTS.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="ap-field" style={{ marginTop: "var(--space-5)", marginBottom: 0 }}>
                <label>Corners</label>
                <div className="ap-seg">
                  {(["sharp", "soft", "round"] as RadiusStyle[]).map((r) => (
                    <button key={r} type="button" className={theme.radius === r ? "active" : ""}
                      onClick={() => setThemeField("radius", r)}>
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Live preview ── */}
        <div className="ap-preview-sticky">
          <p className="text-muted" style={{ fontSize: "var(--font-size-sm)", marginBottom: "var(--space-2)" }}>Live preview</p>
          <div className="artist-profile" style={{ ...cssVars, minHeight: 0, borderRadius: "var(--radius-lg)", border: "1px solid var(--border-color)", overflow: "hidden", paddingBottom: "var(--space-6)" }}>
            <div className="ap-banner" style={{ height: 110 }}>
              {bannerMediaId && thumbs[bannerMediaId] && (
                <img
                  src={thumbs[bannerMediaId]}
                  alt=""
                  style={{ objectPosition: `50% ${bannerOffsetY}%` }}
                />
              )}
            </div>
            <header className="ap-header" style={{ marginTop: -40, padding: "0 var(--space-4)" }}>
              {avatarMediaId && thumbs[avatarMediaId] ? (
                <img className="ap-avatar" src={thumbs[avatarMediaId]} alt="" style={{ width: 72, height: 72 }} />
              ) : (
                <div className="ap-avatar ap-avatar-fallback" style={{ width: 72, height: 72, fontSize: "1.6rem" }}>
                  {(displayName || handle || "A").charAt(0)}
                </div>
              )}
              <div className="ap-identity">
                <h1 className="ap-name" style={{ fontSize: "1.4rem" }}>{displayName || handle || "Your name"}</h1>
                <div className="ap-handle">@{handle || "your-handle"}</div>
              </div>
            </header>
            <div className="ap-meta" style={{ padding: "0 var(--space-4)", marginTop: "var(--space-4)" }}>
              <p className="ap-bio" style={{ fontSize: "var(--font-size-sm)" }}>
                {bio || "Your artist statement appears here."}
              </p>
            </div>
            <div style={{ padding: "var(--space-4)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
              {media.slice(0, 2).map((m) => (
                <div key={m.id} className="ap-work" style={{ marginBottom: 0 }}>
                  <div className="ap-work-media">
                    {thumbs[m.id]
                      ? <img src={thumbs[m.id]} alt="" />
                      : <div className="ap-work-loading" style={{ aspectRatio: "1" }} />}
                  </div>
                </div>
              ))}
              {media.length === 0 && (
                <>
                  <div className="ap-work" style={{ marginBottom: 0 }}><div className="ap-work-loading" style={{ aspectRatio: "1" }} /></div>
                  <div className="ap-work" style={{ marginBottom: 0 }}><div className="ap-work-loading" style={{ aspectRatio: "1" }} /></div>
                </>
              )}
            </div>
            <div style={{ padding: "0 var(--space-4)" }}>
              <button className="btn-primary" style={{ width: "100%" }} type="button">Accent button</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/// Facebook-style banner repositioning: the upload is never re-encoded, we just record which
/// vertical slice survives the crop as an object-position percentage.
function BannerAdjuster({
  url, offsetY, onChange,
}: {
  url: string;
  offsetY: number;
  onChange: (next: number) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ startY: number; startOffset: number; overflow: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [adjustable, setAdjustable] = useState(true);

  // object-fit: cover only leaves vertical slack when covering by width makes the image taller
  // than the box. A very wide image is cropped horizontally instead, and has nothing to move.
  function verticalOverflow() {
    const img = imgRef.current;
    if (!img || !img.naturalWidth || !img.naturalHeight) return 0;
    return img.clientWidth * (img.naturalHeight / img.naturalWidth) - img.clientHeight;
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const overflow = verticalOverflow();
    if (overflow <= 1) {
      setAdjustable(false);
      return;
    }
    dragRef.current = { startY: e.clientY, startOffset: offsetY, overflow };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    // Scaled by the overflow so the image tracks the cursor 1:1 instead of racing ahead of it.
    const next = drag.startOffset - ((e.clientY - drag.startY) / drag.overflow) * 100;
    onChange(Math.round(Math.min(100, Math.max(0, next))));
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  return (
    <div className="ap-banner-adjust-wrap">
      <div
        className={`ap-banner-adjust ${dragging ? "dragging" : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <img
          ref={imgRef}
          src={url}
          alt=""
          draggable={false}
          style={{ objectPosition: `50% ${offsetY}%` }}
          onLoad={() => setAdjustable(verticalOverflow() > 1)}
        />
        <span className="ap-banner-adjust-hint">
          {adjustable ? "Drag to choose the visible part" : "This image already fits the banner"}
        </span>
      </div>
      <div className="ap-banner-adjust-row">
        <input
          type="range" min={0} max={100} value={offsetY} disabled={!adjustable}
          aria-label="Banner vertical position"
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <button type="button" className="btn-outline ap-banner-reset"
          disabled={!adjustable} onClick={() => onChange(50)}>
          Center
        </button>
      </div>
    </div>
  );
}

function ProfileImageUpload({
  kind, busy, onPick,
}: {
  kind: "avatar" | "banner";
  busy: boolean;
  onPick: (kind: "avatar" | "banner", file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{ marginBottom: "var(--space-3)" }}>
      <button type="button" className="btn-outline" disabled={busy}
        onClick={() => inputRef.current?.click()}>
        {busy ? "Uploading…" : `Upload ${kind} from your computer`}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={PROFILE_IMAGE_TYPES.join(",")}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // cleared first, so re-picking the same file still fires
          if (file) onPick(kind, file);
        }}
      />
    </div>
  );
}

function MediaPicker({
  media, thumbs, selected, onSelect,
}: {
  media: MediaLite[];
  thumbs: Record<string, string>;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const usable = media.filter((m) => !m.contentType.startsWith("audio/"));
  // A profile-only upload isn't in the library, so give it a tile of its own — otherwise the
  // picker would look like nothing is selected.
  const uploaded = selected && !usable.some((m) => m.id === selected) ? selected : null;

  return (
    <div className="ap-thumb-pick">
      <div className={`ap-thumb none ${selected === null ? "active" : ""}`} onClick={() => onSelect(null)}>None</div>
      {uploaded && (
        <div className="ap-thumb active" title="Uploaded for your profile">
          {thumbs[uploaded]
            ? <img src={thumbs[uploaded]} alt="" />
            : <div className="loading" style={{ margin: "auto" }} />}
        </div>
      )}
      {usable.map((m) => (
        <div key={m.id} className={`ap-thumb ${selected === m.id ? "active" : ""}`} onClick={() => onSelect(m.id)} title={m.fileName ?? ""}>
          {thumbs[m.id] ? <img src={thumbs[m.id]} alt={m.fileName ?? ""} /> : <div className="loading" style={{ margin: "auto" }} />}
        </div>
      ))}
    </div>
  );
}
