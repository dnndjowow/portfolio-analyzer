import type { CompareResult, Dataset, FrontierResult, Mode, Settings, UploadResult } from "@/types";

const apiHost = import.meta.env.VITE_API_URL as string | undefined;
let apiBaseUrl = "";

if (apiHost) {
  apiBaseUrl = apiHost.startsWith("http") ? apiHost : `https://${apiHost}`;
}

export const API_BASE = apiBaseUrl;

async function call<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorMessage = await errorText(response);
    throw new Error(errorMessage);
  }

  return response.json();
}

async function errorText(response: Response) {
  try {
    const responseData = await response.json();

    if (typeof responseData.detail === "string") {
      return responseData.detail;
    }

    if (Array.isArray(responseData.detail)) {
      return responseData.detail
        .map((error: { msg: string }) => error.msg)
        .join("; ");
    }
  } catch {
    // Сервер может вернуть ошибку без JSON.
  }

  return `Сервер ответил ${response.status}. Проверьте, что бэкенд запущен.`;
}

export interface Common {
  returns: Dataset;
  settings: Settings;
  risk_free: number;
  allow_short: boolean;
}

export type DiagnosticStage = "upload" | "tickers" | "frontier" | "compare" | "optimize" | "export";
export type DiagnosticContext = Record<string, unknown>;

export const api = {
  diagnose(body: { stage: DiagnosticStage; error: string; context: DiagnosticContext }) {
    return call<{ analysis: string }>("/api/support/diagnose", body);
  },

  async upload(file: File): Promise<UploadResult> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${API_BASE}/api/upload`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(await errorText(response));
    }

    return response.json();
  },

  loadTickers(body: {
    tickers: string[];
    start: string;
    end?: string;
    frequency: string;
    m2_levels: { date: string; value: number }[] | null;
  }) {
    return call<UploadResult>("/api/load-tickers", body);
  },

  optimize(body: Common & { mode: Mode; target_return?: number; target_vol?: number }) {
    return call<{ weights: number[]; assets: string[]; warnings: string[] }>("/api/optimize", body);
  },

  frontier(body: Common & { n_points?: number; n_samples?: number }) {
    return call<FrontierResult>("/api/efficient-frontier", body);
  },

  compare(body: Common & { portfolios: { name: string; weights: number[] }[] }) {
    return call<CompareResult>("/api/compare", body);
  },

  async exportXlsx(body: Common & { portfolios: { name: string; weights: number[] }[] }) {
    const response = await fetch(`${API_BASE}/api/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(await errorText(response));
    }

    return response.blob();
  },
};
