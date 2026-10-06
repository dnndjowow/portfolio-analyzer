import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const pct = (v: number | null | undefined, digits = 2) =>
  v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(digits).replace(".", ",")}%`;

export const num = (v: number | null | undefined, digits = 2) =>
  v == null || !Number.isFinite(v) ? "—" : v.toFixed(digits).replace(".", ",");

export const uid = () => Math.random().toString(36).slice(2, 10);

/** Цвета индикаторов: M2RU — основной синий, дальше контрастная категориальная палитра. */
export const ASSET_COLORS = [
  "#0071e3", "#64b5f6", "#30a46c", "#a78bfa", "#ff9f0a",
  "#5ac8fa", "#ff6b81", "#6366f1", "#8e8e93", "#84cc16",
];
/** Цвета портфелей в сравнении (до 5). */
export const PORTFOLIO_COLORS = ["#0071e3", "#30a46c", "#a78bfa", "#ff9f0a", "#ff6b81"];
