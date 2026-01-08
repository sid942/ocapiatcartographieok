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
 * Version VALIDÉE EXPERT OCAPIAT
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
  if (!rules) return false; // Sécurité maximale : pas de règle = pas de résultat

  const t = norm(title);

  for (const w of rules.forbidAny ?? []) {
    const ww = norm(w);
    if (ww && t.includes(ww)) return false;
  }

  if (Array.isArray(rules.mustAll) && rules.mustAll.length > 0) {
    for (const w of rules.mustAll) {
      const ww = norm(w);
      if (ww && !t.includes(ww)) return false;
    }
  }

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
      
      // Optimisation : on pré-filtre la distance ici pour éviter de trier des milliers de résultats inutiles
      if (dist > radiusKm) return null;

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

  // 🛑 J'AI SUPPRIMÉ LE FILTRE "MÊME VILLE" ICI.
  // On prend tout ce qui est dans le rayon, point barre.

  // Rayon + tri distance + limite
  const picked = scored
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
      categorie: "Diplôme / Titre (Source officielle RefEA)", // Je préfère préciser la source
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