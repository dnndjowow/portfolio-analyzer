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
  "#1D5C8C", "#C4862B", "#2F7A55", "#8A4F9E", "#B13E4A",
  "#3E8E9C", "#7A6A3A", "#D16D9E", "#5A6B7B", "#6B9A2E",
];
/** Цвета портфелей в сравнении (до 5). */
export const PORTFOLIO_COLORS = ["#1D5C8C", "#C4862B", "#2F7A55", "#8A4F9E", "#B13E4A"];
