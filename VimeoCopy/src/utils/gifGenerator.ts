/**
 * GIF generator — builds the short clip that plays when a viewer hovers a video tile.
 *
 * Despite the name it does not produce an image/gif. A real GIF of even a 3-second 320px clip runs
 * to several megabytes and looks worse than the ~150 KB WebM that replaces it, so "GIF" names the
 * feature (the thing YouTube plays under your cursor) while the format stays a muted video.
 *
 * The clip is a montage: four ~0.75s moments sampled from across the video rather than one run at
 * the start, because the opening seconds of a video are usually a title card or a black fade and
 * tell a browsing viewer nothing about the content.
 *
 * It is generated in the browser, from the file the user is already uploading — there is no
 * server-side transcoder in this project, and doing it at upload time means the source bytes are
 * already local, so it costs no download. The recording is real-time: MediaRecorder timestamps
 * frames by wall clock, so a 3-second clip takes 3 seconds of wall time to make. That is why the
 * uploader fires this after a file is marked done rather than blocking the upload behind it.
 *
 * Returns null rather than throwing whenever a clip can't be made — no MediaRecorder, an unreadable
 * file, an unknown duration, a tainted canvas. A missing clip is not an error: the gallery falls
 * back to hovering the full file, which is what it did before this existed.
 */

/** Clip width. Height follows the source aspect ratio. A hover tile is ~320px wide at most. */
const CLIP_WIDTH = 320;

/** Frames per second in the clip. Below ~10 the motion reads as a slideshow. */
const CLIP_FPS = 12;

/** Roughly 150 KB for a 3-second clip — small enough that hovering is effectively free. */
const CLIP_BITRATE = 400_000;

/** Where in the video to sample from, as fractions of its duration. */
const SAMPLE_POINTS = [0.1, 0.35, 0.6, 0.85];

/** How long to record at each sample point. Four of these is the total clip length. */
const SEGMENT_MS = 750;

/**
 * Below this, sampling four points would produce four near-identical snippets, so the whole video
 * is used as a single segment instead.
 */
const SHORT_VIDEO_SECONDS = 4;

/** Hard ceiling on one generation, so a video that won't seek can't hang the caller forever. */
const OVERALL_TIMEOUT_MS = 25_000;

/** How long to wait for metadata or a single seek before giving up. */
const STEP_TIMEOUT_MS = 8_000;

/**
 * Containers to try, best first. Chrome and Firefox take the WebM branch; Safari supports only MP4
 * in MediaRecorder, and it is last because Safari is also the browser least able to play back the
 * VP9 the others produce — recording in whatever the local recorder natively offers keeps a clip
 * playable in the browser that made it.
 */
const CANDIDATE_TYPES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4",
];

export interface PreviewClip {
  blob: Blob;
  /** Container only, no codec parameters — this is what the presigned PUT must be signed for. */
  contentType: string;
  /** Roughly how long the clip plays, for logging and sanity checks. */
  durationMs: number;
}

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const type of CANDIDATE_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      /* isTypeSupported throws on some older WebViews rather than returning false */
    }
  }
  return null;
}

/** True when this browser can record a clip at all. Callers can skip the work entirely. */
export function canGeneratePreviewClip(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function" &&
    pickMimeType() !== null
  );
}

/** Strips the codec parameters — storage and the video tag only care about the container. */
function containerOf(mimeType: string): string {
  return mimeType.split(";")[0].trim().toLowerCase();
}

