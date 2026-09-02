/**
 * Ferry brand system.
 *
 * One rule holds the whole set together: **ink draws the vessel, the accent is the
 * work in motion** — and the accent shape is always a play triangle. That is why the
 * logo reads as a play button before it reads as a boat, which is the right order for
 * a media host.
 *
 * - `ProwMark`   the logo. Two lines and a triangle; survives a 16px favicon.
 * - `Porthole`   the frame. Promoted out of the logo race into a UI element, so the
 *                brand becomes the geometry of the interface instead of a badge.
 * - `WakeLoader` the motion. Ripples spreading from the bow — water and signal at once.
 */
import type { CSSProperties, ReactNode } from "react";

/* ═══════════════════════════════════════════════════
   The mark
   ═══════════════════════════════════════════════════ */

type MarkProps = {
  size?: number;
  /** Below ~20px the wake line closes up into the hull — drop it. */
  minimal?: boolean;
  className?: string;
  title?: string;
};

export function ProwMark({ size = 32, minimal = false, className = "", title }: MarkProps) {
  const small = minimal || size <= 20;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={`ferry-mark ${className}`}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {/* waterline */}
      <line className="fm-vessel" x1="4" y1="34" x2="44" y2="34" />
      {/* wake */}
      {!small && <line className="fm-vessel fm-wake" x1="9" y1="40" x2="28" y2="40" />}
      {/* the work, under way */}
      <path className="fm-work" d="M15 12 L15 34 L36 23 Z" />
    </svg>
  );
}

/** Mark + wordmark, locked up. Syne-adjacent tracking is applied in CSS. */
export function FerryLogo({
  size = 30,
  showWord = true,
  tagline,
}: {
  size?: number;
  showWord?: boolean;
  tagline?: string;
}) {
  return (
    <span className="ferry-logo">
      <ProwMark size={size} title="Ferry" />
      {showWord && (
        <span className="ferry-logo-text">
          <span className="ferry-wordmark">Ferry</span>
          {tagline && <span className="ferry-logo-tagline">{tagline}</span>}
        </span>
      )}
    </span>
  );
}

/* ═══════════════════════════════════════════════════
   The frame
   ═══════════════════════════════════════════════════ */

/**
 * A round window with the horizon steady across it. Wrap any media in this and the
 * logo stops being a corner badge — the interface itself takes the brand's shape.
 */
export function Porthole({
  children,
  size,
  className = "",
  style,
}: {
  children: ReactNode;
  size?: number | string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`porthole ${className}`}
      style={{ width: size, height: size, ...style }}
    >
      <span className="porthole-glass">{children}</span>
      <span className="porthole-ring" aria-hidden="true" />
      <span className="porthole-glint" aria-hidden="true" />
    </span>
  );
}

/* ═══════════════════════════════════════════════════
   The motion
   ═══════════════════════════════════════════════════ */

/** Ripples spreading from the bow. Replaces every spinner in the app. */
export function WakeLoader({
  size = 48,
  label = "Loading",
}: {
  size?: number;
  label?: string;
}) {
  return (
    <span className="wake-loader" style={{ width: size, height: size }} role="status" aria-label={label}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path className="fm-work wl-hull" d="M11 15 L11 33 L24 24 Z" />
        <path className="fm-vessel wl-ring wl-ring-1" d="M30.6 17.4 A 8 8 0 0 1 30.6 30.6" />
        <path className="fm-vessel wl-ring wl-ring-2" d="M33.5 13.3 A 13 13 0 0 1 33.5 34.7" />
        <path className="fm-vessel wl-ring wl-ring-3" d="M36.3 9.3 A 18 18 0 0 1 36.3 38.7" />
      </svg>
    </span>
  );
}

/** Horizontal progress as a crossing: the ferry travels the route as it fills. */
export function CrossingBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="crossing" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "Progress"}>
      <div className="crossing-route">
        <div className="crossing-swell" style={{ width: `${pct}%` }} />
        <span className="crossing-boat" style={{ left: `calc(${pct}% - 9px)` }}>
          <ProwMark size={18} minimal />
        </span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Sea backdrop — the ocean the whole app floats on
   ═══════════════════════════════════════════════════ */

/**
 * Fixed behind everything: depth gradient, light shafts from the surface, and three
 * swell layers drifting at different speeds. Inline SVG (not a background image) so the
 * waves inherit `currentColor` and re-tint with the theme for free.
 */
const SWELL = "M0,80 c180,-42 540,42 720,0 c180,-42 540,42 720,0 c180,-42 540,42 720,0 c180,-42 540,42 720,0 V160 H0 Z";

