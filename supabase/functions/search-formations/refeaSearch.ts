// supabase/functions/search-formations/refeaSearch.ts
import {
  loadRefEA,
  refeaCityOf,
  refeaTitleOf,
  toNumberOrNull,
  haversineKm,
  type RefEARow,
} from "./refea.ts";
import { REFEA_RULES, type RefeaRule } from "./refeaRules.ts";

/**
 * RefEA Search (offline dataset)
 * ✅ ULTRA PROPRE / ZÉRO HORS-SUJET
 * - Filtrage métier strict via refeaRules.ts (obligatoire)
 * - Fix encodage (LycÃ©e -> Lycée)
 * - URL normalisée
 * - Niveau détecté (3/4/5/6)
 * - Dédup stable
 */

// ----------------------------------------------------------------------
// 1) TEXT UTILS
// ----------------------------------------------------------------------

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
 * Fix strings like "LycÃ©e" -> "Lycée"
 * (typical mojibake: UTF-8 bytes interpreted as Latin-1)
 */
function fixEncoding(s: string | null | undefined): string {
  if (!s) return "";
  // quick escape: already looks fine
  if (!/[ÃÂ�]/.test(s)) return s;

  try {
    // reinterpret each char code as a byte
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    // latin1 decode is the typical repair for mojibake
    return new TextDecoder("latin1").decode(bytes);
  } catch {
    return s;
  }
}

function formatCity(s: string | null | undefined): string {
  const fixed = fixEncoding(s);
  const clean = fixed.trim();
  if (!clean) return "";
  return clean
    .toLowerCase()
    .replace(/(^\w|[\s-]\w)/g, (m) => m.toUpperCase())
    .replace(/\bCedex\b/g, "CEDEX");
}

function fixUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let u = fixEncoding(url).trim();
  if (!u || u.length < 4) return null;

  // ignore non-web
  if (u.startsWith("mailto:") || u.startsWith("tel:")) return null;

  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}

// ----------------------------------------------------------------------
// 2) NIVEAU (3/4/5/6) FROM TITLE
// ----------------------------------------------------------------------

function detectNiveau(title: string): string {
  const t = norm(title);

  // Niveau 6+
  if (t.includes("master") || t.includes("ingenieur") || t.includes("ingénieur") || t.includes("doctorat")) return "6";
  if (t.includes("licence") || t.includes("bachelor") || t.includes("but ") || t.includes("b u t") || t.includes("b.u.t")) return "6";

  // Niveau 5
  if (t.includes("btsa") || t.includes("bts") || t.includes("dut")) return "5";

  // Niveau 4
  if (t.includes("bac pro") || t.includes("baccalaureat professionnel") || t.includes("baccalauréat professionnel")) return "4";
  if (t.includes("bp ") || t.includes("brevet professionnel") || t.includes("bprea")) return "4";
  if (t.includes("csa") || t.includes("certificat de specialisation") || t.includes("certificat de spécialisation")) return "4";

  // Niveau 3
  if (t.includes("capa") || (t.includes("cap") && !t.includes("capitaine"))) return "3";
  if (t.includes("bpa") || t.includes("bepa") || t.includes("bep")) return "3";

  return "N/A";
}

// ----------------------------------------------------------------------
// 3) RULES (OBLIGATOIRES)
// ----------------------------------------------------------------------

function getRulesStrict(jobLabel: string): RefeaRule | null {
  // compat: le index.ts envoie config.label ("Technico-commercial")
  // refeaRules.ts fournit aussi des alias par label => REFEA_RULES[jobLabel] marche.
  const direct = REFEA_RULES[jobLabel];
  if (direct) return direct;

  // sinon fallback sur normalisation simple (au cas où)
  const k = norm(jobLabel);
  const alt =
    REFEA_RULES[k] ||
    (k.includes("responsable") && k.includes("silo") ? REFEA_RULES["responsable_silo"] : undefined) ||
    (k.includes("silo") ? REFEA_RULES["silo"] : undefined) ||
    (k.includes("chauffeur") ? REFEA_RULES["chauffeur"] : undefined) ||
    (k.includes("technico") ? REFEA_RULES["technico"] : undefined) ||
    (k.includes("export") ? REFEA_RULES["commercial_export"] : undefined) ||
    (k.includes("logistique") ? REFEA_RULES["responsable_logistique"] : undefined) ||
    ((k.includes("magasinier") || k.includes("cariste")) ? REFEA_RULES["magasinier_cariste"] : undefined) ||
    (k.includes("qualite") ? REFEA_RULES["controleur_qualite"] : undefined) ||
    (k.includes("agreeur") ? REFEA_RULES["agreeur"] : undefined) ||
    (k.includes("conducteur") && k.includes("ligne") ? REFEA_RULES["conducteur_ligne"] : undefined) ||
    (k.includes("technicien") && k.includes("culture") ? REFEA_RULES["technicien_culture"] : undefined) ||
    undefined;

  return alt ?? null;
}

