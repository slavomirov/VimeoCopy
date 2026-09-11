import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useAuth } from "../Auth/useAuth";
import { API_BASE_URL } from "../config";
import toast from "react-hot-toast";
import { ThumbnailPicker } from "./ThumbnailPicker";
import { HoverPreview } from "./HoverPreview";
import { useMyPublicProfile } from "../profile/useMyHandle";
import { canGeneratePreviewClip } from "../utils/gifGenerator";
import { deletePreviewClip, generateAndStorePreviewClip } from "../utils/gifUpload";
import { EnhancedPlayer } from "./EnhancedPlayer";
import "../App.css";

interface Media {
  id: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  uploadedAt: string;
  status: string;
  isPublic: boolean;
  hasThumbnail: boolean;
  /** True once the GIF generator has stored a hover-preview clip for this video. */
  hasGif: boolean;
  /** Whether the owner offers this file for download. */
  downloadable: boolean;
  /** Whether this file is pinned to the top of the owner's public profile. */
  pinned: boolean;
  /** True when staff took this file down — the owner cannot publish it again themselves. */
  staffHidden: boolean;
  /** Why staff hid it, so the appeal can answer it rather than guess. */
  staffHiddenReason: string | null;
  /** True while an appeal for this file is waiting on staff. Set client-side after submitting. */
  republishPending?: boolean;
  showOnMediaPage: boolean;
  description: string | null;
}

interface UserData {
  id: string;
  email: string;
  buyedMemory: number | null;
  usedMemory: number | null;
  freeMemory: number | null;
  buyedBandwidth: number | null;
  usedBandwidth: number | null;
  freeBandwidth: number | null;
  planExpiration: string | null;
  planName: string | null;
  planDescription: string | null;
  media: Media[];
}

/** Tiles rendered per page on the dashboard, matching the public gallery's page size. */
const DASHBOARD_PAGE_SIZE = 24;

function formatBytes(value: number | null | undefined) {
  if (value === null || value === undefined) return "N/A";

  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  const decimals = Number.isInteger(size) ? 0 : 2;
  return `${size.toFixed(decimals)} ${units[unitIndex]}`;
}

