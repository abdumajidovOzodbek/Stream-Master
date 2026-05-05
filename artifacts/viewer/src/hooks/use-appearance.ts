import { useEffect, useRef, useState } from "react";

export type DensityMode = "compact" | "comfortable" | "spacious";
export type WallpaperMode = "dots" | "none" | "grid" | "diagonal";

export interface AccentPreset {
  name: string;
  light: string;
  dark: string;
  preview: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { name: "Blue",   light: "202 92% 44%", dark: "199 90% 55%", preview: "#0ea5e9" },
  { name: "Indigo", light: "240 65% 55%", dark: "240 65% 65%", preview: "#6366f1" },
  { name: "Purple", light: "262 83% 58%", dark: "262 83% 65%", preview: "#a855f7" },
  { name: "Pink",   light: "340 75% 55%", dark: "340 75% 62%", preview: "#ec4899" },
  { name: "Red",    light: "0 72% 50%",   dark: "0 72% 58%",   preview: "#ef4444" },
  { name: "Orange", light: "25 95% 50%",  dark: "25 92% 60%",  preview: "#f97316" },
  { name: "Green",  light: "142 71% 38%", dark: "142 65% 50%", preview: "#22c55e" },
  { name: "Teal",   light: "173 80% 36%", dark: "173 58% 50%", preview: "#14b8a6" },
];

export interface AppearanceSettings {
  accentPreset: string;
  density: DensityMode;
  wallpaper: WallpaperMode;
}

const DEFAULTS: AppearanceSettings = {
  accentPreset: "Blue",
  density: "comfortable",
  wallpaper: "dots",
};

function loadSettings(): AppearanceSettings {
  try {
    const raw = localStorage.getItem("app-appearance");
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AppearanceSettings>) };
  } catch { /* ignore */ }
  return DEFAULTS;
}

export function applyAppearance(settings: AppearanceSettings, isDark: boolean): void {
  const root = document.documentElement;
  const preset =
    ACCENT_PRESETS.find((p) => p.name === settings.accentPreset) ?? ACCENT_PRESETS[0]!;
  const hsl = isDark ? preset.dark : preset.light;

  root.style.setProperty("--primary", hsl);
  root.style.setProperty("--ring", hsl);
  root.style.setProperty("--sidebar-primary", hsl);
  root.style.setProperty("--sidebar-ring", hsl);
  root.style.setProperty("--chart-1", hsl);

  root.setAttribute("data-density", settings.density);
  root.setAttribute("data-wallpaper", settings.wallpaper);
}

export function useAppearance() {
  const [settings, setSettings] = useState<AppearanceSettings>(loadSettings);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    applyAppearance(settings, isDark);

    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains("dark");
      applyAppearance(settingsRef.current, dark);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function update(partial: Partial<AppearanceSettings>): void {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      settingsRef.current = next;
      localStorage.setItem("app-appearance", JSON.stringify(next));
      const isDark = document.documentElement.classList.contains("dark");
      applyAppearance(next, isDark);
      return next;
    });
  }

  return { settings, update, ACCENT_PRESETS };
}
