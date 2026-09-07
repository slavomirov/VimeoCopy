import { useEffect, useRef, useState } from "react";

/**
 * Hover preview — YouTube-style inline playback.
 *
 * Hover a tile and the GIF generator's clip plays straight through from the start, muted, with a
 * thin progress bar along the bottom. Move away and it snaps back to the thumbnail.
 *
 * The clip is the ONLY thing this will ever play. It holds four moments sampled from across the
 * video in a couple of hundred kilobytes, and a tile without one simply doesn't animate. There is
 * deliberately no fallback to streaming the original file: doing that pulled megabytes off storage
 * to show three seconds, which is exactly the cost the clip exists to remove. If a video should
 * animate on hover and doesn't, the fix is to generate its clip — not to play the source.
 *
 * Playback is driven by calling play() directly, NOT by waiting on `loadedmetadata`.
 * That distinction matters: an earlier version carried preload="none", so the browser
 * fetched nothing, so `loadedmetadata` never fired, so the play() call sitting inside
 * that handler never ran — hovering just span a loader forever. play() is what forces
 * the load in the first place.
 *
 * Cost control: the <video> is only mounted after a hover delay, so brushing across a grid of 24
 * tiles starts no downloads. Under `prefers-reduced-motion` it never starts at all.
 */

/** Hover grace period, so passing over a tile doesn't trigger a load. */
const HOVER_DELAY_MS = 380;
/** If nothing has painted by now, give up and put the thumbnail back. */
const WATCHDOG_MS = 6000;

export function HoverPreview({
  clipSrc,
  poster,
  alt,
  className = "",
}: {
  /** The GIF generator's clip. Null or absent means this tile has no hover preview. */
  clipSrc?: string | null;
  poster?: string;
  alt: string;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const enterTimer = useRef<number | null>(null);

  const [armed, setArmed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);

  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  function start() {
    // No clip, nothing to arm. This is the ordinary state for anything uploaded before the
    // generator existed, so it is a silent no-op rather than an error.
    if (!clipSrc || reducedMotion || failed) return;
    if (enterTimer.current) window.clearTimeout(enterTimer.current);
    enterTimer.current = window.setTimeout(() => setArmed(true), HOVER_DELAY_MS);
  }

  function stop() {
    if (enterTimer.current) { window.clearTimeout(enterTimer.current); enterTimer.current = null; }
    setArmed(false);
    setPlaying(false);
    setProgress(0);
  }

  // One place that starts playback, one place that tears it down.
  useEffect(() => {
    if (!armed) return;
    const v = videoRef.current;
    if (!v) return;

    let cancelled = false;
    let raf = 0;

    // rAF rather than `timeupdate`: the event only fires ~4x a second, which makes the
    // bar visibly step. This is one element at a time, so the cost is negligible.
    const tick = () => {
      if (cancelled) return;
      const d = v.duration;
      if (Number.isFinite(d) && d > 0) setProgress((v.currentTime / d) * 100);
      raf = window.requestAnimationFrame(tick);
    };

    // Always open from the top, the way YouTube does.
    try { v.currentTime = 0; } catch { /* not seekable yet; it already starts at 0 */ }

    // play() is what actually triggers loading; don't wait to be told it's ready.
    v.play().catch(() => { if (!cancelled) setFailed(true); });
    raf = window.requestAnimationFrame(tick);

    const watchdog = window.setTimeout(() => {
      if (!cancelled && v.readyState < 2) setFailed(true);
    }, WATCHDOG_MS);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      window.clearTimeout(watchdog);
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
      ) : clipSrc ? (
        // No thumbnail: take the still frame from the clip, which is already the cheapest thing
        // available. The #t=0.1 fragment tells the browser to seek there, which is what makes it
        // paint a frame at all instead of showing an empty black box.
        <video
          src={`${clipSrc}#t=0.1`}
          className="hp-poster"
          muted
          playsInline
          preload="metadata"
          aria-label={alt}
          data-dimmed={playing ? "true" : "false"}
        />
      ) : null /* no thumbnail and no clip — the tile stays on its background colour */}

      {armed && !failed && (
        <video
          ref={videoRef}
          src={clipSrc ?? undefined}
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

      {playing && (
        <div className="hp-progress" aria-hidden="true">
          <span className="hp-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      {armed && !playing && !failed && <span className="hp-loading" aria-hidden="true" />}
    </div>
  );
}
