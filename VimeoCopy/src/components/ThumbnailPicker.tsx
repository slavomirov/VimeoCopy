/**
 * ThumbnailPicker — lets users scrub a video and capture a frame as a thumbnail.
 *
 * Modes:
 *  1. From a File object (during upload, before the file is on S3)
 *  2. From a URL string (changing thumbnail on an existing video)
 */
import { useRef, useState, useEffect, useCallback } from "react";
import "../App.css";

const THUMB_MAX_WIDTH = 480;
const THUMB_MAX_HEIGHT = 360;
const THUMB_QUALITY = 0.8;

interface ThumbnailPickerProps {
  /** Provide ONE of these */
  videoFile?: File;
  videoUrl?: string;
  /** Called when the user confirms a captured frame */
  onCapture: (blob: Blob) => void;
  /** Called when the user cancels */
  onCancel: () => void;
}

export function ThumbnailPicker({ videoFile, videoUrl, onCapture, onCancel }: ThumbnailPickerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string>("");
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [seeking, setSeeking] = useState(false);

  // Create object URL for File, or use URL directly
  useEffect(() => {
    if (videoFile) {
      const url = URL.createObjectURL(videoFile);
      setSrc(url);
      return () => URL.revokeObjectURL(url);
    }
    if (videoUrl) {
      setSrc(videoUrl);
    }
  }, [videoFile, videoUrl]);

  // Clean up preview URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration);
    // Seek to 1 second by default
    video.currentTime = Math.min(1, video.duration * 0.1);
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (!seeking && videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, [seeking]);

  function handleSliderChange(e: React.ChangeEvent<HTMLInputElement>) {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    setSeeking(true);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  }

  function handleSliderPointerUp() {
    setSeeking(false);
  }

  function captureFrame() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

    const canvas = document.createElement("canvas");

    // Scale down maintaining aspect ratio
    let w = video.videoWidth;
    let h = video.videoHeight;
    if (w > THUMB_MAX_WIDTH) {
      h = Math.round(h * (THUMB_MAX_WIDTH / w));
      w = THUMB_MAX_WIDTH;
    }
    if (h > THUMB_MAX_HEIGHT) {
      w = Math.round(w * (THUMB_MAX_HEIGHT / h));
      h = THUMB_MAX_HEIGHT;
    }

    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        // Revoke old preview
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setCapturedBlob(blob);
      },
      "image/jpeg",
      THUMB_QUALITY
    );
  }

  function handleConfirm() {
    if (capturedBlob) {
      onCapture(capturedBlob);
    }
  }

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <p style={{ fontWeight: 600, fontSize: "var(--font-size-sm)", color: "var(--gray-400)", marginBottom: 0 }}>
        Scrub through the video and capture the frame you want as the thumbnail.
      </p>

      {/* Video preview */}
      <div style={{
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        backgroundColor: "var(--bg-deep)",
        position: "relative",
      }}>
        {src && (
          <video
            ref={videoRef}
            src={src}
            muted
            playsInline
            preload="auto"
            crossOrigin="anonymous"
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onSeeked={() => setSeeking(false)}
            style={{
              width: "100%",
              maxHeight: "360px",
              objectFit: "contain",
              display: "block",
            }}
          />
        )}
      </div>

      {/* Scrubber */}
      {duration > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <span className="text-muted" style={{ fontSize: "var(--font-size-xs)", minWidth: "36px" }}>
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={duration}
            step={0.01}
            value={currentTime}
            onChange={handleSliderChange}
            onPointerUp={handleSliderPointerUp}
            onMouseUp={handleSliderPointerUp}
            style={{
              flex: 1,
              accentColor: "var(--primary)",
              cursor: "pointer",
            }}
          />
          <span className="text-muted" style={{ fontSize: "var(--font-size-xs)", minWidth: "36px", textAlign: "right" }}>
            {formatTime(duration)}
          </span>
        </div>
      )}

      {/* Capture button */}
      <button onClick={captureFrame} className="btn-primary" style={{ alignSelf: "center" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: "6px", verticalAlign: "middle" }}>
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        Capture Frame
      </button>

      {/* Preview of captured frame */}
      {previewUrl && (
        <div style={{ textAlign: "center" }}>
          <p style={{ fontWeight: 500, fontSize: "var(--font-size-sm)", marginBottom: "var(--space-2)", color: "var(--gray-400)" }}>
            Captured Thumbnail Preview
          </p>
          <img
            src={previewUrl}
            alt="Thumbnail preview"
            style={{
              maxWidth: "100%",
              maxHeight: "200px",
              borderRadius: "var(--radius-md)",
              border: "2px solid var(--primary)",
              objectFit: "contain",
            }}
          />
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}>
        <button onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={!capturedBlob}
          className="btn-primary"
        >
          Use This Thumbnail
        </button>
      </div>
    </div>
  );
}
