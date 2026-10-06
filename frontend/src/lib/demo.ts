import type { UploadResult } from "@/types";

/** Детерминированный учебный набор. Не является историческими котировками. */
export function createDemoDataset(): UploadResult {
  let seed = 314159;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed + 1) / 4294967297;
  };
  const normal = () => Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random());
  const columns = ["M2RU", "GOLD", "SPY", "TLT", "IMOEX", "SBER", "GAZP", "EEM", "BTC", "VNQ"];
  const means = [0.95, 0.9, 1.05, 0.7, 1.2, 1.45, 0.95, 1.1, 2.4, 1.05];
  const deviations = [0.35, 3.8, 4.1, 2.3, 5.8, 7, 6.5, 5.1, 14, 4.8];
  const index: string[] = [];
  const data: number[][] = [];
  for (let t = 0; t < 120; t++) {
    index.push(new Date(Date.UTC(2016 + Math.floor(t / 12), t % 12, 1)).toISOString().slice(0, 10));
    const market = normal();
    data.push(columns.map((_, i) => Number((means[i] + deviations[i] * (0.35 * market + 0.85 * normal())).toFixed(4))));
  }
  return {
    dataset: { columns, index, data, has_dates: true },
    preview: { index: index.slice(0, 20), data: data.slice(0, 20) },
    n_obs: data.length,
    suggested_units: "percent",
    warnings: ["Демонстрационный режим: используются синтетические данные, а не исторические котировки."],
  };
}

export function downloadTemplate() {
  const { dataset } = createDemoDataset();
  // Пустая ячейка A1: парсер ищет десять названий индикаторов в B–K.
  const rows = [["", ...dataset.columns], ...dataset.data.map((row, i) => [dataset.index[i], ...row])];
  const url = URL.createObjectURL(new Blob(["\ufeff" + rows.map((row) => row.join(";")).join("\n")], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "portfolio_sample_synthetic.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
