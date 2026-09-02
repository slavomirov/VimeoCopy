import { useEffect, useRef, useState } from "react";

/**
 * Hover preview — the "flyover".
 *
 * Hovering a clip samples a few moments from across its length rather than playing the
 * first seconds, which is usually a title card or black. Same idea as an animated GIF
 * thumbnail, but built from the real file, so there is nothing to pre-generate and
 * nothing extra to store.
 *
 * Playback is driven by calling play() directly, NOT by waiting on `loadedmetadata`.
 * That distinction is the whole bug this file used to have: the element carried
 * preload="none", so the browser fetched nothing, so `loadedmetadata` never fired, so
 * the play() call sitting inside that handler never ran. Hovering just span a loader
 * forever. play() is what forces the load in the first place — everything else
 * (duration, sampling) is layered on once the media reports itself ready.
 *
 * Cost control: the <video> is only mounted after a hover delay, so brushing across a
 * grid of 24 tiles starts no downloads. It streams the *preview* presign, which the API
 * treats as unmetered, so browsing never eats the owner's bandwidth allowance. Under
 * `prefers-reduced-motion` it never starts at all.
 */

/** Where in the clip to sample, as a fraction of duration. Skips titles and credits. */
const SAMPLE_POINTS = [0.12, 0.35, 0.58, 0.8];
/** How long to sit on each sample before moving to the next. */
const SEGMENT_MS = 1150;
/** Hover grace period, so passing over a tile doesn't trigger a load. */
const HOVER_DELAY_MS = 380;
/** Below this, sampling makes no sense — just play from the top. */
const MIN_SAMPLING_DURATION = 6;
/** If nothing has painted by now, give up and put the poster back. */
const WATCHDOG_MS = 6000;

export function HoverPreview({
  src,
  poster,
  alt,
  className = "",
}: {
  src: string;
  poster?: string;
  alt: string;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const enterTimer = useRef<number | null>(null);

  const [armed, setArmed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [segment, setSegment] = useState(0);
  const [failed, setFailed] = useState(false);

  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  function start() {
    if (reducedMotion || failed) return;
    if (enterTimer.current) window.clearTimeout(enterTimer.current);
    enterTimer.current = window.setTimeout(() => setArmed(true), HOVER_DELAY_MS);
  }

  function stop() {
    if (enterTimer.current) { window.clearTimeout(enterTimer.current); enterTimer.current = null; }
    setArmed(false);
    setPlaying(false);
    setSegment(0);
  }

  // Everything about playback lives here, so there is exactly one place that starts
  // timers and exactly one place that tears them down.
  useEffect(() => {
    if (!armed) return;
    const v = videoRef.current;
    if (!v) return;

    let cancelled = false;
    let cycle: number | undefined;
    let watchdog: number | undefined;

    const seekTo = (i: number) => {
      const d = v.duration;
      if (!Number.isFinite(d) || d <= 0) return;
      try { v.currentTime = d > MIN_SAMPLING_DURATION ? d * SAMPLE_POINTS[i] : 0; } catch { /* not seekable yet */ }
    };

    // Begin cycling only once a real duration exists. A live or still-muxing file
    // reports Infinity/NaN — those just play straight through instead of seeking.
    const beginSampling = () => {
      if (cancelled || cycle !== undefined) return;
      const d = v.duration;
      if (!Number.isFinite(d) || d <= MIN_SAMPLING_DURATION) return;
      seekTo(0);
      cycle = window.setInterval(() => {
        setSegment((prev) => {
          const next = (prev + 1) % SAMPLE_POINTS.length;
          seekTo(next);
          return next;
        });
      }, SEGMENT_MS);
    };

    // play() is what actually triggers loading; don't wait to be told it's ready.
    v.play().catch(() => { if (!cancelled) setFailed(true); });

    // Duration can arrive before or after playback starts, so listen for both and
    // also check immediately in case the file was already cached.
    v.addEventListener("loadedmetadata", beginSampling);
    v.addEventListener("durationchange", beginSampling);
    if (v.readyState >= 1) beginSampling();

    watchdog = window.setTimeout(() => {
      if (!cancelled && v.readyState < 2) setFailed(true);
    }, WATCHDOG_MS);

    return () => {
      cancelled = true;
      if (cycle !== undefined) window.clearInterval(cycle);
      if (watchdog !== undefined) window.clearTimeout(watchdog);
      v.removeEventListener("loadedmetadata", beginSampling);
      v.removeEventListener("durationchange", beginSampling);
      v.pause();
    };
  }, [armed]);

  useEffect(() => () => { if (enterTimer.current) window.clearTimeout(enterTimer.current); }, []);

  return (
    <div
      className={`hover-preview ${className}`}
      onPointerEnter={start}
      onPointerLeave={stop}
      onFocus={start}
      onBlur={stop}
    >
      {poster ? (
        <img
          src={poster}
          alt={alt}
          className="hp-poster"
          loading="lazy"
          data-dimmed={playing ? "true" : "false"}
        />
      ) : (
        // No thumbnail: fall back to a frame from the file itself. The #t=0.1 fragment
        // tells the browser to seek there, which is what makes it paint a frame at all
        // instead of showing an empty black box.
        <video
          src={`${src}#t=0.1`}
          className="hp-poster"
          muted
          playsInline
          preload="metadata"
          aria-label={alt}
          data-dimmed={playing ? "true" : "false"}
        />
      )}

      {armed && !failed && (
        <video
          ref={videoRef}
          src={src}
          className="hp-video"
          muted
          playsInline
          loop
          preload="metadata"
          aria-hidden="true"
          onPlaying={() => setPlaying(true)}
          onError={() => setFailed(true)}
          data-visible={playing ? "true" : "false"}
        />
      )}

      {/* Which moment of the clip you're looking at. Reads as deliberate sampling
          rather than a video that mysteriously jumps. */}
      {playing && (
        <div className="hp-ticks" aria-hidden="true">
          {SAMPLE_POINTS.map((_, i) => (
            <span key={i} className="hp-tick" data-active={i === segment ? "true" : "false"} />
          ))}
        </div>
      )}

      {armed && !playing && !failed && <span className="hp-loading" aria-hidden="true" />}
    </div>
  );
}
