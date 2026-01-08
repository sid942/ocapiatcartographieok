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
 * ✅ Filtrage métier strict via refeaRules.ts
 * ✅ Anti "collège / 4e / 3e / orientation" (anti bruit RefEA)
 * ✅ Fix encodage, URLs, niveaux, IDs stables
 */

// ----------------------------------------------------------------------
// 1) TEXT UTILS (norm, encoding, url)
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
 * Répare les chaines mal encodées (cas typique "OpÃ©rateur").
 * Remarque : ce fix est volontairement conservateur.
 */
function fixEncoding(str: string | null | undefined): string {
  if (!str) return "";
  // Si déjà clean, ne pas toucher
  if (!/[ÃÂ�]/.test(str)) return str;
  try {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
    // latin1 -> utf8 est souvent le bon sens pour corriger "Ã©"
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return str;
  }
}

function fixUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let u = url.trim();
  if (u.length < 4) return null;
  // évite les valeurs "N/A", "non renseigne", etc.
  const n = norm(u);
  if (n === "na" || n.includes("non renseigne") || n === "null") return null;
  if (!u.startsWith("http://") && !u.startsWith("https://")) u = "https://" + u;
  return u;
}

/**
 * "SAINT GENIS LAVAL" -> "Saint Genis Laval"
 */
function formatCity(str: string | null | undefined): string {
  const fixed = fixEncoding(str);
  if (!fixed) return "";
  return fixed
    .toLowerCase()
    .replace(/(^\w|\s\w)/g, (m) => m.toUpperCase());
}

// ----------------------------------------------------------------------
// 2) ANTI-JUNK RefEA (collège/orientation/etc.)
// ----------------------------------------------------------------------

function isSchoolJunkTitle(title: string): boolean {
  const t = norm(title);
  // Bruit très fréquent dans RefEA
  const banned = [
    "cycle orientation",
    "college",
    "collège",
    "classe de 4",
    "classe de 3",
    "4eme",
    "4ème",
    "3eme",
    "3ème",
    "enseignement agricole classe",
    "cycle orientation college",
    "cycle d orientation",
    "cycle d orientation college",
  ];
  return banned.some((k) => t.includes(norm(k)));
}

// Optionnel : si tu veux virer aussi les entrées "orientation/college" qui contiennent juste "cycle"
function isSchoolJunkRow(r: any): boolean {
  const title = (r?.formacertif_libusage ?? "") as string;
  const other = `${r?.intitule ?? ""} ${r?.libelle ?? ""}`;
  return isSchoolJunkTitle(title) || isSchoolJunkTitle(other);
}

// ----------------------------------------------------------------------
// 3) NIVEAU (pour filtre UI)
// ----------------------------------------------------------------------

function detectNiveau(title: string): string {
  const t = norm(title);

  // Niv 6 (Bac+3 et +)
  if (
    t.includes("ingenieur") ||
    t.includes("ingénieur") ||
    t.includes("master") ||
    t.includes("doctorat") ||
    t.includes("licence") ||
    t.includes("bachelor") ||
    t.includes("but ") ||
    t.includes("b u t")
  ) return "6";

  // Niv 5 (Bac+2)
  if (t.includes("btsa") || t.includes("bts") || t.includes("dut")) return "5";

  // Niv 4 (Bac / BP / CS souvent post-bac mais on garde 4 ici pour l’UI)
  if (t.includes("bac pro") || t.includes("baccalaureat pro") || t.includes("baccalaureat professionnel")) return "4";
  if (t.includes("bp ") || t.includes("brevet professionnel") || t.includes("bprea")) return "4";
  if (t.includes("csa ") || t.includes("certificat de specialisation") || t.startsWith("cs ")) return "4";
  if (t.includes("technicien")) return "4";

  // Niv 3 (CAP / CAPA / BPA / BEPA)
  if (t.includes("capa") || (t.includes("cap") && !t.includes("capacit"))) return "3";
  if (t.includes("bpa ") || t.includes("brevet professionnel agricole") || t.includes("bepa")) return "3";

  return "N/A";
}

// ----------------------------------------------------------------------
// 4) RULES (RefEA rules.ts)
// ----------------------------------------------------------------------

type RefeaRule = {
  mustAny: string[];
  mustAll?: string[];
  forbidAny: string[];
};

