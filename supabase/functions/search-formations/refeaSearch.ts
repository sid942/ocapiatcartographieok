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
 * Version VALIDÉE EXPERT OCAPIAT + FIX ENCODAGE
 */

// ----------------------------------------------------------------------
// 1. UTILITAIRES (Encodage & Normalisation)
// ----------------------------------------------------------------------

/**
 * Répare les chaines mal encodées (Windows-1252 lu comme UTF-8).
 * Transforme "LycÃ©e" en "Lycée".
 */
function fixEncoding(str: string | null | undefined): string {
  if (!str) return "";
  try {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      bytes[i] = str.charCodeAt(i);
    }
    return new TextDecoder("utf-8").decode(bytes);
  } catch (e) {
    return str;
  }
}

/**
 * Formate une ville : "SAINT ETIENNE" -> "Saint Etienne"
 */
function formatCity(str: string | null | undefined): string {
  const fixed = fixEncoding(str);
  if (!fixed) return "";
  // Met en minuscules puis met la première lettre de chaque mot en majuscule
  return fixed.toLowerCase().replace(/(^\w|\s\w)/g, (m) => m.toUpperCase());
}

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

// ----------------------------------------------------------------------
// 2. LOGIQUE MÉTIER (Règles & Clés)
// ----------------------------------------------------------------------

type RefeaRule = {
  mustAny: string[];
  mustAll?: string[];
  forbidAny: string[];
};

function ruleKey(jobLabel: string): string {
  const k = norm(jobLabel);
  if (k.includes("responsable") && k.includes("silo")) return "responsable_silo";
  if (k.includes("agent") && k.includes("silo")) return "silo";
  if (k.includes("silo")) return "silo";
  if (k.includes("chauffeur") || k.includes("conduite")) return "chauffeur";
  if (k.includes("services") && k.includes("tech")) return "maintenance";
  if (k.includes("maintenance")) return "maintenance";
  if (k.includes("magasinier") || k.includes("cariste")) return "magasinier_cariste";
  if (k.includes("logistique")) return "responsable_logistique";
  if (k.includes("agreeur") || k.includes("agréeur")) return "agreeur";
  if (k.includes("qualite") || k.includes("qualité")) return "controleur_qualite";
  if (k.includes("conducteur") && k.includes("ligne")) return "conducteur_ligne";
  if (k.includes("technicien") && k.includes("culture")) return "technicien_culture";
  if (k.includes("culture") || k.includes("agronomie")) return "technicien_culture";
  if (k.includes("export")) return "commercial_export";
  if (k.includes("technico")) return "technico";
  if (k.includes("commercial")) return "technico";
  return k;
}

function getRules(jobLabel: string): RefeaRule | null {
  const key = ruleKey(jobLabel);
  const direct = (REFEA_RULES as any)[jobLabel] as RefeaRule | undefined;
  if (direct) return direct;
  const byKey = (REFEA_RULES as any)[key] as RefeaRule | undefined;
  if (byKey) return byKey;
  return null;
}

function matchRules(title: string, jobLabel: string): boolean {
  const rules = getRules(jobLabel);
  if (!rules) return false; // Pas de règle = Pas de résultat (Sécurité)

  const t = norm(title);

  // 1. Interdiction stricte (Le Filtre)
  for (const w of rules.forbidAny ?? []) {
    const ww = norm(w);
    if (ww && t.includes(ww)) return false;
  }

  // 2. Obligation de TOUS les mots (Rare)
  if (Array.isArray(rules.mustAll) && rules.mustAll.length > 0) {
    for (const w of rules.mustAll) {
      const ww = norm(w);
      if (ww && !t.includes(ww)) return false;
    }
  }

  // 3. Obligation d'AU MOINS un mot (Le Carburant)
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
  return `refea_${norm((r as any).formacertif_libusage)}_${norm((r as any).adresse_ville)}_${(r as any).latitude ?? ""}`;
}

// ----------------------------------------------------------------------
// 3. FONCTION PRINCIPALE
// ----------------------------------------------------------------------

export function searchRefEA(params: {
  jobLabel: string;
  ville: string;
  userLat: number;
  userLon: number;
  radiusKm: number;
  limit?: number;
}) {
  const { jobLabel, ville, userLat, userLon, radiusKm, limit = 30 } = params;

  const rows = loadRefEA();

  const scored = rows
    .filter((r) => matchRules((r as any).formacertif_libusage, jobLabel))
    .map((r) => {
      const lat = safeFloat((r as any).latitude);
      const lon = safeFloat((r as any).longitude);
      if (lat === null || lon === null) return null;

      const dist = haversineKm(userLat, userLon, lat, lon);
      
      // Optimisation : filtre distance immédiat
      if (dist > radiusKm) return null;

      return {
        raw: r,
        dist,
        // On garde la ville brute ici pour le tri éventuel, mais on l'affichera propre plus tard
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

  // Tri par distance (Le plus proche d'abord)
  const picked = scored
    .sort((a, b) => a.dist - b.dist)
    .slice(0, limit);

  // Output normalisé avec nettoyage des typos
  return picked.map((x) => {
    const r = x.raw as any;

    // 🧹 NETTOYAGE DES DONNÉES ICI 🧹
    const titrePropre = fixEncoding(r.formacertif_libusage || x.title);
    const organismePropre = fixEncoding(r.uai_libcom || r.uai_libadmin || r.etablissement_niveau_1 || "Établissement");
    const villePropre = formatCity(r.adresse_ville);

    return {
      id: makeStableId(x.raw),
      intitule: titrePropre || "Formation",
      organisme: organismePropre,
      ville: villePropre,
      lat: x.lat,
      lon: x.lon,
      distance_km: Math.round(x.dist * 10) / 10,
      rncp: "Non renseigné",
      modalite: "Non renseigné",
      alternance: "Non renseigné",
      categorie: "Diplôme / Titre (Source officielle RefEA)",
      site_web: r.site_internet || null,
      url: r.site_internet || null,
      niveau: "N/A",
      match: {
        score: 80,
        reasons: ["Formation certifiée Ministère de l'Agriculture"],
      },
      _source: "refea",
    };
  });
}