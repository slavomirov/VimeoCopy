/**
 * Artist theme tokens.
 *
 * The whole app is already driven by CSS custom properties (--primary, --bg-base, …),
 * so an artist "theme" is simply a curated set of overrides scoped to the profile
 * wrapper. We never accept raw CSS — only these typed tokens — which keeps profiles
 * safe and impossible to visually break.
 */

import type { CSSProperties } from "react";

export type RadiusStyle = "sharp" | "soft" | "round";

export interface ArtistTheme {
  preset?: string;
  /** Page background behind everything. */
  bg: string;
  /** Card / surface background. */
  surface: string;
  /** Primary text color. */
  text: string;
  /** Muted / secondary text color. */
  textMuted: string;
  /** Accent color — buttons, links, highlights, glows. */
  accent: string;
  /** Hairline / border color. */
  border: string;
  /** Heading font family name (must exist in FONTS). */
  headingFont: string;
  /** Body font family name (must exist in FONTS). */
  bodyFont: string;
  /** Corner treatment. */
  radius: RadiusStyle;
  /** "solid" = flat bg color · "banner" = stretch the banner image as the hero backdrop. */
  backgroundKind: "solid" | "banner";

  /**
   * Let the site's own animated sea show through instead of painting `bg`.
   *
   * Optional, and absent means false, so every theme saved before this existed keeps its solid
   * background rather than silently becoming transparent.
   *
   * The profile still owns its accent, fonts, corners and text colours — only the backdrop is
   * given up. Surfaces go translucent to match, because opaque cards floating on the sea read as
   * holes punched in it; that translucency is why `surface` still matters here even though it is
   * no longer painted flat.
   */
  useSiteBackground?: boolean;
}

/* ── Fonts ─────────────────────────────────────────────
   Each entry maps a friendly name to a Google Fonts family + a CSS stack.
   The family is lazily loaded via a <link> the first time it's used. */

export interface FontDef {
  name: string;
  /** Google Fonts "family" query value, e.g. "Fraunces:opsz,wght@9..144,400;9..144,600". */
  google?: string;
  stack: string;
}

export const FONTS: FontDef[] = [
  { name: "Inter", google: "Inter:wght@400;500;600;700", stack: "'Inter', system-ui, sans-serif" },
  { name: "Fraunces", google: "Fraunces:opsz,wght@9..144,400;9..144,600", stack: "'Fraunces', Georgia, serif" },
  { name: "Playfair Display", google: "Playfair+Display:wght@400;600;700", stack: "'Playfair Display', Georgia, serif" },
  { name: "Space Grotesk", google: "Space+Grotesk:wght@400;500;700", stack: "'Space Grotesk', system-ui, sans-serif" },
  { name: "DM Sans", google: "DM+Sans:wght@400;500;700", stack: "'DM Sans', system-ui, sans-serif" },
  { name: "DM Mono", google: "DM+Mono:wght@400;500", stack: "'DM Mono', ui-monospace, monospace" },
  { name: "Cormorant Garamond", google: "Cormorant+Garamond:wght@400;500;600", stack: "'Cormorant Garamond', Georgia, serif" },
  { name: "Archivo Black", google: "Archivo+Black", stack: "'Archivo Black', Impact, sans-serif" },
];

export function fontStack(name: string): string {
  return FONTS.find((f) => f.name === name)?.stack ?? "system-ui, sans-serif";
}

const loadedFonts = new Set<string>();

