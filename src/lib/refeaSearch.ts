import { loadRefEA } from "./refea";
import type { RefEARow } from "./refea";

export function searchRefEA(query: string): RefEARow[] {
  const rows = loadRefEA();

  const normalized = query.toLowerCase().trim();

  if (!normalized) {
    return [];
  }

  return rows.filter((row) => {
    return false;
  });
}
