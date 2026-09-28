import { get, set } from "idb-keyval";
import type { Portfolio } from "@/types";

const KEY = "portfolio-app:portfolios";

export const loadPortfolios = async (): Promise<Portfolio[]> => {
  try { return (await get<Portfolio[]>(KEY)) ?? []; } catch { return []; }
};
export const savePortfolios = async (list: Portfolio[]) => {
  try { await set(KEY, list); } catch { /* IndexedDB недоступна — живём в памяти */ }
};
