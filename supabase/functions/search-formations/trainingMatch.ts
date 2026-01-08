// supabase/functions/search-formations/trainingMatch.ts
import { TRAINING_CATALOG } from "./trainingCatalog.ts";

/**
 * Normalisation forte (anti accents / ponctuation / doubles espaces)
 */
function norm(s: any): string {
  return (s ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tokenise un texte en mots utiles (>= 3 chars)
 */
function tokens(s: string): string[] {
  return norm(s)
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

/**
 * Similarité simple basée sur recouvrement de tokens.
 * Retourne une valeur entre 0 et 1.
 */
function tokenOverlapScore(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;

  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;

  // Jaccard-like
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Match strict:
 * - exact contains / equals sur label ou abréviation
 * - sinon overlap tokens >= threshold
 */
export function matchAllowedTraining(jobKey: string, formationTitle: string): boolean {
  const cat = (TRAINING_CATALOG as any)[jobKey];
  if (!cat) return false;

  const titleN = norm(formationTitle);
  if (!titleN) return false;

  const entries: Array<{ label: string; aliases?: string[] }> = Array.isArray(cat?.trainings)
    ? cat.trainings
    : [];

  // 1) match direct (contains / equals) sur label + aliases
  for (const e of entries) {
    const labelN = norm(e?.label ?? "");
    if (labelN && (titleN === labelN || titleN.includes(labelN) || labelN.includes(titleN))) return true;

    const aliases = Array.isArray(e?.aliases) ? e.aliases : [];
    for (const a of aliases) {
      const aN = norm(a);
      if (!aN) continue;
      if (titleN === aN) return true;
      // abréviation peut être courte => match sur mots
      if (aN.length >= 3 && titleN.includes(aN)) return true;
    }
  }

  // 2) match fuzzy par recouvrement tokens
  const threshold = typeof cat?.match_threshold === "number" ? cat.match_threshold : 0.52;

  for (const e of entries) {
    const label = e?.label ?? "";
    const score = tokenOverlapScore(label, formationTitle);
    if (score >= threshold) return true;
  }

  return false;
}

/**
 * Filtre un tableau de formations avec la whitelist Excel.
 * getterTitle = fonction qui extrait le titre (intitulé) de l’objet formation.
 */
export function filterByTrainingWhitelist<T>(
  jobKey: string,
  formations: T[],
  getterTitle: (f: T) => string
): T[] {
  const cat = (TRAINING_CATALOG as any)[jobKey];
  if (!cat) return [];

  // si catalogue "enabled" false => pas de filtrage (mais chez toi on va laisser true partout)
  if (cat?.enabled === false) return formations;

  const out: T[] = [];
  for (const f of formations) {
    const title = getterTitle(f) ?? "";
    if (matchAllowedTraining(jobKey, title)) out.push(f);
  }
  return out;
}
