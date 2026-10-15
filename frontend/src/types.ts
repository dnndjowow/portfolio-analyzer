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
  frequency?: Frequency;
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
  cloud: (Point & { sharpe: number; weights: number[] })[];
  assets: (Point & { name: string })[];
  min_vol: Point & { weights: number[] };
  max_sharpe?: Point & { weights: number[]; sharpe: number | null };
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

export interface IndexInfo { id: string; name: string; ticker: string; currency: string; source: string; return_type: "price" | "total" }
export interface IndexPortfolioRequest {
  indices: string[]; weights?: number[]; capital: number; start: string; end?: string;
  frequency: "monthly" | "quarterly" | "yearly";
  rebalance: "none" | "monthly" | "quarterly" | "yearly";
  base_currency: "RUB"; mode: "manual" | "min_vol" | "max_sharpe";
  risk_free: number; include_m2: boolean;
}
export interface IndexStats { total_return: number; cagr: number; expected_return: number; volatility: number; max_drawdown: number; sharpe?: number | null }
export interface IndexPortfolioRow {
  date: string; nominal: number; real: number; nominal_growth: number; real_growth: number; m2_growth: number | null;
  nominal_return: number | null; real_return: number | null; inflation: number | null; nominal_drawdown: number; real_drawdown: number;
}
export interface IndexPortfolioResult {
  indices: IndexInfo[]; weights: number[]; final_weights: number[]; capital: number;
  mode: IndexPortfolioRequest["mode"]; rebalance: IndexPortfolioRequest["rebalance"]; frequency: IndexPortfolioRequest["frequency"];
  start: string; end: string; n_months: number;
  nominal_metrics: IndexStats; real_metrics: IndexStats; final_nominal_capital: number; final_real_capital: number;
  cumulative_inflation: number; risk_free_real: number; rows: IndexPortfolioRow[]; warnings: string[];
  sources: { indices: string[]; inflation: string; currency: string; m2: string };
}
