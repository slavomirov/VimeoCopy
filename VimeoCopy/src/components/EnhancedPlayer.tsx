import { useEffect, useState, useCallback, useRef } from "react";
import "../App.css";

/* ── Shared media shape for the player ─────── */
export interface PlayerMedia {
  fileName: string | null;
  contentType: string;
  description?: string | null;
  ownerName?: string;        // display name or email prefix
  ownerInitial?: string;     // single char for avatar
  projectTitle?: string | null;
}

/* ── Helpers ───────────────────────────────── */
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ── Enhanced Player Component ─────────────── */
export function EnhancedPlayer({
  media,
  url,
  onClose,
}: {
  media: PlayerMedia;
  url: string;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Web Audio chain so we can amplify past the element's native 1.0 volume ceiling —
  // the bare <video>/<audio> plays noticeably quieter than desktop players.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const volumeRef = useRef(1); // mirrors `volume` for the stale-closure keyboard handler
  const VOLUME_BOOST = 2;

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [buffered, setBuffered] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);
  const [castState, setCastState] = useState<"unavailable" | "available" | "connecting" | "connected">("unavailable");
  const [castError, setCastError] = useState<string | null>(null);

  const isVideo = media.contentType.startsWith("video/");
  const isImage = media.contentType.startsWith("image/");
  const isAudio = media.contentType.startsWith("audio/");

  // ── Escape to close ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    if (!isVideo && !isAudio) return;
    const handler = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v) return;
      unlockAudio();
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          v.paused ? v.play() : v.pause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          v.currentTime = Math.max(0, v.currentTime - 5);
          break;
        case "ArrowRight":
          e.preventDefault();
          v.currentTime = Math.min(v.duration, v.currentTime + 5);
          break;
        case "ArrowUp": {
          e.preventDefault();
          const next = Math.min(1, volumeRef.current + 0.1);
          applyVolume(next, false);
          setVolume(next);
          setMuted(false);
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          const next = Math.max(0, volumeRef.current - 0.1);
          applyVolume(next, next === 0);
          setVolume(next);
          setMuted(next === 0);
          break;
        }
        case "m": {
          const next = !v.muted;
          applyVolume(volumeRef.current, next);
          setMuted(next);
          break;
        }
        case "f":
          toggleFullscreen();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideo, isAudio]);

  // ── Auto-hide controls ──
  const resetHideTimer = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setControlsVisible(false);
        setShowSpeedMenu(false);
        setShowVolume(false);
      }
    }, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  // ── Cast: Google Cast SDK + Remote Playback fallback ──
  useEffect(() => {
    if (!isVideo && !isAudio) return;

    // Method 1: Try Google Cast SDK (chrome.cast)
    const w = window as any;

    const initCastApi = () => {
      if (!w.chrome?.cast) return;
      const sessionRequest = new w.chrome.cast.SessionRequest(
        w.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID
      );
      const apiConfig = new w.chrome.cast.ApiConfig(
        sessionRequest,
        () => {}, // sessionListener
        (availability: string) => {
          if (availability === "available") {
            setCastState("available");
          }
        }
      );
      w.chrome.cast.initialize(apiConfig, () => {
        setCastState("available");
      }, () => {});
    };

    // If Cast SDK is already loaded
    if (w.chrome?.cast?.isAvailable) {
      initCastApi();
    } else {
      // Listen for Cast SDK becoming available
      w.__onGCastApiAvailable = (isAvailable: boolean) => {
        if (isAvailable) initCastApi();
      };

      // Load the Cast SDK script if not present
      if (!document.querySelector('script[src*="cast_sender"]')) {
        const script = document.createElement("script");
        script.src = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
        script.async = true;
        document.head.appendChild(script);
      }
    }

    // Method 2: Remote Playback API fallback
    const checkRemote = () => {
      const v = videoRef.current;
      if (!v) return;

      if ("disableRemotePlayback" in v) {
        (v as any).disableRemotePlayback = false;
      }

      if ("remote" in v) {
        setCastState((prev) => prev === "unavailable" ? "available" : prev);

        const remote = (v as any).remote;
        const onConnecting = () => setCastState("connecting");
        const onConnect = () => setCastState("connected");
        const onDisconnect = () => setCastState("available");

        remote.addEventListener?.("connecting", onConnecting);
        remote.addEventListener?.("connect", onConnect);
        remote.addEventListener?.("disconnect", onDisconnect);

        return () => {
          remote.removeEventListener?.("connecting", onConnecting);
          remote.removeEventListener?.("connect", onConnect);
          remote.removeEventListener?.("disconnect", onDisconnect);
        };
      }
    };

    const timer = setTimeout(checkRemote, 300);
    return () => clearTimeout(timer);
  }, [isVideo, isAudio, url]);

  // ── Fullscreen change listener ──
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ── Auto-dismiss cast error ──
  useEffect(() => {
    if (!castError) return;
    const t = setTimeout(() => setCastError(null), 6000);
    return () => clearTimeout(t);
  }, [castError]);

  // ── Audio boost (Web Audio) ──
  // Loudness is driven by the gain node (allows >1.0); the element's own volume stays at 1
  // so the two don't multiply. Falls back to element.volume if Web Audio is unavailable.
  const applyVolume = useCallback((vol: number, isMuted: boolean) => {
    const v = videoRef.current;
    if (!v) return;
    if (gainRef.current && audioCtxRef.current) {
      gainRef.current.gain.value = isMuted ? 0 : vol * VOLUME_BOOST;
      v.muted = isMuted;
      v.volume = 1;
    } else {
      v.volume = vol;
      v.muted = isMuted;
    }
  }, []);

  // Must be called from a USER GESTURE. createMediaElementSource() reroutes the element's audio
  // exclusively through the graph, and a freshly-created AudioContext is "suspended" until a gesture
  // resumes it — so building it on autoplay would silence the player. Until the first gesture the
  // element plays natively (via applyVolume's element.volume fallback); after it, the gain boost kicks in.
  const unlockAudio = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (!audioCtxRef.current) {
      try {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        const ctx = new Ctor();
        const source = ctx.createMediaElementSource(v);
        const gain = ctx.createGain();
        source.connect(gain);
        gain.connect(ctx.destination);
        audioCtxRef.current = ctx;
        gainRef.current = gain;
        sourceRef.current = source;
        applyVolume(volumeRef.current, v.muted);
      } catch {
        /* Web Audio unavailable — keep using element.volume */
        return;
      }
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
  }, [applyVolume]);

  useEffect(() => { volumeRef.current = volume; }, [volume]);

  // Tear down the audio context on unmount.
  useEffect(() => {
    return () => {
      sourceRef.current?.disconnect();
      gainRef.current?.disconnect();
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  // ── Event handlers ──
  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    if (v.buffered.length > 0) {
      setBuffered(v.buffered.end(v.buffered.length - 1));
    }
  };

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (v) setDuration(v.duration);
  };

  const handlePlay = () => setPlaying(true);
  const handlePause = () => {
    setPlaying(false);
    setControlsVisible(true);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    unlockAudio();
    v.paused ? v.play() : v.pause();
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    const bar = progressRef.current;
    if (!v || !bar) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = ratio * v.duration;
  };

  const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverProgress(ratio);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    unlockAudio();
    const val = parseFloat(e.target.value);
    const isMuted = val === 0;
    applyVolume(val, isMuted);
    setVolume(val);
    setMuted(isMuted);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    unlockAudio();
    const next = !muted;
    applyVolume(volume, next);
    setMuted(next);
  };

  const toggleFullscreen = () => {
    // Fullscreen the whole overlay (not just the video box) so the media fills the entire
    // display and the close button / top bar stay reachable in fullscreen.
    const el = overlayRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen?.();
    }
  };

  const handleCast = async () => {
    const v = videoRef.current as HTMLVideoElement | null;
    if (!v) return;
    setCastError(null);

    const w = window as any;

    // Method 1: Google Cast SDK (works when Chromecast extension is installed)
    if (w.chrome?.cast?.isAvailable) {
      try {
        const castSession = await new Promise<any>((resolve, reject) => {
          w.chrome.cast.requestSession(
            (session: any) => resolve(session),
            (err: any) => reject(err)
          );
        });

        const mediaInfo = new w.chrome.cast.media.MediaInfo(url, media.contentType);
        const request = new w.chrome.cast.media.LoadRequest(mediaInfo);
        request.currentTime = v.currentTime || 0;

        await new Promise<void>((resolve, reject) => {
          castSession.loadMedia(
            request,
            () => {
              setCastState("connected");
              resolve();
            },
            (err: any) => reject(err)
          );
        });
        return;
      } catch (err: any) {
        // "cancel" = user closed the picker, that's fine
        if (err?.code === "cancel") return;
        // Fall through to Remote Playback API
      }
    }

    // Method 2: Remote Playback API
    if ("remote" in v) {
      try {
        const remote = (v as any).remote;
        await remote.prompt();
        // State changes handled by event listeners
        return;
      } catch (err: any) {
        const name = err?.name || "";
        if (name === "NotSupportedError") {
          setCastError("Your browser doesn't support casting this media type.");
        } else if (name === "NotFoundError") {
          setCastError("No cast devices found on your network.");
        } else if (name === "InvalidStateError") {
          setCastError("Remote playback is disabled for this video.");
        } else if (name === "NotAllowedError") {
          setCastError("No cast devices found. Make sure a Chromecast is on your network.");
        } else if (name !== "AbortError") {
          setCastError("Cast failed. Try using Chrome's menu → Cast instead.");
        }
        // AbortError = user cancelled, no message needed
      }
    }

    // Method 3: No cast API available at all — guide the user
    if (!("remote" in v) && !w.chrome?.cast?.isAvailable) {
      setCastError("Use the browser menu (⋮) → Cast to send to your TV.");
    }
  };

  const changeSpeed = (speed: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = speed;
    setPlaybackSpeed(speed);
    setShowSpeedMenu(false);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;

  const showCastButton = (isVideo || isAudio) && castState !== "unavailable";
  const isCasting = castState === "connected" || castState === "connecting";

  // ── Volume icon picker ──
  const VolumeIcon = ({ size = 20 }: { size?: number }) => {
    if (muted || volume === 0) {
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
      );
    }
    if (volume < 0.5) {
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
      );
    }
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      </svg>
    );
  };

  // ── Volume control group (shared between video & audio) ──
  const VolumeControl = ({ iconSize = 20 }: { iconSize?: number }) => (
    <div
      className="vp-volume-group"
      onMouseEnter={() => setShowVolume(true)}
      onMouseLeave={() => setShowVolume(false)}
    >
      <button className="vp-btn" onClick={toggleMute} title={muted ? "Unmute (m)" : "Mute (m)"}>
        <VolumeIcon size={iconSize} />
      </button>
      <div className={`vp-volume-slider-wrap ${showVolume ? "visible" : ""}`}>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={muted ? 0 : volume}
          onChange={handleVolumeChange}
          className="vp-volume-slider"
        />
      </div>
    </div>
  );

  // ── Progress bar (shared) ──
  const ProgressBar = ({ showTooltip = false }: { showTooltip?: boolean }) => (
    <div
      className="vp-progress-wrap"
      ref={progressRef}
      onClick={handleProgressClick}
      onMouseMove={showTooltip ? handleProgressHover : undefined}
      onMouseLeave={showTooltip ? () => setHoverProgress(null) : undefined}
    >
      <div className="vp-progress-bar">
        <div className="vp-progress-buffered" style={{ width: `${bufferedPercent}%` }} />
        <div className="vp-progress-played" style={{ width: `${progress}%` }}>
          <div className="vp-progress-thumb" />
        </div>
        {showTooltip && hoverProgress !== null && (
          <div className="vp-progress-hover-tooltip" style={{ left: `${hoverProgress * 100}%` }}>
            {formatTime(hoverProgress * duration)}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="vp-overlay" ref={overlayRef} onClick={onClose}>
      {/* Close button */}
      <button className="vp-close" onClick={(e) => { e.stopPropagation(); onClose(); }} title="Close (Esc)">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Top info bar */}
      <div className={`vp-top-bar ${controlsVisible ? "visible" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="vp-top-info">
          {media.ownerInitial && (
            <div className="media-owner-avatar" style={{ width: "30px", height: "30px", fontSize: "13px" }}>
              {media.ownerInitial}
            </div>
          )}
          <div>
            <p className="vp-top-title">{media.fileName || "Untitled"}</p>
            {media.ownerName && (
              <p className="vp-top-subtitle">
                {media.ownerName}
                {media.projectTitle && <> &middot; {media.projectTitle}</>}
              </p>
            )}
          </div>
        </div>
        {media.description && (
          <p className="vp-top-desc">{media.description}</p>
        )}
      </div>

      {/* Player container */}
      <div
        className="vp-player"
        ref={playerRef}
        onClick={(e) => e.stopPropagation()}
        onMouseMove={isVideo ? resetHideTimer : undefined}
        onMouseLeave={() => {
          if (isVideo && playing) {
            setControlsVisible(false);
            setShowSpeedMenu(false);
            setShowVolume(false);
          }
        }}
      >
        {/* ── Image ── */}
        {isImage && (
          <img src={url} alt={media.fileName || "Media"} className="vp-media-img" />
        )}

        {/* ── Audio ── */}
        {isAudio && (
          <div className="vp-audio-display">
            <div className="vp-audio-visual">
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
              <div className="vp-audio-rings" />
            </div>
            <audio
              ref={videoRef as any}
              src={url}
              autoPlay
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onPlay={handlePlay}
              onPause={handlePause}
            />
            <div className="vp-controls visible" onClick={(e) => e.stopPropagation()}>
              <button className="vp-btn" onClick={togglePlay} title={playing ? "Pause" : "Play"}>
                {playing ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21" /></svg>
                )}
              </button>
              <span className="vp-time">{formatTime(currentTime)}</span>
              <ProgressBar />
              <span className="vp-time">{formatTime(duration)}</span>
              <VolumeControl iconSize={18} />
            </div>
          </div>
        )}

        {/* ── Video ── */}
        {isVideo && (
          <>
            <video
              ref={videoRef as React.RefObject<HTMLVideoElement>}
              src={url}
              autoPlay
              className="vp-video"
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onPlay={handlePlay}
              onPause={handlePause}
              onClick={togglePlay}
              onContextMenu={(e) => e.preventDefault()}
            />

            {/* Big center play button */}
            {!playing && (
              <div className="vp-big-play" onClick={togglePlay}>
                <svg width="60" height="60" viewBox="0 0 24 24" fill="white" opacity="0.9">
                  <polygon points="6,3 20,12 6,21" />
                </svg>
              </div>
            )}

            {/* Controls bar */}
            <div className={`vp-controls ${controlsVisible ? "visible" : ""}`} onClick={(e) => e.stopPropagation()}>
              <ProgressBar showTooltip />

              <div className="vp-controls-row">
                {/* Left */}
                <div className="vp-controls-left">
                  <button className="vp-btn" onClick={togglePlay} title={playing ? "Pause (k)" : "Play (k)"}>
                    {playing ? (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                    ) : (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21" /></svg>
                    )}
                  </button>

                  <VolumeControl />

                  <span className="vp-time-display">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                {/* Right */}
                <div className="vp-controls-right">
                  {/* Speed */}
                  <div className="vp-speed-group" style={{ position: "relative" }}>
                    <button
                      className="vp-btn vp-speed-btn"
                      onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                      title="Playback speed"
                    >
                      {playbackSpeed}x
                    </button>
                    {showSpeedMenu && (
                      <div className="vp-speed-menu">
                        {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((s) => (
                          <button
                            key={s}
                            className={`vp-speed-option ${playbackSpeed === s ? "active" : ""}`}
                            onClick={() => changeSpeed(s)}
                          >
                            {s}x
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Cast to TV */}
                  {showCastButton && (
                    <div style={{ position: "relative" }}>
                      <button
                        className={`vp-btn vp-cast-btn ${isCasting ? "casting" : ""}`}
                        onClick={handleCast}
                        title={isCasting ? "Casting…" : "Cast to TV"}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill={isCasting ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                          <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" />
                          <line x1="2" y1="20" x2="2.01" y2="20" />
                        </svg>
                      </button>
                      {castError && (
                        <div className="vp-cast-tooltip">
                          {castError}
                          <button className="vp-cast-tooltip-close" onClick={() => setCastError(null)}>&times;</button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Fullscreen */}
                  <button className="vp-btn" onClick={toggleFullscreen} title="Fullscreen (f)">
                    {isFullscreen ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" /></svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
