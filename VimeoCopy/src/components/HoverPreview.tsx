import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hover preview — the "flyover".
 *
 * Hovering a clip in the gallery samples a few moments from across its length rather
 * than playing the first seconds, which is usually a title card or black. Same idea as
 * an animated GIF thumbnail, but built from the real file, so there is nothing to
 * pre-generate and nothing extra to store.
 *
 * Three things keep this from being expensive or annoying:
 *  - `preload="none"` and a hover delay, so brushing the mouse across a grid of 24
 *    tiles doesn't start 24 downloads.
 *  - it streams the *preview* presign, which the API treats as unmetered, so browsing
 *    never eats into the owner's bandwidth allowance.
 *  - under `prefers-reduced-motion` it never starts; the poster frame just stays.
 */

/** Where in the clip to sample, as a fraction of duration. Skips titles and credits. */
const SAMPLE_POINTS = [0.12, 0.35, 0.58, 0.8];
/** How long to sit on each sample before moving to the next. */
const SEGMENT_MS = 1150;
/** Hover grace period, so passing over a tile doesn't trigger a load. */
const HOVER_DELAY_MS = 380;
/** Below this, sampling makes no sense — just play the thing. */
const MIN_SAMPLING_DURATION = 6;

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
  const segmentTimer = useRef<number | null>(null);

  const [armed, setArmed] = useState(false);      // hover held long enough to load
  const [playing, setPlaying] = useState(false);  // first frame actually painted
  const [segment, setSegment] = useState(0);
  const [failed, setFailed] = useState(false);

  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const clearTimers = useCallback(() => {
    if (enterTimer.current) { window.clearTimeout(enterTimer.current); enterTimer.current = null; }
    if (segmentTimer.current) { window.clearInterval(segmentTimer.current); segmentTimer.current = null; }
  }, []);

  const stop = useCallback(() => {
    clearTimers();
    const v = videoRef.current;
    if (v) { v.pause(); }
    setArmed(false);
    setPlaying(false);
    setSegment(0);
  }, [clearTimers]);

  const start = useCallback(() => {
    if (reducedMotion || failed) return;
    clearTimers();
    enterTimer.current = window.setTimeout(() => setArmed(true), HOVER_DELAY_MS);
  }, [reducedMotion, failed, clearTimers]);

  // Once the file reports its duration, jump to the first sample and start cycling.
  const handleLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;

    const duration = Number.isFinite(v.duration) ? v.duration : 0;
    const sampling = duration > MIN_SAMPLING_DURATION;

    const seekTo = (i: number) => {
      if (!videoRef.current) return;
      videoRef.current.currentTime = sampling ? duration * SAMPLE_POINTS[i] : 0;
    };

    seekTo(0);
    void v.play().catch(() => setFailed(true));

    if (sampling) {
      segmentTimer.current = window.setInterval(() => {
        setSegment((prev) => {
          const next = (prev + 1) % SAMPLE_POINTS.length;
          seekTo(next);
          return next;
        });
      }, SEGMENT_MS);
    }
  }, []);

  // Belt and braces: never leave a timer or a decoding video behind.
  useEffect(() => clearTimers, [clearTimers]);

  const showVideo = armed && !failed;

  return (
    <div
      className={`hover-preview ${className}`}
      onPointerEnter={start}
      onPointerLeave={stop}
      onFocus={start}
      onBlur={stop}
    >
      {poster && (
        <img
          src={poster}
          alt={alt}
          className="hp-poster"
          loading="lazy"
          data-dimmed={playing ? "true" : "false"}
        />
      )}

      {showVideo && (
        <video
          ref={videoRef}
          src={src}
          className="hp-video"
          muted
          playsInline
          preload="none"
          aria-hidden="true"
          onLoadedMetadata={handleLoadedMetadata}
          onPlaying={() => setPlaying(true)}
          onError={() => { setFailed(true); stop(); }}
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

      {armed && !playing && !failed && (
        <span className="hp-loading" aria-hidden="true" />
      )}
    </div>
  );
}
