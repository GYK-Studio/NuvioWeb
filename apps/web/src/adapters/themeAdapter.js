import { ThemeStore } from "../../../../js/data/local/themeStore.js";

const FONT_STACKS = {
  MANROPE: "Manrope, Inter, system-ui, sans-serif",
  SPACE_GROTESK: '"Space Grotesk", system-ui, sans-serif',
  INTER: 'Inter, "Segoe UI", Arial, sans-serif',
  DM_SANS: '"DM Sans", "Segoe UI", Arial, sans-serif',
  OPEN_SANS: '"Open Sans", "Segoe UI", Arial, sans-serif'
};

function contrastColor(value) {
  const match = String(value || "")
    .trim()
    .match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (!match) return "#ffffff";
  const hex =
    match[1].length === 3
      ? match[1]
          .split("")
          .map((character) => character + character)
          .join("")
      : match[1];
  const [red, green, blue] = [0, 2, 4].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16)
  );
  const luminance = (red * 299 + green * 587 + blue * 114) / 255000;
  return luminance > 0.62 ? "#090b10" : "#ffffff";
}

export function applyThemePreferences() {
  const theme = ThemeStore.get();
  const root = document.documentElement;
  const accent = String(theme.accentColor || "#3b82f6");
  root.style.setProperty("--primary", accent);
  root.style.setProperty("--primary-contrast", contrastColor(accent));
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--primary-hover", `color-mix(in srgb, ${accent} 72%, white)`);
  root.style.setProperty("--accent-soft", `color-mix(in srgb, ${accent} 72%, white)`);
  root.style.setProperty("--canvas", theme.amoledMode ? "#000" : "#090b10");
  root.style.setProperty(
    "--surface",
    theme.amoledMode && theme.amoledSurfacesMode ? "#000" : "#11141d"
  );
  root.style.setProperty(
    "--font-body",
    FONT_STACKS[String(theme.fontFamily || "MANROPE").toUpperCase()] || FONT_STACKS.MANROPE
  );
}