/** Inject a Google Fonts <link> for the named family once. */
export function ensureFontLoaded(name: string) {
  const def = FONTS.find((f) => f.name === name);
  if (!def?.google || loadedFonts.has(def.google)) return;
  loadedFonts.add(def.google);

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${def.google}&display=swap`;
  document.head.appendChild(link);
}

/* ── Presets ───────────────────────────────────────────
   One-click starting moods. Users tweak from here. */

/* ── Presets ───────────────────────────────────────────
   Every one of these is built from the app's own palette rather than invented alongside it.
   The site is a single maritime family — sky #38BDF8 on deep navy #041320 in dark, #0369A1 on
   #F3F9FD in light — and the previous presets shared no hue with it at all: warm creams, a burnt
   orange, a gold, a mint green. A profile styled that way didn't read as a themed corner of the
   site, it read as a different site embedded in this one.

   So the accents here stay inside one analogous sweep — blue → sky → cyan → teal, plus a cool
   greyscale — while the variety that actually matters to an artist is kept: light and dark, serif
   and sans and mono, sharp and round. Nothing clashes with the chrome around it.

   Backgrounds and surfaces track the real tokens (--bg-base / --bg-surface / --border-color) so a
   profile sits against the app's own furniture without a seam. Text pairs are all >= 7:1 against
   their background and muted text >= 4.5:1, checked with contrastRatio() below. */

export const PRESETS: ArtistTheme[] = [
  {
    // The app's light theme, exactly. The safe default: a profile that looks like it belongs.
    preset: "Harbour",
    bg: "#F3F9FD", surface: "#FFFFFF", text: "#0B2233", textMuted: "#546E80",
    accent: "#0369A1", border: "#D3E3EF",
    headingFont: "Fraunces", bodyFont: "Inter", radius: "sharp", backgroundKind: "solid",
  },
  {
    // The app's dark theme. Sky accent on deep navy, the site's signature pairing.
    preset: "Harbour Night",
    bg: "#041320", surface: "#071E31", text: "#E8F4FB", textMuted: "#8FA9BC",
    accent: "#38BDF8", border: "#123449",
    headingFont: "Space Grotesk", bodyFont: "Inter", radius: "soft", backgroundKind: "solid",
  },
  {
    // Darker and quieter than Harbour Night, for work that wants to sit in near-black.
    preset: "Deep Water",
    bg: "#020A12", surface: "#0A1B29", text: "#DCEBF5", textMuted: "#7C93A5",
    accent: "#22D3EE", border: "#10293B",
    headingFont: "Playfair Display", bodyFont: "Inter", radius: "round", backgroundKind: "solid",
  },
  {
    // A near-white room with a cool cast, so it reads as gallery space and not as a warm cream
    // that fights the blues in the chrome. Teal accent keeps it in the family.
    preset: "Gallery",
    bg: "#FBFCFD", surface: "#FFFFFF", text: "#14202A", textMuted: "#5C7280",
    accent: "#0E7490", border: "#E3EAEF",
    headingFont: "Cormorant Garamond", bodyFont: "Inter", radius: "sharp", backgroundKind: "solid",
  },
  {
    // The loud one, kept honest: heavy display face and a bright accent, still the site's sky blue.
    preset: "Beacon",
    bg: "#F6F9FB", surface: "#FFFFFF", text: "#10202C", textMuted: "#5A7182",
    accent: "#0891B2", border: "#DCE7EE",
    headingFont: "Archivo Black", bodyFont: "DM Sans", radius: "soft", backgroundKind: "solid",
  },
  {
    // Cool greyscale. No hue at all is the one way to add contrast to this set without leaving it.
    preset: "Slate Mono",
    bg: "#0F1519", surface: "#171F25", text: "#E7EDF1", textMuted: "#93A3AE",
    accent: "#CBD5E1", border: "#263038",
    headingFont: "DM Mono", bodyFont: "DM Mono", radius: "sharp", backgroundKind: "solid",
  },
];

export const DEFAULT_THEME: ArtistTheme = PRESETS[0];

/* ── Serialization ─────────────────────────────────────── */

export function parseTheme(json: string | null | undefined): ArtistTheme {
  if (!json) return DEFAULT_THEME;
  try {
    const parsed = JSON.parse(json) as Partial<ArtistTheme>;
    return { ...DEFAULT_THEME, ...parsed };
  } catch {
    return DEFAULT_THEME;
  }
}

/* ── Color helpers ─────────────────────────────────────── */

function hexToRgbTuple(hex: string): [number, number, number] {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  if (Number.isNaN(n) || h.length !== 6) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hexToRgbString(hex: string): string {
  return hexToRgbTuple(hex).join(", ");
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const srgb = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

/** WCAG contrast ratio (1–21) between two hex colors. */
export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexToRgbTuple(hexA));
  const lb = relativeLuminance(hexToRgbTuple(hexB));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const RADIUS_MAP: Record<RadiusStyle, { sm: string; md: string; lg: string; xl: string }> = {
  sharp: { sm: "0px", md: "0px", lg: "2px", xl: "2px" },
  soft: { sm: "8px", md: "12px", lg: "16px", xl: "20px" },
  round: { sm: "14px", md: "20px", lg: "28px", xl: "34px" },
};

/**
 * Map a theme to CSS-variable overrides. Spread onto a wrapper's `style` and
 * every descendant (cards, buttons, the player) re-skins automatically.
 */
export function themeToCssVars(theme: ArtistTheme): CSSProperties {
  const r = RADIUS_MAP[theme.radius];
  const accentRgb = hexToRgbString(theme.accent);
  const surfaceRgb = hexToRgbString(theme.surface);

  // Riding the site's backdrop means not painting over it. The page background is handed back to
  // the app (the wrapper drops its own fill via .uses-site-bg) and surfaces become a tinted glass
  // of the theme's own surface colour, so cards still read as the artist's while the sea moves
  // behind them. 0.72 is the point where text stays comfortably legible over the animation.
  const surface = theme.useSiteBackground ? `rgba(${surfaceRgb}, 0.72)` : theme.surface;

  return {
    // accent
    "--primary": theme.accent,
    "--primary-rgb": accentRgb,
    "--secondary": theme.accent,
    "--accent": theme.accent,
    "--border-glow": `rgba(${accentRgb}, 0.35)`,
    "--btn-primary-text": pickContrastText(theme.accent),
    // surfaces
    "--bg-base": theme.useSiteBackground ? "transparent" : theme.bg,
    "--bg-deep": theme.useSiteBackground ? "transparent" : theme.bg,
    "--bg-surface": surface,
    "--bg-card": surface,
    "--bg-elevated": surface,
    // Inputs stay opaque whatever the backdrop does — a text field you can see moving water
    // through is the one surface where translucency actively costs legibility.
    "--bg-input": theme.surface,
    "--border-color": theme.border,
    // text
    "--text-on-surface": theme.text,
    "--gray-900": theme.text,
    "--gray-800": theme.text,
    "--gray-700": theme.text,
    "--gray-600": theme.textMuted,
    "--gray-500": theme.textMuted,
    "--gray-400": theme.textMuted,
    // corners
    "--radius-sm": r.sm,
    "--radius-md": r.md,
    "--radius-lg": r.lg,
    "--radius-xl": r.xl,
    "--radius-2xl": r.xl,
    // fonts
    "--font-family": fontStack(theme.bodyFont),
    "--ap-heading-font": fontStack(theme.headingFont),
    "--ap-body-font": fontStack(theme.bodyFont),
  } as CSSProperties;
}

/** Black or white, whichever reads better on the given background. */
export function pickContrastText(bgHex: string): string {
  return contrastRatio(bgHex, "#ffffff") >= contrastRatio(bgHex, "#000000") ? "#ffffff" : "#000000";
}