function ruleKey(jobLabel: string): string {
  const k = norm(jobLabel);

  if (k.includes("responsable") && k.includes("silo")) return "responsable de silo";
  if (k.includes("agent") && k.includes("silo")) return "agent de silo";
  if (k.includes("silo")) return "agent de silo";

  if (k.includes("chauffeur") || k.includes("conduite")) return "chauffeur agricole";

  if ((k.includes("services") && k.includes("tech")) || k.includes("maintenance")) return "responsable services techniques";

  if (k.includes("magasinier") || k.includes("cariste")) return "magasinier cariste";
  if (k.includes("logistique")) return "responsable logistique";

  if (k.includes("agreeur") || k.includes("agréeur")) return "agreeur";
  if (k.includes("qualite") || k.includes("qualité")) return "controleur qualite";

  if (k.includes("conducteur") && k.includes("ligne")) return "conducteur de ligne";

  if (k.includes("technicien") && k.includes("culture")) return "technicien culture";
  if (k.includes("culture") || k.includes("agronomie")) return "technicien culture";

  if (k.includes("export")) return "commercial export";

  if (k.includes("technico")) return "technico commercial";
  if (k.includes("commercial")) return "technico commercial";

  return k;
}

function getRules(jobLabel: string): RefeaRule | null {
  // On préfère la clé normalisée, car REFEA_RULES est défini avec libellés humains
  const key = ruleKey(jobLabel);
  const direct = (REFEA_RULES as any)[jobLabel] as RefeaRule | undefined;
  if (direct) return direct;
  const byKey = (REFEA_RULES as any)[key] as RefeaRule | undefined;
  if (byKey) return byKey;
  return null;
}

function matchRules(title: string, jobLabel: string): boolean {
  const rules = getRules(jobLabel);
  // Sécurité : si pas de règle -> on n'affiche rien (sinon RefEA devient trop permissif)
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

// ----------------------------------------------------------------------
// 5) SAFE GEO + ID
// ----------------------------------------------------------------------

function safeFloat(n: any): number | null {
  const x = toNumberOrNull(n);
  if (x === null) return null;
  if (!Number.isFinite(x)) return null;
  return x;
}

function makeStableId(r: RefEARow): string {
  const anyr = r as any;
  const code = anyr.code_formation_maaf || anyr.code_formation_en;
  if (code) return `refea_${code}`;
  // fallback stable-ish
  return `refea_${norm(anyr.formacertif_libusage)}_${norm(anyr.adresse_ville)}_${anyr.latitude ?? ""}_${anyr.longitude ?? ""}`;
}

// ----------------------------------------------------------------------
// 6) MAIN
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

  const cityWanted = norm(ville);
  const rows = loadRefEA();

  const mapped = rows
    // 1) Anti bruit scolaire (RefEA)
    .filter((r: any) => !isSchoolJunkRow(r))
    // 2) Rules métier
    .filter((r: any) => matchRules((r as any).formacertif_libusage ?? "", jobLabel))
    // 3) Map + distance
    .map((r: any) => {
      const lat = safeFloat(r.latitude);
      const lon = safeFloat(r.longitude);
      if (lat === null || lon === null) return null;

      const dist = haversineKm(userLat, userLon, lat, lon);
      if (dist > radiusKm) return null;

      const city = norm(refeaCityOf(r as RefEARow) || r.adresse_ville || "");
      const title = refeaTitleOf(r as RefEARow) || r.formacertif_libusage || "";

      return { raw: r as RefEARow, dist, city, title, lat, lon };
    })
    .filter(Boolean) as Array<{
      raw: RefEARow;
      dist: number;
      city: string;
      title: string;
      lat: number;
      lon: number;
    }>;

  // 4) Soft city bias: si on a des résultats dans la même ville, on ne garde que ceux-là
  const inSameCity = mapped.filter((x) => x.city === cityWanted);
  const pool = inSameCity.length > 0 ? inSameCity : mapped;

  // 5) Tri + limit
  const picked = pool.sort((a, b) => a.dist - b.dist).slice(0, limit);

  // 6) Output normalisé
  return picked.map((x) => {
    const r = x.raw as any;

    const titrePropre = fixEncoding(r.formacertif_libusage || x.title) || "Formation";
    const organismePropre =
      fixEncoding(r.uai_libcom || r.uai_libadmin || r.etablissement_niveau_1) || "Établissement";
    const villePropre = formatCity(r.adresse_ville || refeaCityOf(x.raw) || "");
    const niveauDetecte = detectNiveau(titrePropre);

    const urlPropre = fixUrl(r.site_internet);

    return {
      id: makeStableId(x.raw),
      intitule: titrePropre,
      organisme: organismePropre,
      ville: villePropre,
      lat: x.lat,
      lon: x.lon,
      distance_km: Math.round(x.dist * 10) / 10,
      rncp: "Non renseigné",
      modalite: "Non renseigné",
      alternance: "Non renseigné",
      categorie: "Diplôme / Titre (Source officielle RefEA)",
      site_web: urlPropre,
      url: urlPropre,
      niveau: niveauDetecte,
      match: {
        score: 80,
        reasons: ["Formation issue de la source officielle (RefEA)"],
      },
      _source: "refea",
    };
  });
}
