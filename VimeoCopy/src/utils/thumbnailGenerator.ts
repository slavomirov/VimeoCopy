/**
 * Client-side thumbnail generation for images and videos.
 * Produces a JPEG blob suitable for upload to S3.
 */

const THUMB_MAX_WIDTH = 480;
const THUMB_MAX_HEIGHT = 360;
const THUMB_QUALITY = 0.8;

/**
 * Generate a thumbnail blob from a File.
 * Returns null for audio or unsupported types.
 */
export async function generateThumbnail(file: File): Promise<Blob | null> {
  const type = file.type || "";

  if (type.startsWith("image/")) {
    return generateImageThumbnail(file);
  }

  if (type.startsWith("video/")) {
    return generateVideoThumbnail(file);
  }

  // Audio and other types — no thumbnail
  return null;
}

function generateImageThumbnail(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const blob = drawToCanvas(img, img.naturalWidth, img.naturalHeight);
      URL.revokeObjectURL(url);
      resolve(blob);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    img.src = url;
  });
}

function generateVideoThumbnail(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);

    video.muted = true;
    video.preload = "auto";

    // Seek to 1 second (or 0 for very short clips)
    video.onloadeddata = () => {
      video.currentTime = Math.min(1, video.duration * 0.1);
    };

    video.onseeked = () => {
      const blob = drawToCanvas(video, video.videoWidth, video.videoHeight);
      URL.revokeObjectURL(url);
      resolve(blob);
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    // Timeout fallback — if seeking takes too long
    const timeout = setTimeout(() => {
      URL.revokeObjectURL(url);
      resolve(null);
    }, 10000);

    const origSeeked = video.onseeked;
    video.onseeked = (e) => {
      clearTimeout(timeout);
      if (origSeeked) origSeeked.call(video, e);
    };

    video.src = url;
  });
}

function drawToCanvas(
  source: HTMLImageElement | HTMLVideoElement,
  sourceWidth: number,
  sourceHeight: number
): Blob | null {
  if (sourceWidth === 0 || sourceHeight === 0) return null;

  // Calculate scaled dimensions maintaining aspect ratio
  let w = sourceWidth;
  let h = sourceHeight;

  if (w > THUMB_MAX_WIDTH) {
    h = Math.round(h * (THUMB_MAX_WIDTH / w));
    w = THUMB_MAX_WIDTH;
  }
  if (h > THUMB_MAX_HEIGHT) {
    w = Math.round(w * (THUMB_MAX_HEIGHT / h));
    h = THUMB_MAX_HEIGHT;
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(source, 0, 0, w, h);

  // Convert to blob synchronously using toDataURL then converting
  // (canvas.toBlob is async but we need a sync return for the promise chain)
  const dataUrl = canvas.toDataURL("image/jpeg", THUMB_QUALITY);
  return dataUrlToBlob(dataUrl);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(",");
  const mime = parts[0].match(/:(.*?);/)?.[1] || "image/jpeg";
  const b64 = atob(parts[1]);
  const arr = new Uint8Array(b64.length);
  for (let i = 0; i < b64.length; i++) {
    arr[i] = b64.charCodeAt(i);
  }
  return new Blob([arr], { type: mime });
}
