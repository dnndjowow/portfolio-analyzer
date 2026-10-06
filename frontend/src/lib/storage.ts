import { get, set } from "idb-keyval";
import type { Portfolio } from "@/types";

const PORTFOLIOS_KEY = "portfolio-app:portfolios";

export async function loadPortfolios(): Promise<Portfolio[]> {
  try {
    const portfolios = await get<Portfolio[]>(PORTFOLIOS_KEY);
    return portfolios ?? [];
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
