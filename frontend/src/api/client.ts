import type { CompareResult, Dataset, FrontierResult, Mode, Settings, UploadResult } from "@/types";

const host = import.meta.env.VITE_API_URL as string | undefined;
export const API_BASE = host ? (host.startsWith("http") ? host : `https://${host}`) : "";

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorText(res));
  return res.json();
}

async function errorText(res: Response) {
  try {
    const js = await res.json();
    if (typeof js.detail === "string") return js.detail;
    if (Array.isArray(js.detail)) return js.detail.map((d: { msg: string }) => d.msg).join("; ");
  } catch { /* не JSON */ }
  return `Сервер ответил ${res.status}. Проверьте, что бэкенд запущен.`;
}

export interface Common { returns: Dataset; settings: Settings; risk_free: number; allow_short: boolean }
export type AssistantStage = "upload" | "tickers" | "frontier" | "compare" | "optimize" | "export";
export type AssistantContext = Record<string, unknown>;

export const api = {
  diagnose: (body: { stage: AssistantStage; error: string; context: AssistantContext }) =>
    call<{ analysis: string }>("/api/assistant/diagnose", body),
  async upload(file: File): Promise<UploadResult> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: fd });
    if (!res.ok) throw new Error(await errorText(res));
    return res.json();
  },
  loadTickers: (body: { tickers: string[]; start: string; end?: string; frequency: string; m2_levels: { date: string; value: number }[] | null }) =>
    call<UploadResult>("/api/load-tickers", body),
  optimize: (body: Common & { mode: Mode; target_return?: number; target_vol?: number }) =>
    call<{ weights: number[]; assets: string[]; warnings: string[] }>("/api/optimize", body),
  frontier: (body: Common & { n_points?: number; n_samples?: number }) =>
    call<FrontierResult>("/api/efficient-frontier", body),
  compare: (body: Common & { portfolios: { name: string; weights: number[] }[] }) =>
    call<CompareResult>("/api/compare", body),
  async exportXlsx(body: Common & { portfolios: { name: string; weights: number[] }[] }) {
    const res = await fetch(`${API_BASE}/api/export`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await errorText(res));
    return res.blob();
  },
};
