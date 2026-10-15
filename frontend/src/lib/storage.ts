import { get, set } from "idb-keyval";
import type { Portfolio } from "@/types";

const EXCLUDED_INDICATOR = /(^[mм]2(?:ru)?$|^[mм]²$|modigliani|модильяни|денежн\w*\s+масс|money\s*supply)/i;

const PORTFOLIOS_KEY = "portfolio-app:portfolios";

export async function loadPortfolios(): Promise<Portfolio[]> {
  try {
    const portfolios = await get<Portfolio[]>(PORTFOLIOS_KEY);
    return (portfolios ?? []).filter((portfolio) =>
      !portfolio.assets.some((name) => EXCLUDED_INDICATOR.test(name)) &&
      portfolio.weights.every((weight) => Number.isFinite(weight) && weight >= 0 && weight <= 1),
    );
  } catch {
    return [];
  }
}

export async function savePortfolios(portfolios: Portfolio[]) {
  try {
    await set(PORTFOLIOS_KEY, portfolios);
  } catch {
    // При недоступной IndexedDB портфели остаются в памяти текущей вкладки.
  }
}