export function SeaBackdrop() {
  return (
    <div className="sea-backdrop" aria-hidden="true">
      <div className="sea-depth" />
      <div className="sea-shafts" />
      <div className="sea-swells">
        <svg className="sea-swell sea-swell-3" viewBox="0 0 2880 160" preserveAspectRatio="none">
          <path d={SWELL} />
        </svg>
        <svg className="sea-swell sea-swell-2" viewBox="0 0 2880 160" preserveAspectRatio="none">
          <path d={SWELL} />
        </svg>
        <svg className="sea-swell sea-swell-1" viewBox="0 0 2880 160" preserveAspectRatio="none">
          <path d={SWELL} />
        </svg>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Nautical icon set — one stroke weight, one 24 grid
   ═══════════════════════════════════════════════════ */

type IconProps = { size?: number; className?: string };

const ico = (size: number, className: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: `ferry-icon ${className}`,
  "aria-hidden": true,
});

/** Home — the harbour you come back to. */
export function IconHarbour({ size = 20, className = "" }: IconProps) {
  return (
    <svg {...ico(size, className)}>
      <path d="M3 20h18" />
      <path d="M5 20V9l7-5 7 5v11" />
      <path d="M9 20v-5h6v5" />
    </svg>
  );
}

/** Upload — cargo going up the ramp. */
export function IconLoad({ size = 20, className = "" }: IconProps) {
  return (
    <svg {...ico(size, className)}>
      <path d="M12 15V3" />
      <path d="M7.5 7.5 12 3l4.5 4.5" />
      <path d="M3 15v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" />
      <path d="M3 21c1.6 0 1.6-1 3.2-1s1.6 1 3.2 1 1.6-1 3.2-1 1.6 1 3.2 1 1.6-1 3.2-1" opacity=".55" />
    </svg>
  );
}

/** Media library — the deck, stacked. */
export function IconDeck({ size = 20, className = "" }: IconProps) {
  return (
    <svg {...ico(size, className)}>
      <rect x="2" y="4" width="14" height="12" rx="2" />
      <path d="m16 9 5-3v9l-5-3" />
      <path d="M2 20c1.6 0 1.6-1 3.2-1s1.6 1 3.2 1 1.6-1 3.2-1 1.6 1 3.2 1 1.6-1 3.2-1" opacity=".55" />
    </svg>
  );
}

/** Artists — the compass rose; everyone charts their own course. */
export function IconCompass({ size = 20, className = "" }: IconProps) {
  return (
    <svg {...ico(size, className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5.5-5.5 2 2-5.5z" />
    </svg>
  );
}

/** Projects — voyages: a route between two ports. */
export function IconVoyage({ size = 20, className = "" }: IconProps) {
  return (
    <svg {...ico(size, className)}>
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="6" r="2" />
      <path d="M6.6 16.6C9 14 10 12 12 12s3-2 5.4-4.6" strokeDasharray="2.5 2.5" />
    </svg>
  );
}

/** Audience — the sonar sweep; who is out there. */
export function IconSonar({ size = 20, className = "" }: IconProps) {
  return (
    <svg {...ico(size, className)}>
      <circle cx="12" cy="12" r="2.2" />
      <path d="M16.2 7.8a6 6 0 0 1 0 8.4" />
      <path d="M19 5a10 10 0 0 1 0 14" opacity=".6" />
      <path d="M7.8 16.2a6 6 0 0 1 0-8.4" />
      <path d="M5 19a10 10 0 0 1 0-14" opacity=".6" />
    </svg>
  );
}

/** Moderation — the lifebuoy. */
export function IconBuoy({ size = 20, className = "" }: IconProps) {
  return (
    <svg {...ico(size, className)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.6" />
      <path d="M4.9 4.9 9.5 9.5M19.1 4.9 14.5 9.5M4.9 19.1l4.6-4.6M19.1 19.1l-4.6-4.6" />
    </svg>
  );
}

/** Plans — the ticket office. */
export function IconTicket({ size = 20, className = "" }: IconProps) {
  return (
    <svg {...ico(size, className)}>
      <path d="M3 8.5A2 2 0 0 1 5 6.5h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4z" />
      <path d="M13 6.5v9" strokeDasharray="2 2" />
    </svg>
  );
}

/** Profile — the captain's cap, abstracted to a helm. */
export function IconHelm({ size = 20, className = "" }: IconProps) {
  return (
    <svg {...ico(size, className)}>
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5V9M12 15v5.5M3.5 12H9M15 12h5.5" />
    </svg>
  );
}

/** Sign out — walking down the gangway. */
export function IconGangway({ size = 20, className = "" }: IconProps) {
  return (
    <svg {...ico(size, className)}>
      <path d="M10 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5" />
      <path d="m16 8 4 4-4 4" />
      <path d="M20 12H10" />
    </svg>
  );
}

/** Anchor — held in place; used for "your work stays put". */
export function IconAnchor({ size = 20, className = "" }: IconProps) {
  return (
    <svg {...ico(size, className)}>
      <circle cx="12" cy="5" r="2.2" />
      <path d="M12 7.2V21" />
      <path d="M8 11h8" />
      <path d="M4 14a8 8 0 0 0 16 0" />
    </svg>
  );
}

/** Depth sounding — the resolution promise, drawn as a sonar reading. */
export function IconResolution({ size = 20, className = "" }: IconProps) {
  return (
    <svg {...ico(size, className)}>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M7 14.5V12M10.5 14.5V8.5M14 14.5v-4M17.5 14.5V7" />
      <path d="M3 21h18" opacity=".55" />
    </svg>
  );
}

/** Lighthouse — the beacon; used on empty states and errors. */
export function IconBeacon({ size = 20, className = "" }: IconProps) {
  return (
    <svg {...ico(size, className)}>
      <path d="M9.5 21h5l-1-11h-3z" />
      <path d="M9 10h6" />
      <path d="M12 6.5V3" />
      <path d="m6 6 2.5 1.6M18 6l-2.5 1.6" opacity=".65" />
      <path d="M3.5 9.5 8 8M20.5 9.5 16 8" opacity=".4" />
    </svg>
  );
}
