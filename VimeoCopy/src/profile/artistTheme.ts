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

export const PRESETS: ArtistTheme[] = [
  {
    preset: "Gallery White",
    bg: "#fbfbf9", surface: "#ffffff", text: "#1a1a1a", textMuted: "#6b6b6b",
    accent: "#1a1a1a", border: "#e7e5df",
    headingFont: "Fraunces", bodyFont: "Inter", radius: "sharp", backgroundKind: "solid",
  },
  {
    preset: "Noir",
    bg: "#0b0b0c", surface: "#161617", text: "#f4f4f2", textMuted: "#9a9a98",
    accent: "#e8c37a", border: "#2a2a2c",
    headingFont: "Playfair Display", bodyFont: "Inter", radius: "soft", backgroundKind: "solid",
  },
  {
    preset: "Studio",
    bg: "#f4f1ea", surface: "#fffdf8", text: "#2b2620", textMuted: "#7a7266",
    accent: "#c2410c", border: "#e3ddd0",
    headingFont: "Space Grotesk", bodyFont: "DM Sans", radius: "round", backgroundKind: "solid",
  },
  {
    preset: "Risograph",
    bg: "#fdf3ec", surface: "#ffffff", text: "#1f2933", textMuted: "#5b6770",
    accent: "#2563eb", border: "#f2d9c9",
    headingFont: "Archivo Black", bodyFont: "DM Sans", radius: "soft", backgroundKind: "solid",
  },
  {
    preset: "Botanic",
    bg: "#0f1a14", surface: "#16241c", text: "#eef4ee", textMuted: "#9cb4a4",
    accent: "#7dd88f", border: "#27392e",
    headingFont: "Cormorant Garamond", bodyFont: "DM Sans", radius: "round", backgroundKind: "solid",
  },
  {
    preset: "Mono",
    bg: "#111111", surface: "#1b1b1b", text: "#ededed", textMuted: "#8f8f8f",
    accent: "#ededed", border: "#2e2e2e",
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
  return {
    // accent
    "--primary": theme.accent,
    "--primary-rgb": accentRgb,
    "--secondary": theme.accent,
    "--accent": theme.accent,
    "--border-glow": `rgba(${accentRgb}, 0.35)`,
    "--btn-primary-text": pickContrastText(theme.accent),
    // surfaces
    "--bg-base": theme.bg,
    "--bg-deep": theme.bg,
    "--bg-surface": theme.surface,
    "--bg-card": theme.surface,
    "--bg-elevated": theme.surface,
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