export function ProfilePage() {
  const { authFetch, claims } = useAuth();
  const [user, setUser] = useState<UserData | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  /** Media id currently having its hover-preview clip generated, if any. */
  const [gifBusyId, setGifBusyId] = useState<string | null>(null);
  /** Presigned clip URLs, so the owner can see the result of Generate GIF on this page. */
  const [gifUrls, setGifUrls] = useState<Record<string, string>>({});
  /** How many tiles are on screen. The dashboard used to render the whole library at once. */
  const [visibleCount, setVisibleCount] = useState(DASHBOARD_PAGE_SIZE);
  /** Whether this account's plan includes downloads at all — decides toggle vs upsell. */
  const [downloadsAllowed, setDownloadsAllowed] = useState(false);
  const [downloadBusyId, setDownloadBusyId] = useState<string | null>(null);
  const [pinBusyId, setPinBusyId] = useState<string | null>(null);
  /** The file whose takedown the owner is appealing, or null when the dialog is closed. */
  const [republishFor, setRepublishFor] = useState<Media | null>(null);
  const [republishReason, setRepublishReason] = useState("");
  const [republishBusy, setRepublishBusy] = useState(false);
  /** Shared with the sidebar shortcut. /u/{handle}, or null until a handle is claimed. */
  const { path: publicProfilePath } = useMyPublicProfile();
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareLinkExpiry, setShareLinkExpiry] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [embedMedia, setEmbedMedia] = useState<Media | null>(null);
  const [thumbPickerMediaId, setThumbPickerMediaId] = useState<string | null>(null);
  const [thumbUploading, setThumbUploading] = useState(false);
  const [editingDesc, setEditingDesc] = useState<string | null>(null);
  const [descDraft, setDescDraft] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewerMedia, setViewerMedia] = useState<{ media: Media; url: string } | null>(null);

  // Load user DTO
  useEffect(() => {
    async function load() {
      const userId = claims.sub;
      const res = await authFetch(`${API_BASE_URL}/getData/${userId}`);
      const data: UserData = await res.json();

      // Which takedowns this owner has already appealed. Without it, reloading the page turns
      // "Re-publish requested" back into "Request re-publish" and invites a second submission of
      // something the server would only deduplicate anyway.
      let pending = new Set<string>();
      try {
        const mine = await authFetch(`${API_BASE_URL}/api/republish-requests/mine`, { silent: true });
        if (mine.ok) {
          const rows: { mediaId: string; status: string }[] = await mine.json();
          pending = new Set(rows.filter((r) => r.status === "Pending").map((r) => r.mediaId));
        }
      } catch {
        // A dashboard that renders is worth more than one that knows about appeals — the button
        // simply offers to send again, and the server hands back the open request.
      }

      setUser({
        ...data,
        media: data.media.map((m) => (pending.has(m.id) ? { ...m, republishPending: true } : m)),
      });
    }
    load();
  }, [authFetch, claims]);

  // Deleting media is irreversible, so it gets a real in-app confirmation rather than the browser's
  // confirm() — which is unstyled, blocks the page, and can be permanently suppressed by the user,
  // in which case the old code deleted with no confirmation at all.
  async function handleDeleteMedia(mediaId: string) {
    setPendingDeleteId(mediaId);
  }

  async function confirmDeleteMedia() {
    const mediaId = pendingDeleteId;
    if (!mediaId) return;

    setPendingDeleteId(null);
    setDeletingId(mediaId);

    try {
      const res = await authFetch(`${API_BASE_URL}/api/media/Media/Delete/${mediaId}`, {
        method: "DELETE",
        silent: true,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Couldn't delete that media.");
      }

      toast.success("Media deleted.");

      // Remove from user state
      setUser((prevUser) => {
        if (!prevUser) return prevUser;
        return {
          ...prevUser,
          media: prevUser.media.filter((m) => m.id !== mediaId),
        };
      });

      // Remove from URLs cache
      setUrls((prevUrls) => {
        const newUrls = { ...prevUrls };
        delete newUrls[mediaId];
        return newUrls;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete media");
    } finally {
      setDeletingId(null);
    }
  }

  // Handle toggling media visibility
  async function handleToggleVisibility(mediaId: string) {
    try {
      const res = await authFetch(`${API_BASE_URL}/api/media/${mediaId}/toggle-visibility`, {
        method: "PATCH",
      });

      if (!res.ok) {
        throw new Error("Failed to toggle visibility");
      }

      setUser((prevUser) => {
        if (!prevUser) return prevUser;
        return {
          ...prevUser,
          media: prevUser.media.map((m) =>
            m.id === mediaId ? { ...m, isPublic: !m.isPublic } : m
          ),
        };
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle visibility");
    }
  }

  // Handle toggling ShowOnMediaPage
  async function handleToggleShowOnMediaPage(mediaId: string, currentValue: boolean) {
    try {
      const res = await authFetch(`${API_BASE_URL}/api/media/${mediaId}/details`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showOnMediaPage: !currentValue }),
      });

      if (!res.ok) throw new Error("Failed to update media details");

      setUser((prevUser) => {
        if (!prevUser) return prevUser;
        return {
          ...prevUser,
          media: prevUser.media.map((m) =>
            m.id === mediaId ? { ...m, showOnMediaPage: !currentValue } : m
          ),
        };
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
  }

  // Handle saving description
  async function handleSaveDescription(mediaId: string, description: string) {
    try {
      const res = await authFetch(`${API_BASE_URL}/api/media/${mediaId}/details`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });

      if (!res.ok) throw new Error("Failed to update description");

      setUser((prevUser) => {
        if (!prevUser) return prevUser;
        return {
          ...prevUser,
          media: prevUser.media.map((m) =>
            m.id === mediaId ? { ...m, description } : m
          ),
        };
      });
      setEditingDesc(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update description");
    }
  }

  // Handle creating a share link for private media
  async function handleShareMedia(mediaId: string) {
    setShareLoading(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/shared/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId, expirationHours: 24 }),
      });

      if (!res.ok) {
        throw new Error("Failed to create share link");
      }

      const data = await res.json();
      const link = `${window.location.origin}/shared/${data.token}`;
      setShareLink(link);
      setShareToken(data.token);
      setShareLinkExpiry(new Date(data.expiresAt).toLocaleString());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create share link");
    } finally {
      setShareLoading(false);
    }
  }

  // Withdraws the link so the URL stops working immediately.
  async function handleRevokeShareLink() {
    if (!shareToken) return;

    setRevoking(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/shared/${shareToken}`, {
        method: "DELETE",
        silent: true,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Couldn't revoke that link.");
      }

      toast.success("Link revoked — it no longer works.");
      setShareLink(null);
      setShareLinkExpiry(null);
      setShareToken(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke link");
    } finally {
      setRevoking(false);
    }
  }

  // Does this plan include downloads? Asked once, and it decides whether each file gets a working
  // toggle or an explanation of why it doesn't.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`${API_BASE_URL}/api/media/downloads-allowed`, { silent: true });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setDownloadsAllowed(Boolean(data.allowed));
      } catch { /* treat as not allowed; the server refuses anyway */ }
    })();
    return () => { cancelled = true; };
  }, [authFetch]);

  /**
   * Pin one file to the top of the public profile, or unpin it.
   *
   * Not plan-gated: this arranges a page the artist already has and hands a visitor nothing extra.
   * The server refuses a private file — the public profile lists nothing else, so pinning one
   * would be a control that looks like it worked and changed nothing — and it caps how many may be
   * pinned at once, which is the other answer worth showing rather than swallowing.
   */
  async function handleTogglePinned(mediaId: string, current: boolean) {
    setPinBusyId(mediaId);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/media/${mediaId}/pinned`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !current }),
        silent: true,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Couldn't change the pin.");
      }

      toast.success(!current ? "Pinned to your profile." : "Unpinned.");
      setUser((prev) =>
        prev
          ? {
              ...prev,
              media: prev.media.map((m) => (m.id === mediaId ? { ...m, pinned: !current } : m)),
            }
          : prev
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change the pin");
    } finally {
      setPinBusyId(null);
    }
  }

  /**
   * Appeal a takedown.
   *
   * The reason is required, and the dialog says who reads it — an appeal goes to a person, and an
   * owner who knows that writes something answerable instead of one word.
   */
  async function submitRepublish() {
    const media = republishFor;
    const reason = republishReason.trim();
    if (!media || !reason) return;

    setRepublishBusy(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/republish-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId: media.id, reason }),
        silent: true,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Couldn't send that request.");
      }

      toast.success("Sent — we'll take another look and email you.");
      setUser((prev) =>
        prev
          ? {
              ...prev,
              media: prev.media.map((m) => (m.id === media.id ? { ...m, republishPending: true } : m)),
            }
          : prev
      );
      setRepublishFor(null);
      setRepublishReason("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send that request.");
    } finally {
      setRepublishBusy(false);
    }
  }

  /** Offer one file for download, or stop offering it. The server re-checks the plan. */
  async function handleToggleDownloadable(mediaId: string, current: boolean) {
    setDownloadBusyId(mediaId);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/media/${mediaId}/downloadable`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ downloadable: !current }),
        silent: true,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Couldn't change the download setting.");
      }

      toast.success(!current ? "Downloads enabled for this file." : "Downloads disabled.");
      setUser((prev) =>
        prev
          ? {
              ...prev,
              media: prev.media.map((m) => (m.id === mediaId ? { ...m, downloadable: !current } : m)),
            }
          : prev
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change the download setting");
    } finally {
      setDownloadBusyId(null);
    }
  }

  /**
   * Builds (or rebuilds) the hover-preview clip for a video already in storage.
   *
   * New uploads get their clip automatically from the local file. This is the backfill path for
   * everything uploaded before the GIF generator existed, and it works by decoding the stored file
   * in this browser — so it downloads the video, and it only works if storage serves it with CORS
   * headers. That is why it is a deliberate click and not something the dashboard does on its own.
   */
  async function handleGenerateGif(mediaId: string) {
    const source = urls[mediaId];
    if (!source) {
      toast.error("Still loading that video — try again in a moment.");
      return;
    }

    setGifBusyId(mediaId);
    try {
      const stored = await generateAndStorePreviewClip(mediaId, source, authFetch);

      if (!stored) {
        toast.error("Couldn't build a hover preview from this video in your browser.");
        return;
      }

      toast.success("Hover preview ready.");
      setGifUrls((prev) => ({ ...prev, [mediaId]: stored.gifUrl }));
      setUser((prev) =>
        prev
          ? { ...prev, media: prev.media.map((m) => (m.id === mediaId ? { ...m, hasGif: true } : m)) }
          : prev
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to build the hover preview");
    } finally {
      setGifBusyId(null);
    }
  }

  /**
   * Opening a tile is the metered action, so the charged URL is fetched here rather than for every
   * tile up front. The unmetered preview URL is handed to the player immediately so playback can
   * start, and swapped for the charged one when it arrives — the same pattern the gallery uses.
   */
  async function handleExpand(m: Media) {
    const optimistic = urls[m.id];
    if (!optimistic) return;

    setViewerMedia({ media: m, url: optimistic });
    try {
      const res = await authFetch(`${API_BASE_URL}/api/media/${m.id}/url`, { silent: true });
      if (!res.ok) return;
      const data = await res.json();
      if (data.url) setViewerMedia((prev) => (prev && prev.media.id === m.id ? { ...prev, url: data.url } : prev));
    } catch { /* keep the preview URL; playback already started */ }
  }

  /** Drops a clip and its storage cost; hovering the tile goes back to streaming the full file. */
  async function handleRemoveGif(mediaId: string) {
    setGifBusyId(mediaId);
    try {
      await deletePreviewClip(mediaId, authFetch);
      toast.success("Hover preview removed.");
      setGifUrls((prev) => {
        const next = { ...prev };
        delete next[mediaId];
        return next;
      });
      setUser((prev) =>
        prev
          ? { ...prev, media: prev.media.map((m) => (m.id === mediaId ? { ...m, hasGif: false } : m)) }
          : prev
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove the hover preview");
    } finally {
      setGifBusyId(null);
    }
  }

  // Handle uploading a custom thumbnail for an existing media
  async function handleThumbnailCapture(blob: Blob) {
    if (!thumbPickerMediaId) return;
    setThumbUploading(true);
    try {
      // 1. Get presigned PUT URL
      const urlRes = await authFetch(
        `${API_BASE_URL}/api/media/${thumbPickerMediaId}/thumbnail/upload-url`,
        { method: "POST" }
      );
      if (!urlRes.ok) throw new Error("Failed to get thumbnail upload URL");
      const { uploadUrl } = await urlRes.json();

      // 2. Upload thumbnail to S3
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl, true);
        xhr.setRequestHeader("Content-Type", "image/jpeg");
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Upload failed")));
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(blob);
      });

      // 3. Confirm thumbnail on backend
      const confirmRes = await authFetch(
        `${API_BASE_URL}/api/media/${thumbPickerMediaId}/thumbnail/confirm`,
        { method: "POST" }
      );
      if (!confirmRes.ok) throw new Error("Failed to confirm thumbnail");

      // 4. Refresh thumbnail URL
      const mediaRes = await authFetch(`${API_BASE_URL}/api/media/${thumbPickerMediaId}/url`);
      if (mediaRes.ok) {
        const data = await mediaRes.json();
        if (data.thumbnailUrl) {
          setThumbnailUrls((prev) => ({ ...prev, [thumbPickerMediaId]: data.thumbnailUrl }));
        }
      }

      setThumbPickerMediaId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update thumbnail");
    } finally {
      setThumbUploading(false);
    }
  }

  /**
   * Resolve the URLs the visible tiles need.
   *
   * Three things were wrong with how this used to work, and all three only show up once a library
   * gets big:
   *   • it hit /url, the METERED endpoint, which charges the owner's bandwidth for the full file
   *     size per item — so merely opening your own dashboard billed you for your entire library.
   *     Rendering a grid is browsing, so it belongs on the unmetered /preview, exactly as the
   *     gallery does; the charged URL is now fetched when a tile is actually opened.
   *   • it awaited one request per item in series, so 200 files meant 200 sequential round trips.
   *   • it asked for every item in the library, not the ones on screen.
   */
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const pending = user.media
      .slice(0, visibleCount)
      .filter((m) => !urls[m.id]);

    if (pending.length === 0) return;

    (async () => {
      const gotUrls: Record<string, string> = {};
      const gotThumbs: Record<string, string> = {};
      const gotGifs: Record<string, string> = {};

      // Bounded pool. Unlimited parallel fetches just starve each other and can trip the API's
      // rate limiter; a handful at a time is what makes the grid fill quickly.
      let next = 0;
      const workers = Array.from({ length: Math.min(6, pending.length) }, async () => {
        while (next < pending.length && !cancelled) {
          const m = pending[next++];
          try {
            const res = await authFetch(`${API_BASE_URL}/api/media/${m.id}/preview`, { silent: true });
            if (!res.ok) continue;
            const data = await res.json();
            if (data.url) gotUrls[m.id] = data.url;
            if (data.thumbnailUrl) gotThumbs[m.id] = data.thumbnailUrl;
            if (data.gifUrl) gotGifs[m.id] = data.gifUrl;
          } catch { /* a tile that can't resolve keeps its loading state */ }
        }
      });

      await Promise.all(workers);
      if (cancelled) return;

      // Merge, don't replace: paging in more tiles must not drop the ones already resolved.
      setUrls((p) => ({ ...p, ...gotUrls }));
      setThumbnailUrls((p) => ({ ...p, ...gotThumbs }));
      setGifUrls((p) => ({ ...p, ...gotGifs }));
    })();

    return () => { cancelled = true; };
    // urls is read to skip what's already resolved; including it would re-run on every merge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authFetch, visibleCount]);

  if (!user) return <div className="loading" style={{ margin: "var(--space-16) auto" }}></div>;

  return (
    <div className="container">
      <div className="card">
        <div className="card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-3)" }}>
          <h1 style={{ marginBottom: 0 }}>Creator Dashboard</h1>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          {/* "See it as a visitor does" belongs next to the thing that edits it — this is where
              someone thinking about their public profile actually is. /u/{handle} is the only
              public address, so with no handle claimed this leads to the editor that claims one
              rather than vanishing and leaving the feature undiscovered. */}
          <Link
            to={publicProfilePath ?? "/profile/customize"}
            className="btn-outline"
            title={
              publicProfilePath
                ? `Open your public profile at ${publicProfilePath}`
                : "Claim a handle to get your public profile URL"
            }
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: "6px", verticalAlign: "middle" }}>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            View public profile
          </Link>
          <Link to="/settings" className="btn-secondary">Account settings</Link>
          <Link to="/profile/customize" className="btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Customize public profile
          </Link>
          </div>
        </div>

        <div className="card-body">
          <div style={{ marginBottom: "var(--space-6)" }}>
            <p style={{ color: "var(--gray-600)" }}>
              <span style={{ fontWeight: 600 }}>Account Email:</span> {user.email}
            </p>
            <p style={{ color: "var(--gray-600)" }}>
              <span style={{ fontWeight: 600 }}>Published Content:</span> {user.media.length} file{user.media.length !== 1 ? 's' : ''}
            </p>
            <p style={{ color: "var(--gray-600)" }}>
              <span style={{ fontWeight: 600 }}>Plan:</span> {user.planName ?? "N/A"}
            </p>
            <p style={{ color: "var(--gray-600)" }}>
              <span style={{ fontWeight: 600 }}>Buyed Memory:</span> {formatBytes(user.buyedMemory)}
            </p>
            <p style={{ color: "var(--gray-600)" }}>
              <span style={{ fontWeight: 600 }}>Used Memory:</span> {formatBytes(user.usedMemory)}
            </p>
            <p style={{ color: "var(--gray-600)" }}>
              <span style={{ fontWeight: 600 }}>Free Memory:</span> {formatBytes(user.freeMemory)}
            </p>
            <p style={{ color: "var(--gray-600)" }}>
              <span style={{ fontWeight: 600 }}>Plan Expiration:</span> {user.planExpiration ? new Date(user.planExpiration).toLocaleString() : "N/A"}
            </p>
            <p style={{ color: "var(--gray-600)", marginBottom: 0 }}>
              <span style={{ fontWeight: 600 }}>Plan Description:</span> {user.planDescription ?? "N/A"}
            </p>
          </div>
        </div>
      </div>

      <div style={{ marginTop: "var(--space-8)" }}>
        <h2>Your Video Collection</h2>

        {user.media.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "var(--space-12)" }}>
            <p className="text-muted">Your media library is empty. <Link to="/upload">Upload your first video</Link> to get started!</p>
          </div>
        ) : (
          <div className="grid grid-2">
            {user.media.slice(0, visibleCount).map((m) => (
              <MediaItem
                key={m.id}
                media={m}
                url={urls[m.id]}
                thumbnailUrl={thumbnailUrls[m.id]}
                gifUrl={gifUrls[m.id]}
                onDelete={() => handleDeleteMedia(m.id)}
                deleting={deletingId === m.id}
                onToggleVisibility={() => handleToggleVisibility(m.id)}
                onRequestRepublish={() => setRepublishFor(m)}
                onToggleShowOnMediaPage={() => handleToggleShowOnMediaPage(m.id, m.showOnMediaPage)}
                onShare={() => handleShareMedia(m.id)}
                onEmbed={() => setEmbedMedia(m)}
                onChangeThumbnail={() => setThumbPickerMediaId(m.id)}
                downloadsAllowed={downloadsAllowed}
                downloadBusy={downloadBusyId === m.id}
                onToggleDownloadable={() => handleToggleDownloadable(m.id, m.downloadable)}
                pinBusy={pinBusyId === m.id}
                onTogglePinned={() => handleTogglePinned(m.id, m.pinned)}
                onGenerateGif={() => handleGenerateGif(m.id)}
                onRemoveGif={() => handleRemoveGif(m.id)}
                gifBusy={gifBusyId === m.id}
                onExpand={() => handleExpand(m)}
                shareLoading={shareLoading}
                isEditingDesc={editingDesc === m.id}
                descDraft={editingDesc === m.id ? descDraft : ""}
                onStartEditDesc={() => { setEditingDesc(m.id); setDescDraft(m.description || ""); }}
                onDescDraftChange={setDescDraft}
                onSaveDesc={() => handleSaveDescription(m.id, descDraft)}
                onCancelDesc={() => setEditingDesc(null)}
              />
            ))}
          </div>
        )}

        {/* Page in the rest on demand. Rendering a whole library at once is what made a large
            account unusable — every extra tile is a card, a video element and a presign. */}
        {user.media.length > visibleCount && (
          <div style={{ textAlign: "center", marginTop: "var(--space-6)" }}>
            <button
              type="button"
              className="btn-outline"
              onClick={() => setVisibleCount((n) => n + DASHBOARD_PAGE_SIZE)}
            >
              Show more ({user.media.length - visibleCount} remaining)
            </button>
          </div>
        )}
      </div>

      {/* Share Link Modal */}
      {shareLink && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--overlay-medium)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => { setShareLink(null); setShareLinkExpiry(null); }}
        >
          <div
            className="card"
            style={{ maxWidth: "500px", width: "90%", margin: "0 auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-header">
              <h2 className="card-title" style={{ marginBottom: 0 }}>Temporary Share Link</h2>
            </div>
            <div className="card-body">
              <p className="text-muted" style={{ fontSize: "var(--font-size-sm)", marginBottom: "var(--space-4)" }}>
                Anyone with this link can view the media — no account required. The link expires on <strong>{shareLinkExpiry}</strong>.
              </p>
              <div style={{
                display: "flex",
                gap: "var(--space-2)",
                alignItems: "center",
              }}>
                <input
                  type="text"
                  readOnly
                  value={shareLink}
                  style={{
                    flex: 1,
                    padding: "var(--space-3)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-color)",
                    backgroundColor: "var(--bg-elevated)",
                    color: "var(--text-primary)",
                    fontSize: "var(--font-size-sm)",
                  }}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  className="btn-primary"
                  style={{ whiteSpace: "nowrap" }}
                  onClick={() => {
                    navigator.clipboard.writeText(shareLink);
                    toast.success("Link copied to clipboard.");
                  }}
                >
                  Copy
                </button>
              </div>
              <div className="confirm-actions" style={{ marginTop: "var(--space-4)" }}>
                {/* A share you can't withdraw isn't really a temporary share. */}
                <button
                  className="btn-danger"
                  onClick={handleRevokeShareLink}
                  disabled={revoking}
                >
                  {revoking ? "Revoking…" : "Revoke link"}
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => { setShareLink(null); setShareLinkExpiry(null); setShareToken(null); }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Re-publish appeal */}
      {republishFor && (
        <div
          className="confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-republish-title"
          onClick={() => { setRepublishFor(null); setRepublishReason(""); }}
        >
          <div className="card confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h2 id="confirm-republish-title" className="card-title">Ask us to re-publish this?</h2>

            {/* What we said, first. An appeal written without the takedown reason in front of you
                is a guess, and a guess is what gets refused. */}
            {republishFor.staffHiddenReason ? (
              <p className="text-muted" style={{ marginBottom: "var(--space-3)" }}>
                <strong>We made “{republishFor.fileName || "this file"}” private because:</strong>{" "}
                {republishFor.staffHiddenReason}
              </p>
            ) : (
              <p className="text-muted" style={{ marginBottom: "var(--space-3)" }}>
                We made “{republishFor.fileName || "this file"}” private.
              </p>
            )}

            <label style={{ display: "block", fontSize: "var(--font-size-sm)", fontWeight: 600, marginBottom: 4 }}>
              Why should it go back up?
            </label>
            <textarea
              value={republishReason}
              autoFocus
              rows={4}
              maxLength={1000}
              placeholder="A person reads this — tell them what they've missed."
              onChange={(e) => setRepublishReason(e.target.value)}
            />

            <div className="confirm-actions" style={{ marginTop: "var(--space-4)" }}>
              <button
                className="btn-primary"
                onClick={submitRepublish}
                disabled={republishBusy || republishReason.trim().length === 0}
              >
                {republishBusy ? "Sending…" : "Send request"}
              </button>
              <button
                className="btn-secondary"
                onClick={() => { setRepublishFor(null); setRepublishReason(""); }}
                disabled={republishBusy}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {pendingDeleteId && (
        <div
          className="confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-delete-title"
          onClick={() => setPendingDeleteId(null)}
        >
          <div className="card confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h2 id="confirm-delete-title" className="card-title">Delete this media?</h2>
            <p className="text-muted">
              The file and its thumbnail are removed from storage permanently. This can't be undone.
            </p>
            <div className="confirm-actions">
              <button type="button" className="btn-outline" onClick={() => setPendingDeleteId(null)}>
                Keep it
              </button>
              <button type="button" className="btn-danger" onClick={confirmDeleteMedia} autoFocus>
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Embed Code Modal */}
      {embedMedia && (
        <EmbedModal
          media={embedMedia}
          onClose={() => setEmbedMedia(null)}
        />
      )}

      {/* Enhanced Player */}
      {viewerMedia && (
        <EnhancedPlayer
          media={{
            fileName: viewerMedia.media.fileName,
            contentType: viewerMedia.media.contentType,
            description: viewerMedia.media.description,
            ownerName: String(claims.name || claims.email || "You").split("@")[0],
            ownerInitial: String(claims.name || claims.email || "U").charAt(0).toUpperCase(),
          }}
          url={viewerMedia.url}
          onClose={() => setViewerMedia(null)}
        />
      )}

      {/* Thumbnail Picker Modal */}
      {thumbPickerMediaId && urls[thumbPickerMediaId] && createPortal(
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

function MediaItem({
  media,
  url,
  thumbnailUrl,
  gifUrl,
  onDelete,
  deleting,
  onToggleVisibility,
  onRequestRepublish,
  onToggleShowOnMediaPage,
  onShare,
  onEmbed,
  onChangeThumbnail,
  downloadsAllowed,
  downloadBusy,
  onToggleDownloadable,
  pinBusy,
  onTogglePinned,
  onGenerateGif,
  onRemoveGif,
  gifBusy,
  onExpand,
  shareLoading,
  isEditingDesc,
  descDraft,
  onStartEditDesc,
  onDescDraftChange,
  onSaveDesc,
  onCancelDesc,
}: {
  media: Media;
  url?: string;
  thumbnailUrl?: string;
  gifUrl?: string;
  onDelete: () => void;
  deleting?: boolean;
  onToggleVisibility: () => void;
  onRequestRepublish: () => void;
  onToggleShowOnMediaPage: () => void;
  onShare: () => void;
  onEmbed: () => void;
  onChangeThumbnail: () => void;
  downloadsAllowed: boolean;
  downloadBusy: boolean;
  onToggleDownloadable: () => void;
  pinBusy: boolean;
  onTogglePinned: () => void;
  onGenerateGif: () => void;
  onRemoveGif: () => void;
  gifBusy: boolean;
  onExpand: () => void;
  shareLoading: boolean;
  isEditingDesc: boolean;
  descDraft: string;
  onStartEditDesc: () => void;
  onDescDraftChange: (v: string) => void;
  onSaveDesc: () => void;
  onCancelDesc: () => void;
}) {

  if (!url) return <div className="card" style={{ padding: "var(--space-8)", textAlign: "center" }}><div className="loading" style={{ margin: "0 auto" }}></div></div>;

  const isImage = media.contentType.startsWith("image/");
  const isVideo = media.contentType.startsWith("video/");
  const isAudio = media.contentType.startsWith("audio/");

  return (
    <div className="card">
      <div style={{ width: "100%", height: "200px", borderRadius: "var(--radius-lg)", overflow: "hidden", backgroundColor: "var(--bg-deep)", marginBottom: "var(--space-4)", position: "relative", cursor: (isVideo || isImage || isAudio) ? "pointer" : "default" }}
        onClick={() => {
          if (isVideo) { onExpand(); }
          else if (isImage || isAudio) { onExpand(); }
        }}
      >
        {isImage && (
          <>
            <img src={thumbnailUrl || url} alt={media.fileName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            {/* Expand overlay */}
            <div style={{
              position: "absolute", top: "var(--space-2)", right: "var(--space-2)",
              width: "32px", height: "32px", borderRadius: "50%",
              backgroundColor: "rgba(0,0,0,0.5)", display: "flex",
              alignItems: "center", justifyContent: "center",
              opacity: 0.7, transition: "opacity 0.2s",
            }} className="expand-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            </div>
          </>
        )}
        {isVideo && (
          <>
            {thumbnailUrl || gifUrl ? (
              <HoverPreview clipSrc={gifUrl} poster={thumbnailUrl} alt={media.fileName} />
            ) : (
              <video src={url} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            )}
            {/* Play button overlay. pointerEvents MUST be none: it covers the whole tile, so with
                hit-testing on it swallows the pointerenter that arms the hover preview — the same
                bug .media-play-overlay had in App.css. The click handler is on the parent. */}
            <div style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--overlay-light)",
              transition: "background 0.2s",
              pointerEvents: "none",
            }}>
              <div style={{
                width: "52px",
                height: "52px",
                borderRadius: "50%",
                backgroundColor: "rgba(var(--primary-rgb), 0.9)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 12px rgba(var(--primary-rgb), 0.4)",
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--btn-primary-text)" style={{ marginLeft: "2px" }}>
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              </div>
            </div>
          </>
        )}

        {isAudio && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: "var(--space-3)" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" strokeWidth="1.5">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            <audio src={url} controls style={{ width: "90%" }} />
          </div>
        )}
      </div>

      <div style={{ marginBottom: "var(--space-3)" }}>
        <p style={{ fontWeight: 500, marginBottom: "var(--space-1)" }}>{media.fileName}</p>
        <p className="text-muted" style={{ fontSize: "var(--font-size-sm)", marginBottom: "var(--space-1)" }}>
          {(media.fileSize / (1024 * 1024)).toFixed(2)} MB
        </p>
        <p className="text-muted" style={{ fontSize: "var(--font-size-xs)", marginBottom: "var(--space-1)" }}>
          Status: <span style={{ color: "var(--success)", fontWeight: 600 }}>{media.status || 'Ready'}</span>
        </p>
        <p style={{ fontSize: "var(--font-size-xs)", marginBottom: 0 }}>
          <span style={{
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: "var(--radius-sm)",
            fontWeight: 600,
            fontSize: "var(--font-size-xs)",
            backgroundColor: media.isPublic ? "rgba(var(--primary-rgb), 0.15)" : "rgba(var(--danger-rgb), 0.15)",
            color: media.isPublic ? "var(--success)" : "var(--danger)",
          }}>
            {media.isPublic ? "Public" : "Private"}
          </span>
        </p>

        {/* Description */}
        <div style={{ marginTop: "var(--space-2)" }}>
          {isEditingDesc ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              <textarea
                className="media-desc-input"
                rows={2}
                placeholder="Add a description..."
                value={descDraft}
                onChange={(e) => onDescDraftChange(e.target.value)}
              />
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <button className="btn-primary" style={{ fontSize: "var(--font-size-xs)", padding: "var(--space-1) var(--space-3)" }} onClick={onSaveDesc}>Save</button>
                <button className="btn-secondary" style={{ fontSize: "var(--font-size-xs)", padding: "var(--space-1) var(--space-3)" }} onClick={onCancelDesc}>Cancel</button>
              </div>
            </div>
          ) : (
            <p
              onClick={onStartEditDesc}
              style={{
                fontSize: "var(--font-size-xs)",
                color: media.description ? "var(--gray-400)" : "var(--gray-500)",
                cursor: "pointer",
                fontStyle: media.description ? "normal" : "italic",
                marginBottom: 0,
                transition: "color 0.2s ease",
              }}
              title="Click to edit description"
            >
              {media.description || "Click to add description..."}
            </p>
          )}
        </div>

        {/* Show on Media Page toggle */}
        <label className="media-visibility-toggle" style={{ marginTop: "var(--space-2)" }}>
          <input
            type="checkbox"
            checked={media.showOnMediaPage}
            onChange={onToggleShowOnMediaPage}
          />
          Show on Media Gallery
        </label>
      </div>

      <div className="media-actions">
        {/* A file staff took down is not the owner's to put back — the server refuses the toggle.
            Showing the button anyway and letting it fail would be a worse way to learn that, so
            the control becomes the appeal instead, and says who it is addressed to. */}
        {media.staffHidden && !media.isPublic ? (
          <button
            onClick={onRequestRepublish}
            className={media.republishPending ? "btn-secondary" : "btn-primary"}
            disabled={media.republishPending}
            title={media.republishPending
              ? "We've got your request and will take another look."
              : "Ask us to put this back up"}
          >
            {media.republishPending ? "Re-publish requested" : "Request re-publish"}
          </button>
        ) : (
          <button
            onClick={onToggleVisibility}
            className={media.isPublic ? "btn-secondary" : "btn-primary"}
          >
            {media.isPublic ? "Make Private" : "Make Public"}
          </button>
        )}
        {!media.isPublic && (
          <button
            onClick={onShare}
            disabled={shareLoading}
            className="btn-primary"
          >
            {shareLoading ? "..." : "Share Link"}
          </button>
        )}
        <button
          onClick={onEmbed}
          className="btn-outline"
          title="Get embed code"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: "4px", verticalAlign: "middle" }}>
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
          Embed
        </button>
        {media.contentType.startsWith("video/") && (
          <button onClick={onChangeThumbnail} className="btn-outline" title="Change thumbnail">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: "4px", verticalAlign: "middle" }}>
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            Thumbnail
          </button>
        )}
        {/* The hover preview only means anything for video, and only where this browser can record
            one — Safari on older versions has no usable MediaRecorder, and offering a button that
            can only fail is worse than not offering it. */}
        {media.contentType.startsWith("video/") && canGeneratePreviewClip() && (
          <button
            onClick={media.hasGif ? onRemoveGif : onGenerateGif}
            className="btn-outline"
            disabled={gifBusy}
            title={
              media.hasGif
                ? "Remove the clip that plays when someone hovers this video"
                : "Build the short clip that plays when someone hovers this video"
            }
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: "4px", verticalAlign: "middle" }}>
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <polygon points="10,9 15,12 10,15" fill="currentColor" stroke="none" />
            </svg>
            {gifBusy ? "Working…" : media.hasGif ? "Remove GIF" : "Generate GIF"}
          </button>
        )}
        {/* Downloads are plan-gated. When the plan doesn't include them the control stays visible
            but inert and says why — hiding it entirely just leaves people wondering where it went. */}
        <button
          onClick={downloadsAllowed ? onToggleDownloadable : undefined}
          className={media.downloadable ? "btn-secondary" : "btn-outline"}
          disabled={!downloadsAllowed || downloadBusy}
          title={
            !downloadsAllowed
              ? "File downloads are included with the Gold and Platinum plans."
              : media.downloadable
                ? "Anyone who can see this file can download the original. Click to stop offering it."
                : "Let viewers download the original file."
          }
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: "4px", verticalAlign: "middle" }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {downloadBusy ? "…" : media.downloadable ? "Downloads on" : "Downloads off"}
        </button>
        {/* Pinned to the public profile. Deliberately NOT plan-gated — this only rearranges a page
            the artist already has. Only public files can be pinned, since the profile lists nothing
            else, so the control says so rather than failing on click. */}
        <button
          onClick={media.isPublic ? onTogglePinned : undefined}
          className={media.pinned ? "btn-secondary" : "btn-outline"}
          disabled={!media.isPublic || pinBusy}
          title={
            !media.isPublic
              ? "Make this file public before pinning it to your profile."
              : media.pinned
                ? "Shown first on your public profile. Click to unpin."
                : "Pin this to the top of your public profile."
          }
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "4px", verticalAlign: "middle" }}>
            <path d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6z" /><line x1="12" y1="15" x2="12" y2="21" />
          </svg>
          {pinBusy ? "…" : media.pinned ? "Pinned" : "Pin to profile"}
        </button>
        <button onClick={onDelete} className="btn-danger" disabled={deleting}>
          Delete
        </button>
      </div>
    </div>
  );
}

function EmbedModal({ media, onClose }: { media: Media; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [width, setWidth] = useState("640");
  const [height, setHeight] = useState("360");

  const embedUrl = `${window.location.origin}/embed/${media.id}`;
  const iframeCode = `<iframe src="${embedUrl}" width="${width}" height="${height}" frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>`;

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--overlay-medium)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: "600px", width: "90%", margin: "0 auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-header">
          <h2 className="card-title" style={{ marginBottom: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: "8px", verticalAlign: "middle" }}>
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
            Embed Player
          </h2>
        </div>
        <div className="card-body">
          <p className="text-muted" style={{ fontSize: "var(--font-size-sm)", marginBottom: "var(--space-4)" }}>
            Copy the embed code below and paste it into any website's HTML to embed <strong>{media.fileName}</strong>.
          </p>

          {!media.isPublic && (
            <div style={{
              padding: "var(--space-3) var(--space-4)",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "rgba(var(--warning-rgb), 0.1)",
              border: "1px solid rgba(var(--warning-rgb), 0.3)",
              color: "var(--warning)",
              fontSize: "var(--font-size-sm)",
              marginBottom: "var(--space-4)",
            }}>
              ⚠ This media is currently <strong>private</strong>. The embed will not work until you make it public.
            </div>
          )}

          {/* Size controls */}
          <div className="embed-size-controls">
            <div style={{ flex: 1, minWidth: "80px" }}>
              <label style={{ fontSize: "var(--font-size-xs)", marginBottom: "var(--space-1)" }}>Width (px)</label>
              <input
                type="number"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--font-size-sm)" }}
              />
            </div>
            <div style={{ flex: 1, minWidth: "80px" }}>
              <label style={{ fontSize: "var(--font-size-xs)", marginBottom: "var(--space-1)" }}>Height (px)</label>
              <input
                type="number"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--font-size-sm)" }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--space-2)" }}>
              {[
                { label: "SD", w: "640", h: "360" },
                { label: "HD", w: "1280", h: "720" },
              ].map((preset) => (
                <button
                  key={preset.label}
                  className="btn-secondary"
                  style={{ fontSize: "var(--font-size-xs)", padding: "var(--space-2) var(--space-3)" }}
                  onClick={() => { setWidth(preset.w); setHeight(preset.h); }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Iframe code */}
          <label style={{ fontSize: "var(--font-size-xs)", marginBottom: "var(--space-1)" }}>Embed Code</label>
          <div style={{ position: "relative" }}>
            <textarea
              readOnly
              value={iframeCode}
              rows={3}
              style={{
                width: "100%",
                padding: "var(--space-3)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-color)",
                backgroundColor: "var(--bg-elevated)",
                color: "var(--gray-900)",
                fontSize: "var(--font-size-sm)",
                fontFamily: "'Courier New', Courier, monospace",
                resize: "none",
              }}
              onFocus={(e) => e.target.select()}
            />
            <button
              className="btn-primary"
              style={{
                position: "absolute",
                top: "var(--space-2)",
                right: "var(--space-2)",
                fontSize: "var(--font-size-xs)",
                padding: "var(--space-1) var(--space-3)",
              }}
              onClick={() => copyToClipboard(iframeCode, "iframe")}
            >
              {copied === "iframe" ? "Copied!" : "Copy"}
            </button>
          </div>

          {/* Direct URL */}
          <label style={{ fontSize: "var(--font-size-xs)", marginBottom: "var(--space-1)", marginTop: "var(--space-4)", display: "block" }}>Direct Player URL</label>
          <div style={{
            display: "flex",
            gap: "var(--space-2)",
            alignItems: "center",
          }}>
            <input
              type="text"
              readOnly
              value={embedUrl}
              style={{
                flex: 1,
                padding: "var(--space-3)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-color)",
                backgroundColor: "var(--bg-elevated)",
                color: "var(--gray-900)",
                fontSize: "var(--font-size-sm)",
              }}
              onFocus={(e) => e.target.select()}
            />
            <button
              className="btn-primary"
              style={{ whiteSpace: "nowrap", fontSize: "var(--font-size-sm)" }}
              onClick={() => copyToClipboard(embedUrl, "url")}
            >
              {copied === "url" ? "Copied!" : "Copy"}
            </button>
          </div>

          {/* Preview */}
          <label style={{ fontSize: "var(--font-size-xs)", marginBottom: "var(--space-1)", marginTop: "var(--space-4)", display: "block" }}>Preview</label>
          <div style={{
            borderRadius: "var(--radius-md)",
            overflow: "hidden",
            border: "1px solid var(--border-color)",
            backgroundColor: "var(--bg-deep)",
            maxHeight: "300px",
          }}>
            <iframe
              src={embedUrl}
              width="100%"
              height="250"
              style={{ border: "none", display: "block" }}
              allow="autoplay; fullscreen"
              allowFullScreen
            />
          </div>

          <div style={{ marginTop: "var(--space-4)", textAlign: "right" }}>
            <button
              className="btn-secondary"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
