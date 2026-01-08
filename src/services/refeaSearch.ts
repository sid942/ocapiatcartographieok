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
 * Version VALIDÉE EXPERT OCAPIAT + FIX ENCODAGE + NIVEAUX + URLS
 */

// ----------------------------------------------------------------------
// 1. UTILITAIRES (Encodage, URLs, Niveaux)
// ----------------------------------------------------------------------

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

function fixUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let clean = url.trim();
  if (clean.length < 4) return null;
  if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
    clean = "https://" + clean;
  }
  return clean;
}

function formatCity(str: string | null | undefined): string {
  const fixed = fixEncoding(str);
  if (!fixed) return "";
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

function detectNiveau(title: string): string {
  const t = norm(title);
  // NIVEAU 6 (Bac+3 et plus)
  if (t.includes("ingenieur") || t.includes("master") || t.includes("doctorat") || t.includes("licence") || t.includes("bachelor") || t.includes("but ") || t.includes("b.u.t")) return "6";
  // NIVEAU 5 (Bac+2)
  if (t.includes("bts") || t.includes("btsa") || t.includes("dut ")) return "5";
  // NIVEAU 4 (Bac / BP)
  if (t.includes("bac pro") || t.includes("baccalaureat pro") || t.includes("bp ") || t.includes("brevet pro") || t.includes("bprea") || t.includes("csa ") || t.includes("certificat de specialisation") || t.includes("technicien")) return "4";
  // NIVEAU 3 (CAP / BPA)
  if (t.includes("cap") || t.includes("capa") || t.includes("bpa ") || t.includes("brevet professionnel agricole") || t.includes("bepa")) return "3";
  return "N/A";
}

// ----------------------------------------------------------------------
// 2. LOGIQUE MÉTIER
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
  if (!rules) return false; 
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
    .filter(Boolean) as Array<{ raw: RefEARow; dist: number; city: string; title: string; lat: number; lon: number; }>;

  const picked = scored
    .sort((a, b) => a.dist - b.dist)
    .slice(0, limit);

  return picked.map((x) => {
    const r = x.raw as any;
    const titrePropre = fixEncoding(r.formacertif_libusage || x.title);
    const organismePropre = fixEncoding(r.uai_libcom || r.uai_libadmin || r.etablissement_niveau_1 || "Établissement");
    const villePropre = formatCity(r.adresse_ville);
    const niveauDetecte = detectNiveau(titrePropre);
    const urlPropre = fixUrl(r.site_internet);

    return {
      id: makeStableId(x.raw),
      intitule: titrePropre || "Formation",
      organisme: organismePropre,
      ville: villePropre,
      lat: x.lat,
      lon: x.lon,
      distance_km: Math.round(x.dist * 10) / 10,
      rncp: "Non renseigné",
      modalite: "Scolaire / Apprentissage",
      alternance: "Possible",
      categorie: "Diplôme / Titre (Source officielle RefEA)",
      site_web: urlPropre,
      url: urlPropre,
      niveau: niveauDetecte,
      match: {
        score: 80,
        reasons: ["Formation certifiée Ministère de l'Agriculture"],
      },
      _source: "refea",
    };
  });
}