function waitForEvent(target: EventTarget, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for " + event + "."));
    }, timeoutMs);

    function onEvent() {
      cleanup();
      resolve();
    }

    function onError() {
      cleanup();
      reject(new Error("The video errored while waiting for " + event + "."));
    }

    function cleanup() {
      window.clearTimeout(timer);
      target.removeEventListener(event, onEvent);
      target.removeEventListener("error", onError);
    }

    target.addEventListener(event, onEvent, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Even dimensions: several encoders reject an odd width or height outright, and the ones that don't
 * quietly round, which shifts the image by half a pixel.
 */
function evenize(value: number): number {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

/**
 * Loads a video element for generation.
 *
 * crossOrigin is set for remote sources on purpose: drawing a cross-origin video onto a canvas
 * taints it, and a tainted canvas makes captureStream throw a SecurityError rather than fail
 * visibly. Requesting CORS up front means the browser either grants us clean pixels or refuses to
 * load at all — a failure we can report — instead of dying at the first drawImage.
 */
async function loadVideo(source: File | string): Promise<{ video: HTMLVideoElement; revoke: () => void }> {
  const video = document.createElement("video");
  const objectUrl = typeof source === "string" ? null : URL.createObjectURL(source);

  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  if (typeof source === "string") video.crossOrigin = "anonymous";

  const revoke = () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    video.removeAttribute("src");
    video.load();
  };

  video.src = objectUrl ?? (source as string);

  try {
    await waitForEvent(video, "loadedmetadata", STEP_TIMEOUT_MS);
  } catch (err) {
    revoke();
    throw err;
  }

  return { video, revoke };
}

/** The moments to record, as [startSeconds, lengthMs] pairs. */
function planSegments(duration: number): Array<[number, number]> {
  if (duration <= SHORT_VIDEO_SECONDS) {
    // One pass over the whole thing, capped at the length a montage would have been.
    const total = Math.min(duration, (SAMPLE_POINTS.length * SEGMENT_MS) / 1000);
    return [[0, total * 1000]];
  }

  // Keep every segment inside the file: seeking to 0.85 of the duration and then playing for
  // another 0.75s runs off the end and records a frozen final frame.
  const latestStart = Math.max(0, duration - SEGMENT_MS / 1000);
  return SAMPLE_POINTS.map((fraction) => [Math.min(duration * fraction, latestStart), SEGMENT_MS]);
}

/**
 * Records one segment: play from where the head already sits and keep the canvas painted for the
 * segment's length.
 *
 * The draw loop runs on requestAnimationFrame while captureStream samples the canvas at CLIP_FPS.
 * Drawing faster than the capture rate costs almost nothing here — one small canvas — and avoids
 * tearing the motion by drawing in lockstep with an unrelated clock.
 */
async function recordSegment(
  video: HTMLVideoElement,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  lengthMs: number
): Promise<void> {
  ctx.drawImage(video, 0, 0, width, height); // paint the seeked frame before playback starts
  await video.play();

  let raf = 0;
  const draw = () => {
    ctx.drawImage(video, 0, 0, width, height);
    raf = window.requestAnimationFrame(draw);
  };
  raf = window.requestAnimationFrame(draw);

  await delay(lengthMs);

  window.cancelAnimationFrame(raf);
  video.pause();
}

/**
 * Builds a hover-preview clip from a local file or a URL.
 *
 * Pass a File at upload time. Pass a URL to backfill a video already in storage — that source has
 * to be CORS-readable, or the browser refuses to hand over pixels and this returns null.
 */
export async function generatePreviewClip(source: File | string): Promise<PreviewClip | null> {
  const mimeType = pickMimeType();
  if (!mimeType || typeof HTMLCanvasElement.prototype.captureStream !== "function") return null;

  let loaded: { video: HTMLVideoElement; revoke: () => void } | null = null;

  try {
    loaded = await Promise.race([
      loadVideo(source),
      delay(OVERALL_TIMEOUT_MS).then<never>(() => {
        throw new Error("Preview clip generation timed out.");
      }),
    ]);

    const { video } = loaded;
    const duration = video.duration;

    // A live stream or a fragmented file reports Infinity, and a still frame reports 0. Neither can
    // be sampled at fractions of its length.
    if (!Number.isFinite(duration) || duration <= 0) return null;
    if (!video.videoWidth || !video.videoHeight) return null;

    const width = evenize(Math.min(CLIP_WIDTH, video.videoWidth));
    const height = evenize((width * video.videoHeight) / video.videoWidth);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const stream = canvas.captureStream(CLIP_FPS);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: CLIP_BITRATE });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    const segments = planSegments(duration);
    let recorded = 0;

    recorder.start();

    for (const [startSeconds, lengthMs] of segments) {
      // Seeking takes real time and the recorder keeps running through it, so a montage made
      // without this pause is padded with a frozen frame between every moment.
      if (recorder.state === "recording") {
        try { recorder.pause(); } catch { /* pause is optional; a small freeze is the worst case */ }
      }

      try {
        // A seek to where the head already sits fires no "seeked" event, so don't wait for one.
        if (Math.abs(video.currentTime - startSeconds) > 0.01) {
          video.currentTime = startSeconds;
          await waitForEvent(video, "seeked", STEP_TIMEOUT_MS);
        }
      } catch {
        continue; // this moment won't seek; the others still make a usable clip
      }

      if (recorder.state === "paused") {
        try { recorder.resume(); } catch { /* see above */ }
      }

      try {
        await recordSegment(video, ctx, width, height, lengthMs);
        recorded += lengthMs;
      } catch {
        break; // playback died mid-clip; keep whatever was recorded
      }
    }

    // Only wait for onstop if there is something to stop, and never wait forever. A recorder that
    // already went inactive on its own — an encoder error mid-clip — will never fire onstop, so
    // awaiting it unconditionally would hang this call and, with it, the upload batch behind it.
    if (recorder.state !== "inactive") {
      recorder.stop();
      await Promise.race([stopped, delay(STEP_TIMEOUT_MS)]);
    }

    stream.getTracks().forEach((track) => track.stop());

    if (recorded === 0 || chunks.length === 0) return null;

    const blob = new Blob(chunks, { type: containerOf(mimeType) });
    if (blob.size === 0) return null;

    return { blob, contentType: containerOf(mimeType), durationMs: recorded };
  } catch {
    // Every failure here is non-fatal by design: no clip just means hover falls back to the file.
    return null;
  } finally {
    loaded?.revoke();
  }
}
