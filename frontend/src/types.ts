export type Mode = "min_vol" | "max_sharpe" | "efficient_risk" | "efficient_return";
export type Frequency = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

export interface Dataset {
  columns: string[];
  index: string[];
  data: (number | null)[][];
  has_dates: boolean;
}

export interface Settings {
  units: "percent" | "fraction";
  frequency: Frequency;
  resample_to: Frequency | null;
  missing: "ffill" | "drop";
  risk_free_nominal: boolean;
  inflation: { source: "constant" | "series"; annual_rate: number; series: number[] | null };
}

export interface UploadResult {
  dataset: Dataset;
  preview: { index: string[]; data: (number | null)[][] };
  n_obs: number;
  suggested_units: "percent" | "fraction";
  warnings: string[];
}

export interface Point { ret: number; vol: number }

export interface Metrics {
  expected_return: number;
  cagr: number;
  volatility: number;
  sharpe: number | null;
  max_drawdown: number;
  max_recovery_periods: number;
  max_recovery_years: number;
  recovered: boolean;
}

export interface Portfolio {
  id: string;
  name: string;
  mode: Mode | "equal" | "manual";
  params: string;
  weights: number[];
  assets: string[];
  createdAt: number;
}

export interface FrontierResult {
  frontier: (Point & { weights: number[] })[];
  cloud: (Point & { sharpe: number })[];
  assets: (Point & { name: string })[];
  min_vol: Point & { weights: number[] };
  max_sharpe?: Point & { weights: number[]; sharpe: number };
  risk_free_real: number;
  warnings: string[];
}

export interface CompareSeries {
  name: string;
  curve: number[];
  drawdown: number[];
  point: Point;
  metrics: Metrics;
}
export interface CompareResult { index: string[]; series: CompareSeries[]; warnings: string[] }

export const MODE_LABEL: Record<Portfolio["mode"], string> = {
  min_vol: "Минимальная волатильность",
  max_sharpe: "Максимальный Шарп",
  efficient_risk: "Эффективный риск",
  efficient_return: "Эффективная доходность",
  equal: "Равные веса",
  manual: "Ручные веса",
};
