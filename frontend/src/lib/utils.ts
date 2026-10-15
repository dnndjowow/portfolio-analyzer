import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const pct = (v: number | null | undefined, digits = 2) =>
  v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(digits).replace(".", ",").replace("-", "−")}%`;

export const num = (v: number | null | undefined, digits = 2) =>
  v == null || !Number.isFinite(v) ? "—" : v.toFixed(digits).replace(".", ",").replace("-", "−");

export const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * Категориальная палитра активов: фиксированный порядок оттенков,
 * проверена на различимость при дальтонизме для светлой и тёмной темы.
 */
export const ASSET_COLORS = [
  "#1f8a70", "#bd7f0c", "#5b6ee1", "#d4507c", "#2f93c9",
  "#7a9e2e", "#9b62cf", "#d9692a", "#21a3a8", "#b5527a",
];
/** Цвета портфелей в сравнении (до 5) — первые пять слотов той же палитры. */
export const PORTFOLIO_COLORS = ASSET_COLORS.slice(0, 5);

/** Цвета для графиков, зависящие от темы. */
export function chartTheme(dark: boolean) {
  return dark
    ? { ink: "#e6ece8", muted: "#95a39d", grid: "#2a3732", surface: "#161f1c", cloudFrom: "#26332e", cloudTo: "#7fa596", asset: "#95a39d" }
    : { ink: "#15201c", muted: "#5d6a65", grid: "#e3e8e4", surface: "#ffffff", cloudFrom: "#dfe6e2", cloudTo: "#6e8a80", asset: "#7d8a85" };
}
