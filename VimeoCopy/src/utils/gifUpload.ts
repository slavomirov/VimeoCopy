/**
 * Client half of the GIF generator's storage handshake: presign → PUT → confirm, the same three
 * steps the thumbnail path uses.
 *
 * The confirm step is what makes the clip real. Until the server has read the object's true size
 * out of the bucket and written the key onto the media row, the object is an orphan the nightly
 * sweep is entitled to delete — so a PUT that succeeds without a confirm is worse than no upload
 * at all, because it silently bills storage for a clip nothing will ever serve.
 */

import { API_BASE_URL } from "../config";
import { generatePreviewClip, type PreviewClip } from "./gifGenerator";

/** The subset of the auth helper this needs, so it doesn't drag a React hook into a util. */
type AuthFetch = (url: string, init?: RequestInit & { silent?: boolean }) => Promise<Response>;

export interface StoredPreviewClip {
  /** Unmetered presigned URL of the clip that was just stored. */
  gifUrl: string;
  /** Bytes it occupies, as measured by the server against the bucket. */
  size: number;
}

async function messageFrom(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return body?.message || fallback;
}

/**
 * Uploads an already-generated clip and confirms it. Throws on failure so callers can decide
 * whether that matters — during an upload it doesn't, on an explicit "generate" click it does.
 */
export async function storePreviewClip(
  mediaId: string,
  clip: PreviewClip,
  authFetch: AuthFetch
): Promise<StoredPreviewClip> {
  const urlRes = await authFetch(`${API_BASE_URL}/api/media/${mediaId}/gif/upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: clip.contentType }),
    silent: true,
  });

  if (!urlRes.ok) throw new Error(await messageFrom(urlRes, "Couldn't start the preview clip upload."));

  const { uploadUrl, contentType } = await urlRes.json();

  // Send exactly the type the URL was signed for. Storage compares the header against the
  // signature, so echoing the server's value instead of our own keeps the two from drifting.
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: clip.blob,
  });

  if (!putRes.ok) throw new Error(`Storage rejected the preview clip (${putRes.status}).`);

  const confirmRes = await authFetch(`${API_BASE_URL}/api/media/${mediaId}/gif/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: clip.contentType }),
    silent: true,
  });

  if (!confirmRes.ok) throw new Error(await messageFrom(confirmRes, "Couldn't save the preview clip."));

  return await confirmRes.json();
}

/**
 * Generates a clip from the given source and stores it. Returns null when no clip could be made —
 * an unsupported browser, an unreadable source — which callers should treat as "no preview", not
 * as an error.
 */
export async function generateAndStorePreviewClip(
  mediaId: string,
  source: File | string,
  authFetch: AuthFetch
): Promise<StoredPreviewClip | null> {
  const clip = await generatePreviewClip(source);
  if (!clip) return null;

  return await storePreviewClip(mediaId, clip, authFetch);
}

/** Removes a stored clip; hover falls back to the full file afterwards. */
export async function deletePreviewClip(mediaId: string, authFetch: AuthFetch): Promise<void> {
  const res = await authFetch(`${API_BASE_URL}/api/media/${mediaId}/gif`, {
    method: "DELETE",
    silent: true,
  });

  if (!res.ok) throw new Error(await messageFrom(res, "Couldn't remove the preview clip."));
}