function matchRulesStrict(title: string, rule: RefeaRule): boolean {
  const t = norm(title);

  // forbidAny => reject
  for (const w of rule.forbidAny ?? []) {
    const ww = norm(w);
    if (ww && t.includes(ww)) return false;
  }

  // mustAll
  if (Array.isArray(rule.mustAll) && rule.mustAll.length > 0) {
    for (const w of rule.mustAll) {
      const ww = norm(w);
      if (ww && !t.includes(ww)) return false;
    }
  }

  // mustAny (at least 1)
  if (Array.isArray(rule.mustAny) && rule.mustAny.length > 0) {
    for (const w of rule.mustAny) {
      const ww = norm(w);
      if (ww && t.includes(ww)) return true;
    }
    return false;
  }

  // safety: if no mustAny => refuse (ultra strict)
  return false;
}

// ----------------------------------------------------------------------
// 4) COORDS + ID + DEDUP
// ----------------------------------------------------------------------

function safeFloat(v: any): number | null {
  const x = toNumberOrNull(v);
  if (x === null) return null;
  if (!Number.isFinite(x)) return null;
  return x;
}

function stableId(r: RefEARow): string {
  const anyr: any = r as any;
  const code = anyr.code_formation_maaf || anyr.code_formation_en;
  if (code) return `refea_${code}`;

  // fallback stable (hash-like key)
  const a = norm(anyr.formacertif_libusage);
  const b = norm(anyr.uai_libcom || anyr.uai_libadmin || anyr.etablissement_niveau_1);
  const c = norm(anyr.adresse_ville);
  const d = `${anyr.latitude ?? ""}_${anyr.longitude ?? ""}`;
  return `refea_${a}_${b}_${c}_${d}`.slice(0, 220);
}

function dedupKey(intitule: string, organisme: string, ville: string): string {
  return `${norm(intitule)}|${norm(organisme)}|${norm(ville)}`;
}

// ----------------------------------------------------------------------
// 5) MAIN
// ----------------------------------------------------------------------

export function searchRefEA(params: {
  jobLabel: string;
  ville: string;
  userLat: number;
  userLon: number;
  radiusKm: number;
  limit?: number;
}) {
  const { jobLabel, userLat, userLon, radiusKm, limit = 30 } = params;

  // RULES ARE MANDATORY
  const rules = getRulesStrict(jobLabel);
  if (!rules) return [];

  const rows = loadRefEA();

  const candidates = rows
    .map((r) => {
      const anyr: any = r as any;

      const titleRaw = (refeaTitleOf(r) || anyr.formacertif_libusage || "").toString();
      const title = fixEncoding(titleRaw);

      // métier strict
      if (!matchRulesStrict(title, rules)) return null;

      const lat = safeFloat(anyr.latitude);
      const lon = safeFloat(anyr.longitude);
      if (lat === null || lon === null) return null;

      const dist = haversineKm(userLat, userLon, lat, lon);
      if (dist > radiusKm) return null;

      const org = fixEncoding(anyr.uai_libcom || anyr.uai_libadmin || anyr.etablissement_niveau_1 || "Établissement");
      const city = formatCity(anyr.adresse_ville || refeaCityOf(r) || "");

      const url = fixUrl(anyr.site_internet);

      return {
        raw: r,
        id: stableId(r),
        title,
        org,
        city,
        lat,
        lon,
        dist,
        url,
        niveau: detectNiveau(title),
      };
    })
    .filter(Boolean) as Array<{
    raw: RefEARow;
    id: string;
    title: string;
    org: string;
    city: string;
    lat: number;
    lon: number;
    dist: number;
    url: string | null;
    niveau: string;
  }>;

  // sort by distance
  candidates.sort((a, b) => a.dist - b.dist);

  // dedup internal
  const seen = new Set<string>();
  const uniq: typeof candidates = [];
  for (const c of candidates) {
    const k = dedupKey(c.title, c.org, c.city);
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(c);
    if (uniq.length >= limit) break;
  }

  // map output format identical to LBA to merge properly
  return uniq.map((x) => ({
    id: x.id,
    intitule: x.title || "Formation",
    organisme: x.org,
    ville: x.city,
    lat: x.lat,
    lon: x.lon,
    distance_km: Math.round(x.dist * 10) / 10,
    rncp: "Non renseigné",
    modalite: "Non renseigné",
    alternance: "Non renseigné",
    categorie: "Diplôme / Titre (Source officielle RefEA)",
    site_web: x.url,
    url: x.url,
    niveau: x.niveau,
    match: {
      score: 80,
      reasons: ["Formation issue de la source officielle (RefEA)"],
    },
    _source: "refea",
  }));
}
