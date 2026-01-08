import refea from "../data/refea.json";

export type RefeaRow = Record<string, any>;

export function loadRefEA(): RefeaRow[] {
  if (Array.isArray(refea)) return refea as RefeaRow[];

  const maybe = refea as any;
  if (Array.isArray(maybe.data)) return maybe.data;
  if (Array.isArray(maybe.formations)) return maybe.formations;
  if (Array.isArray(maybe.results)) return maybe.results;

  for (const k of Object.keys(maybe)) {
    if (Array.isArray(maybe[k])) return maybe[k];
  }

  return [];
}
