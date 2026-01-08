// supabase/functions/search-formations/refeaSearch.ts
import {
  loadRefEA,
  refeaCityOf,
  refeaTitleOf,
  toNumberOrNull,
  haversineKm,
  type RefEARow,
} from "./refea.ts";
import { REFEA_RULES } from "./refeaRules.ts";

/**
 * RefEA Search (offline dataset)
 * Objectifs:
 * - ZÉRO hors-sujet RefEA (si pas de règle => 0 résultat RefEA)
 * - Matching robuste jobLabel -> ruleKey (chauffeur / silo / etc.)
 * - Filtre ville "soft" (même ville si possible, sinon élargir)
 * - Filtre rayon, tri distance, limite
 * - Output format compatible mergeFormationsWithoutDuplicates()
 */

type RefeaRule = {
  mustAny: string[];
  mustAll?: string[];
  forbidAny: string[];
};

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
 * Convertit un jobLabel "humain" en clé stable de règles.
 * IMPORTANT: tes clés REFEA_RULES doivent être cohérentes avec ces retours
 * (ex: "chauffeur", "silo", "responsable_silo", etc.)
 */
function ruleKey(jobLabel: string): string {
  const k = norm(jobLabel);

  // silo
  if (k.includes("responsable") && k.includes("silo")) return "responsable_silo";
  if (k.includes("agent") && k.includes("silo")) return "silo";
  if (k.includes("silo")) return "silo";

  // chauffeur
  if (k.includes("chauffeur") || k.includes("conduite")) return "chauffeur";

  // maintenance / services techniques
  if (k.includes("services") && k.includes("tech")) return "maintenance";
  if (k.includes("maintenance")) return "maintenance";

  // logistique / magasinier
  if (k.includes("magasinier") || k.includes("cariste")) return "magasinier_cariste";
  if (k.includes("logistique")) return "responsable_logistique";

  // qualité
  if (k.includes("agreeur") || k.includes("agréeur")) return "agreeur";
  if (k.includes("qualite") || k.includes("qualité")) return "controleur_qualite";

  // production
  if (k.includes("conducteur") && k.includes("ligne")) return "conducteur_ligne";

  // cultures
  if (k.includes("technicien") && k.includes("culture")) return "technicien_culture";
  if (k.includes("culture") || k.includes("agronomie")) return "technicien_culture";

  // commerce
  if (k.includes("export")) return "commercial_export";
  if (k.includes("technico")) return "technico";
  if (k.includes("commercial")) return "technico";

  return k;
}

function getRules(jobLabel: string): RefeaRule | null {
  const key = ruleKey(jobLabel);

  // tente plusieurs clés au cas où tu as des clés "label"
  const direct = (REFEA_RULES as any)[jobLabel] as RefeaRule | undefined;
  if (direct) return direct;

  const byKey = (REFEA_RULES as any)[key] as RefeaRule | undefined;
  if (byKey) return byKey;

  // aucune règle => on ne renvoie RIEN (anti-hors-sujet)
  return null;
}

function matchRules(title: string, jobLabel: string): boolean {
  const rules = getRules(jobLabel);
  if (!rules) return false;

  const t = norm(title);

  // forbidAny
  for (const w of rules.forbidAny ?? []) {
    const ww = norm(w);
    if (ww && t.includes(ww)) return false;
  }

  // mustAll
  if (Array.isArray(rules.mustAll) && rules.mustAll.length > 0) {
    for (const w of rules.mustAll) {
      const ww = norm(w);
      if (ww && !t.includes(ww)) return false;
    }
  }

  // mustAny
  if (Array.isArray(rules.mustAny) && rules.mustAny.length > 0) {
    let ok = false;
    for (const w of rules.mustAny) {
      const ww = norm(w);
      if (ww && t.includes(ww)) {
        ok = true;
        break;
      }
    }
    if (!ok) return false;
  }

  return true;
}

function safeFloat(n: any): number | null {
  const x = toNumberOrNull(n);
  if (x === null) return null;
  if (!Number.isFinite(x)) return null;
  return x;
}

function makeStableId(r: RefEARow): string {
  const code = (r as any).code_formation_maaf || (r as any).code_formation_en;
  if (code) return `refea_${code}`;
  // fallback stable-ish: titre + ville + coords
  return `refea_${norm((r as any).formacertif_libusage)}_${norm((r as any).adresse_ville)}_${(r as any).latitude ?? ""}_${(r as any).longitude ?? ""}`;
}

export function searchRefEA(params: {
  jobLabel: string; // ex: "Chauffeur Agricole"
  ville: string; // villeRef (libellé du géocode)
  userLat: number;
  userLon: number;
  radiusKm: number;
  limit?: number;
}) {
  const { jobLabel, ville, userLat, userLon, radiusKm, limit = 30 } = params;

  const cityWanted = norm(ville);
  const rows = loadRefEA();

  // 1) Filtrage métier (règles)
  // 2) Filtrage coords valides
  // 3) Distance
  const scored = rows
    .filter((r) => matchRules((r as any).formacertif_libusage, jobLabel))
    .map((r) => {
      const lat = safeFloat((r as any).latitude);
      const lon = safeFloat((r as any).longitude);
      if (lat === null || lon === null) return null;

      const dist = haversineKm(userLat, userLon, lat, lon);

      return {
        raw: r,
        dist,
        city: norm(refeaCityOf(r)),
        title: refeaTitleOf(r) || (r as any).formacertif_libusage || "",
        lat,
        lon,
      };
    })
    .filter(Boolean) as Array<{
    raw: RefEARow;
    dist: number;
    city: string;
    title: string;
    lat: number;
    lon: number;
  }>;

  // Filtre ville "soft" : même ville si possible, sinon on prend tout
  const inSameCity = scored.filter((x) => x.city === cityWanted);
  const pool = inSameCity.length > 0 ? inSameCity : scored;

  // Rayon + tri distance + limite
  const picked = pool
    .filter((x) => Number.isFinite(x.dist) && x.dist <= radiusKm)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, limit);

  // Output normalisé
  return picked.map((x) => {
    const r = x.raw as any;

    return {
      id: makeStableId(x.raw),
      intitule: r.formacertif_libusage || x.title || "Formation",
      organisme: r.uai_libcom || r.uai_libadmin || r.etablissement_niveau_1 || "Établissement",
      ville: r.adresse_ville || "",
      lat: x.lat,
      lon: x.lon,
      distance_km: Math.round(x.dist * 10) / 10,

      rncp: "Non renseigné",
      modalite: "Non renseigné",
      alternance: "Non renseigné",
      categorie: "Diplôme / Titre",

      site_web: r.site_internet || null,
      url: r.site_internet || null,

      niveau: "N/A",

      match: {
        score: 80, // RefEA = source officielle => score haut
        reasons: ["Formation issue de la source officielle (RefEA)"],
      },

      _source: "refea",
    };
  });
}
