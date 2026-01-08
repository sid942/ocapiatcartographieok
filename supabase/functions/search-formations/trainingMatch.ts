// supabase/functions/search-formations/trainingMatch.ts
import { TRAINING_WHITELIST } from "./trainingWhitelist.ts";

function norm(s: string) {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Retourne true si la formation est autorisée par la whitelist du métier
 * - deny gagne toujours
 * - allow = au moins un match
 */
export function filterByTrainingWhitelist(jobKey: string, intitule: string, organisme?: string) {
  const wl = TRAINING_WHITELIST[jobKey];

  // si pas de whitelist pour ce métier => on laisse passer
  // (tu peux mettre "return false" si tu veux BLOQUER par défaut)
  if (!wl) return true;

  const text = norm(`${intitule ?? ""} ${organisme ?? ""}`);

  // deny gagne toujours
  if (Array.isArray(wl.deny)) {
    for (const d of wl.deny) {
      const dd = norm(d);
      if (dd && text.includes(dd)) return false;
    }
  }

  // allow: au moins un match
  for (const a of wl.allow) {
    const aa = norm(a);
    if (aa && text.includes(aa)) return true;
  }

  return false;
}
