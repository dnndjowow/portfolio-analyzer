/** Пример загружается из MOEX ISS при нажатии пользователем. */
export const MARKET_EXAMPLE = {
  tickers: ["MOEX:SBER", "MOEX:GAZP", "MOEX:LKOH", "MOEX:ROSN", "MOEX:NVTK", "MOEX:TATN", "MOEX:MTSS", "MOEX:AFLT", "MOEX:CHMF"],
  start: "2015-01-01",
  frequency: "monthly" as const,
};

/** Шаблон содержит только заголовки: пользователь добавляет свои доходности. */
export function downloadTemplate() {
  const headers = ["Дата", ...MARKET_EXAMPLE.tickers];
  const url = URL.createObjectURL(new Blob(["\ufeff" + headers.join(";") + "\n"], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "portfolio_returns_template.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
