// supabase/functions/search-formations/index.ts
import { geocodeCityToLatLon } from "./services/nominatim";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  fetchPerplexityFormations,
  shouldEnrichWithPerplexity,
  mergeFormationsWithoutDuplicates,
  type PerplexityFormationInput,
} from "./perplexity_enrich.ts";

import { searchRefEA } from "./refeaSearch.ts";

// ==================================================================================
// CORS
// ==================================================================================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ==================================================================================
// TYPES & CONFIG
// ==================================================================================
type NiveauFiltre = "3" | "4" | "5" | "6" | "all";
type Mode = "strict" | "strict+relaxed" | "strict+relaxed+fallback_rome" | "relaxed" | "fallback_rome";
type Phase = "strict" | "relaxed" | "fallback";

interface JobProfile {
  key: string;
  label: string;
  romes: string[];
  fallback_romes?: string[];
  radius_km: number;
  strong_keywords: string[];
  synonyms: string[];
  weak_keywords: string[];
  banned_keywords: string[];
  banned_phrases: string[];
  context_keywords?: string[];
  min_score: number;
  target_min_results: number;
  max_extra_radius_km: number;
  relaxed_min_score?: number;
  max_results?: number;
  soft_distance_cap_km?: number;
  hard_distance_cap_km?: number;
}

const DEBUG = false;

const FETCH_TIMEOUT_MS = 10_000;

// Score constants
const ABSOLUTE_MIN_SCORE = 10; // on durcit un peu
const MAX_WHY_REASONS = 3;

// Perplexity
const PERPLEXITY_SCORE = 14;
const MIN_RESULTS_BEFORE_ENRICH = 10;
const MAX_AVG_DISTANCE_BEFORE_ENRICH = 150;

// Global caps (anti 100+ résultats)
const GLOBAL_MAX_RESULTS_DEFAULT = 40; // <- IMPORTANT : on coupe à 40 max
const REFEA_MAX = 20;                 // RefEA max dans le mix final
const LBA_MAX = 30;                   // LBA max dans le mix final
const PPLX_MAX = 10;                  // Perplexity max dans le mix final

function getPerplexityHardCap(config: JobProfile) {
  return typeof config.hard_distance_cap_km === "number" ? config.hard_distance_cap_km : 450;
}

// ==================================================================================
// TEXT UTILS + DISTANCE
// ==================================================================================
function cleanText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesWord(text: string, word: string): boolean {
  const t = cleanText(text);
  const w = cleanText(word);
  if (!w || w.length < 2) return false;
  const re = new RegExp(`\\b${escapeRegExp(w)}\\b`, "i");
  return re.test(t);
}

function includesPhrase(text: string, phrase: string): boolean {
  const t = cleanText(text);
  const p = cleanText(phrase);
  if (!p) return false;
  return t.includes(p);
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function normalizeNiveauFilter(n: any): NiveauFiltre {
  const s = (n ?? "all").toString().trim();
  if (s === "3" || s === "4" || s === "5" || s === "6") return s;
  return "all";
}

function inferNiveau(diplomaLevel: any, title: string): string {
  const dl = (diplomaLevel ?? "").toString().trim();
  if (dl === "3" || dl === "4" || dl === "5" || dl === "6") return dl;

  const t = cleanText(title);

  // Niv 6
  if (includesWord(t, "ingenieur") || includesWord(t, "master") || includesWord(t, "but") || includesWord(t, "licence") || includesWord(t, "bachelor")) return "6";
  // Niv 5
  if (includesWord(t, "btsa") || includesWord(t, "bts") || includesWord(t, "dut")) return "5";
  // Niv 4
  if (includesPhrase(t, "brevet professionnel") || includesWord(t, "bp")) return "4";
  if (includesPhrase(t, "bac pro") || includesPhrase(t, "baccalaureat professionnel")) return "4";
  if (includesWord(t, "technicien")) return "4";
  // Niv 3
  if (includesPhrase(t, "capa") || includesWord(t, "cap")) return "3";
  if (includesWord(t, "bep") || includesWord(t, "bepa")) return "3";
  if (includesWord(t, "bpa")) return "3";

  return "N/A";
}

// ==================================================================================
// GLOBAL HARD BLOCKLIST (ANTI COLLÈGE / HORS SUJET)
// ==================================================================================
const GLOBAL_FORBID: string[] = [
  // collège / classes / orientation
  "cycle orientation",
  "college",
  "collège",
  "classe de 4",
  "classe de 3",
  "4eme",
  "4ème",
  "3eme",
  "3ème",
  "seconde",
  "2nde",
  "orientation",
  "prepa apprentissage",
  "prépa apprentissage",
];

// ==================================================================================
// HARD FILTER METIER (LBA + PERPLEXITY) - ULTRA DISCIPLINÉ
// ==================================================================================
type HardRules = {
  must_any?: string[];          // au moins X hits (strict_min_must_hits)
  must_all?: string[];          // tous obligatoires (si fournis)
  must_none?: string[];         // si match => rejet
  strict_min_must_hits?: number;
};

function countHitsList(fullText: string, list?: string[]): number {
  if (!list?.length) return 0;
  let h = 0;
  for (const kw of list.map(cleanText).filter(Boolean)) {
    if (includesPhrase(fullText, kw) || includesWord(fullText, kw)) h++;
  }
  return h;
}

function matchesAll(fullText: string, mustAll?: string[]): boolean {
  if (!mustAll?.length) return true;
  for (const kw of mustAll.map(cleanText).filter(Boolean)) {
    if (!(includesPhrase(fullText, kw) || includesWord(fullText, kw))) return false;
  }
  return true;
}

function shouldKeepByHardRules(jobKey: string, title: string, org: string): boolean {
  const fullText = cleanText(`${title} ${org}`);

  // Global forbid (anti collège etc)
  for (const bad of GLOBAL_FORBID) {
    if (includesPhrase(fullText, bad) || includesWord(fullText, bad)) return false;
  }

  const rules = HARD_RULES_BY_JOB[jobKey] ?? HARD_RULES_BY_JOB.default;

  if (rules.must_none?.length) {
    for (const bad of rules.must_none.map(cleanText).filter(Boolean)) {
      if (includesPhrase(fullText, bad) || includesWord(fullText, bad)) return false;
    }
  }

  if (!matchesAll(fullText, rules.must_all)) return false;

  if (rules.must_any?.length) {
    const hits = countHitsList(fullText, rules.must_any);
    const minHits = typeof rules.strict_min_must_hits === "number" ? rules.strict_min_must_hits : 1;
    if (hits < minHits) return false;
  }

  return true;
}

/**
 * ⚠️ Technico : on exige "technico/solutions techniques" + signal agri/tech,
 * et on interdit le commerce générique / marketing.
 */
const HARD_RULES_BY_JOB: Record<string, HardRules> = {
  technico: {
    // must_all = on veut au moins un signal technico
    must_all: ["technico", "solutions techniques"],
    // must_any = signaux agri/tech (au moins 1)
    must_any: [
      "agrofourniture",
      "intrants",
      "semences",
      "engrais",
      "phytosanitaire",
      "nutrition animale",
      "cooperative",
      "negoce agricole",
      "biens services pour l agriculture",
      "alimentation et boissons",
      "distribution agricole",
      "btsa technico",
      "univers jardins",
      "agriculture",
      "agricole",
      "agro",
    ],
    strict_min_must_hits: 1,
    must_none: [
      // commerce générique
      "responsable du developpement commercial",
      "responsable developpement commercial",
      "business developer",
      "conseiller commercial",
      "manager du developpement",
      "marketing",
      "acquisition",
      "digital",
      "communication",
      "community",
      "negociation commerciale",
      // finance / immo
      "immobilier",
      "assurance",
      "banque",
      // tourisme / services aux personnes
      "tourisme",
      "hotellerie",
      "restauration",
      "services a la personne",
      // équitation / paysage / forêt (double sécurité)
      "equitation",
      "paysagiste",
      "foret",
      // vin (si tu veux l’autoriser, enlève ça)
      "vins",
      "spiritueux",
      "bieres",
    ],
  },

  commercial_export: {
    must_any: ["export", "international", "commerce international", "import export", "douane", "incoterms", "anglais"],
    strict_min_must_hits: 1,
    must_none: ["tourisme", "hotellerie", "restauration", "services a la personne", "equitation", "paysagiste", "foret"],
  },

  silo: {
    must_any: ["silo", "cereales", "grain", "collecte", "stockage", "sechage", "tri", "reception", "expedition", "industries agroalimentaires", "transformation", "bio industries"],
    strict_min_must_hits: 1,
    must_none: ["eau", "assainissement", "hydraulique", "gemeau", "milieux aquatiques", "riviere", "dechets", "environnement"],
  },

  responsable_silo: {
    must_any: ["silo", "cereales", "grain", "collecte", "stockage", "qualite", "stocks", "management", "chef"],
    strict_min_must_hits: 1,
    must_none: ["eau", "assainissement", "hydraulique", "gemeau", "milieux aquatiques", "riviere", "dechets", "environnement"],
  },

  chauffeur: {
    must_any: ["tracteur", "machinisme", "machines agricoles", "engins agricoles", "recolte", "travaux mecanises", "agroequipement", "conduite de machines agricoles", "conducteur de machines agricoles"],
    strict_min_must_hits: 1,
    must_none: ["transport de personnes", "taxi", "bus", "vtc", "ambulancier", "btp", "chantier", "poids lourd", "spl", "transport routier", "equitation", "foret"],
  },

  responsable_logistique: {
    must_any: ["logistique", "supply chain", "stocks", "flux", "entrepot", "expedition", "reception", "wms"],
    strict_min_must_hits: 1,
    must_none: ["transport de personnes", "chauffeur", "taxi", "bus", "vtc", "ambulancier"],
  },

  magasinier_cariste: {
    must_any: ["cariste", "caces", "magasinier", "entrepot", "logistique", "stock", "preparation de commandes", "manutention", "quai"],
    strict_min_must_hits: 1,
    must_none: ["vente", "conseil vente", "jardinerie", "animalerie"],
  },

  maintenance: {
    must_any: ["maintenance", "electromecanique", "mecanique", "automatismes", "electrique", "depannage", "industrie"],
    strict_min_must_hits: 1,
    must_none: ["informatique", "reseaux", "telecom", "automobile", "carrosserie", "motoculture"],
  },

  controleur_qualite: {
    must_any: ["qualite", "controle", "haccp", "tracabilite", "laboratoire", "analyse", "audit", "agroalimentaire", "alimentaire"],
    strict_min_must_hits: 1,
    must_none: ["mesures physiques", "instrumentation", "electronique", "cosmetique", "pharmaceutique", "chimie", "eau", "environnement"],
  },

  agreeur: {
    must_any: ["agreeur", "agreage", "fruits", "legumes", "produits frais", "calibrage", "tri", "reception", "qualite"],
    strict_min_must_hits: 1,
    must_none: ["logistique", "transport", "entrepot", "magasinier", "cariste", "eau", "environnement"],
  },

  conducteur_ligne: {
    must_any: ["conducteur de ligne", "conduite de ligne", "production", "conditionnement", "process", "reglage", "agroalimentaire", "alimentaire", "transformation"],
    strict_min_must_hits: 1,
    must_none: ["viticulture", "vigne", "oenologie", "elevage", "horticulture", "paysagiste", "equitation"],
  },

  technicien_culture: {
    must_any: ["culture", "agronomie", "maraichage", "grandes cultures", "sol", "fertilisation", "irrigation", "production vegetale", "phyto", "phytosanitaire"],
    strict_min_must_hits: 1,
    must_none: ["foret", "sylviculture", "bucheronnage", "viticulture", "vigne", "oenologie", "elevage", "paysagiste", "equitation"],
  },

  default: {},
};

// ==================================================================================
// JOB CONFIG (identique à ta logique, mais on fixe max_results raisonnable)
// ==================================================================================
const JOB_CONFIG: Record<string, JobProfile> = {
  technico: {
    key: "technico",
    label: "Technico-commercial",
    romes: ["D1407", "D1402"],
    fallback_romes: ["D1401", "D1403"],
    radius_km: 120,
    strong_keywords: ["technico", "solutions techniques", "conseil vente", "negociateur technico", "agrofourniture", "intrants", "semences", "engrais", "phytosanitaire", "nutrition animale", "cooperative", "negoce agricole"],
    synonyms: ["technico commercial agricole", "commercial agricole", "conseiller agricole"],
    weak_keywords: ["vente", "negociation", "commercial"],
    banned_keywords: ["immobilier", "assurance", "banque", "marketing", "digital"],
    banned_phrases: [],
    context_keywords: ["technico", "agrofourniture", "intrants", "semences", "engrais", "phytosanitaire", "nutrition animale", "cooperative", "negoce agricole", "agriculture", "agricole"],
    min_score: 30,
    target_min_results: 10,
    max_extra_radius_km: 320,
    relaxed_min_score: 18,
    soft_distance_cap_km: 220,
    hard_distance_cap_km: 650,
    max_results: GLOBAL_MAX_RESULTS_DEFAULT,
  },

  commercial_export: {
    key: "commercial_export",
    label: "Commercial export",
    romes: ["D1402"],
    fallback_romes: ["D1401", "D1407"],
    radius_km: 200,
    strong_keywords: ["export", "international", "import export", "douane", "incoterms", "commerce international", "anglais"],
    synonyms: ["assistant import export", "responsable export", "charge d affaires export"],
    weak_keywords: ["commercial", "vente"],
    banned_keywords: ["immobilier", "assurance", "banque", "tourisme"],
    banned_phrases: [],
    context_keywords: ["export", "international", "douane", "incoterms", "commerce international"],
    min_score: 26,
    target_min_results: 8,
    max_extra_radius_km: 480,
    relaxed_min_score: 16,
    soft_distance_cap_km: 320,
    hard_distance_cap_km: 950,
    max_results: GLOBAL_MAX_RESULTS_DEFAULT,
  },

  // Les autres métiers : garde ta config si tu veux, ici je mets default seulement.
  default: {
    key: "default",
    label: "Recherche Générale",
    romes: ["A1416"],
    fallback_romes: ["N1303", "N1101"],
    radius_km: 80,
    strong_keywords: [],
    synonyms: [],
    weak_keywords: [],
    banned_keywords: [],
    banned_phrases: [],
    min_score: 18,
    target_min_results: 8,
    max_extra_radius_km: 220,
    relaxed_min_score: 12,
    soft_distance_cap_km: 180,
    hard_distance_cap_km: 600,
    max_results: GLOBAL_MAX_RESULTS_DEFAULT,
  },
};

// ==================================================================================
// SCORING (LBA)
// ==================================================================================
type ScoredFormation = {
  id: string;
  title: string;
  companyName: string;
  city: string | null;
  lat: number | null;
  lon: number | null;
  url: string | null;
  romes: any[] | null;
  diplomaLevel: any;
  distanceKm: number | null;
  score: number;
  reasons: string[];
  _dedupKey: string;
};

function makeDedupKey(title: string, company: string, city: string | null) {
  return `${cleanText(title)}|${cleanText(company)}|${cleanText(city || "")}`;
}

function buildUserReasons(hasRome: boolean, hasSignal: boolean, dist: number | null) {
  const reasons: string[] = [];
  if (hasSignal) reasons.push("Correspond bien au métier recherché");
  else if (hasRome) reasons.push("Proche du métier recherché");

  if (typeof dist === "number") {
    if (dist <= 15) reasons.push("Très proche de votre zone");
    else if (dist <= 40) reasons.push("Proche de votre zone");
    else reasons.push("Un peu plus éloignée");
  }

  if (!reasons.length) reasons.push("Résultat pertinent");
  return reasons.slice(0, MAX_WHY_REASONS);
}

function countHits(fullText: string, list: string[]): number {
  let hits = 0;
  for (const kw of list.map(cleanText).filter(Boolean)) {
    if (includesPhrase(fullText, kw) || includesWord(fullText, kw)) hits++;
  }
  return hits;
}

function scoreFormation(raw: any, config: JobProfile, userLat: number, userLon: number, phase: Phase): ScoredFormation | null {
  const title = raw?.title || "";
  const companyName = raw?.company?.name || "Organisme inconnu";
  const city = raw?.place?.city ?? null;
  const lat = typeof raw?.place?.latitude === "number" ? raw.place.latitude : null;
  const lon = typeof raw?.place?.longitude === "number" ? raw.place.longitude : null;

  // HARD FILTER (métier)
  if (!shouldKeepByHardRules(config.key, title, companyName)) return null;

  const fullText = cleanText(`${title} ${companyName}`);

  // banned phrases / keywords config
  for (const p of (config.banned_phrases ?? []).map(cleanText).filter(Boolean)) {
    if (includesPhrase(fullText, p)) return null;
  }
  for (const b of (config.banned_keywords ?? []).map(cleanText).filter(Boolean)) {
    if (includesPhrase(fullText, b) || includesWord(fullText, b)) return null;
  }

  let dist: number | null = null;
  if (lat !== null && lon !== null) dist = haversineKm(userLat, userLon, lat, lon);

  // Base score
  let score = 0;

  const hasRome = Array.isArray(raw?.romes)
    ? raw.romes.some((r: any) => (config.romes ?? []).includes(r?.code))
    : false;

  if (hasRome) score += 20;

  const strongHits = countHits(fullText, config.strong_keywords);
  const synHits = countHits(fullText, config.synonyms);
  const weakHits = countHits(fullText, config.weak_keywords);

  if (strongHits > 0) score += Math.min(45, strongHits * 10);
  if (synHits > 0) score += Math.min(20, synHits * 8);
  if (weakHits > 0) score += Math.min(10, weakHits * 3);

  const ctx = config.context_keywords ?? [];
  const ctxHits = ctx.length > 0 ? countHits(fullText, ctx) : 0;

  const hasSignal = strongHits > 0 || synHits > 0 || ctxHits > 0;

  // Strict discipline
  if (phase === "strict") {
    if (!hasSignal && !hasRome) return null;
    if (ctx.length > 0 && !hasSignal) return null;
  }

  // Distance component
  if (dist !== null) {
    if (dist <= 10) score += 8;
    else if (dist <= 25) score += 5;
    else if (dist <= 50) score += 2;

    const soft = config.soft_distance_cap_km ?? (config.radius_km + 150);
    const hard = config.hard_distance_cap_km ?? (soft + 250);

    if (dist > config.radius_km) score -= 6;

    if (dist > soft) {
      const extra = Math.min(30, Math.round((dist - soft) / 30));
      score -= (phase === "fallback" ? 6 : 8) + extra;
    }
    if (dist > hard) {
      score -= phase === "fallback" ? 18 : 28;
    }
  } else {
    score -= 12;
  }

  const id = raw?.id || crypto.randomUUID();
  const reasons = buildUserReasons(hasRome, hasSignal, dist);

  return {
    id,
    title,
    companyName,
    city,
    lat,
    lon,
    url: raw?.url || null,
    romes: raw?.romes || null,
    diplomaLevel: raw?.diplomaLevel,
    distanceKm: dist,
    score,
    reasons,
    _dedupKey: makeDedupKey(title, companyName, city),
  };
}

// ==================================================================================
// FETCH (timeout) + dedup/sort
// ==================================================================================
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchLBA(romes: string[], lat: number, lon: number, radiusKm: number) {
  const url = `https://labonnealternance.apprentissage.beta.gouv.fr/api/v1/formations?romes=${encodeURIComponent(
    romes.join(","),
  )}&latitude=${lat}&longitude=${lon}&radius=${radiusKm}&caller=ocapiat_app`;
  const res = await fetchWithTimeout(url, { method: "GET" }, FETCH_TIMEOUT_MS);
  if (!res.ok) return { results: [], raw_count: 0, status: res.status };
  const data = await res.json().catch(() => null);
  const results = Array.isArray(data?.results) ? data.results : [];
  return { results, raw_count: results.length, status: 200 };
}

function sortByScoreThenDistance(a: ScoredFormation, b: ScoredFormation) {
  if (b.score !== a.score) return b.score - a.score;
  const da = a.distanceKm ?? 9999;
  const db = b.distanceKm ?? 9999;
  return da - db;
}

function dedupSmart(items: ScoredFormation[], maxPerTitle = 2) {
  const seen = new Set<string>();
  const unique = items.filter((s) => {
    const k = s._dedupKey;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // limite par titre
  const counts = new Map<string, number>();
  return unique.filter((s) => {
    const tk = cleanText(s.title);
    const c = (counts.get(tk) ?? 0) + 1;
    counts.set(tk, c);
    return c <= maxPerTitle;
  });
}

function pickByThreshold(scored: ScoredFormation[], minScore: number, cap: number) {
  const threshold = Math.max(minScore, ABSOLUTE_MIN_SCORE);
  return scored.filter((s) => s.score >= threshold).sort(sortByScoreThenDistance).slice(0, cap);
}

// ==================================================================================
// STRICT ADAPTATIF (LBA)
// ==================================================================================
async function getStrictAndPoolRaw(
  config: JobProfile,
  userLat: number,
  userLon: number,
): Promise<{ strictKept: ScoredFormation[]; bestRawPool: any[]; appliedRadius: number; expanded: boolean; debug: any }> {
  const baseRadius = config.radius_km;

  const steps = [0, 30, 60, 100, 150, 200, 300, 420].filter((s) => s <= config.max_extra_radius_km);
  let appliedRadius = baseRadius;
  let expanded = false;

  let bestRawPool: any[] = [];
  let bestRawCount = -1;

  let last_status: number | undefined;
  let raw_count_last = 0;

  let finalStrict: ScoredFormation[] = [];

  for (const extra of steps) {
    appliedRadius = baseRadius + extra;
    expanded = extra > 0;

    const fetched = await fetchLBA(config.romes, userLat, userLon, appliedRadius);
    const raw = fetched.results;

    raw_count_last = fetched.raw_count;
    last_status = fetched.status;

    if (raw_count_last > bestRawCount) {
      bestRawCount = raw_count_last;
      bestRawPool = raw;
    }

    const scoredAll = raw
      .map((r: any) => scoreFormation(r, config, userLat, userLon, "strict"))
      .filter(Boolean) as ScoredFormation[];

    const keptStrict = scoredAll.filter((s) => s.score >= config.min_score);
    finalStrict = dedupSmart(keptStrict, 2).sort(sortByScoreThenDistance);

    if (DEBUG) console.log("[LBA strict] radius", appliedRadius, "raw", raw_count_last, "strictKept", finalStrict.length);

    if (finalStrict.length >= config.target_min_results) break;
  }

  return {
    strictKept: finalStrict,
    bestRawPool,
    appliedRadius,
    expanded,
    debug: { raw_count_last, best_pool_raw_count: bestRawPool.length, last_status },
  };
}

// ==================================================================================
// METIER DETECTION
// ==================================================================================
const METIER_KEY_ALIASES: Record<string, string> = {
  technico: "technico",
  "technico commercial": "technico",
  "technico-commercial": "technico",
  "commercial export": "commercial_export",
  export: "commercial_export",
};

function detectJobKey(inputMetier: any): string {
  const raw = (inputMetier ?? "").toString().trim();
  const cleaned = cleanText(raw);

  // alias directs (les + importants)
  const alias: Record<string, string> = {
    "technico-commercial": "technico",
    "technico commercial": "technico",
    "technico": "technico",
    "commercial export": "commercial_export",
    "agent de silo": "silo",
    "agent silo": "silo",
    "responsable de silo": "responsable_silo",
    "responsable silo": "responsable_silo",
    "chauffeur agricole": "chauffeur",
    "conducteur d engins agricoles": "chauffeur",
    "magasinier cariste": "magasinier_cariste",
    "magasinier / cariste": "magasinier_cariste",
    "responsable logistique": "responsable_logistique",
    "controleur qualite": "controleur_qualite",
    "contrôleur qualité": "controleur_qualite",
    "agreeur": "agreeur",
    "agréeur": "agreeur",
    "conducteur de ligne": "conducteur_ligne",
    "technicien culture": "technicien_culture",
    "responsable services techniques": "maintenance",
  };

  if (alias[cleaned]) return alias[cleaned];

  // heuristiques (mais propres)
  if (cleaned.includes("responsable") && cleaned.includes("silo")) return "responsable_silo";
  if (cleaned.includes("silo")) return "silo";

  // ⚠️ IMPORTANT : NE PLUS UTILISER "conduite"
  if (cleaned.includes("chauffeur")) return "chauffeur";
  if (cleaned.includes("engins") && cleaned.includes("agricol")) return "chauffeur";

  if (cleaned.includes("commercial") && cleaned.includes("export")) return "commercial_export";
  if (cleaned.includes("export")) return "commercial_export";

  if (cleaned.includes("technico")) return "technico";
  if (cleaned.includes("logistique")) return "responsable_logistique";
  if (cleaned.includes("cariste") || cleaned.includes("magasinier")) return "magasinier_cariste";
  if (cleaned.includes("qualite") || cleaned.includes("qualité")) return "controleur_qualite";
  if (cleaned.includes("agr")) return "agreeur";
  if (cleaned.includes("conducteur") && cleaned.includes("ligne")) return "conducteur_ligne";
  if (cleaned.includes("culture") || cleaned.includes("agronomie")) return "technicien_culture";
  if (cleaned.includes("maintenance") || (cleaned.includes("services") && cleaned.includes("tech"))) return "maintenance";

  return "default";
}


// ==================================================================================
// GEO (api-adresse)
// ==================================================================================
const AMBIGUOUS_CITY_TOKENS = new Set(["mont", "st", "ste", "saint", "sainte", "saints", "s"]);

function isAmbiguousCityInput(ville: string) {
  const q = ville.trim();
  const c = cleanText(q);
  if (q.length < 4) return true;
  if (AMBIGUOUS_CITY_TOKENS.has(c)) return true;
  const parts = c.split(" ").filter(Boolean);
  if (parts.length === 1 && AMBIGUOUS_CITY_TOKENS.has(parts[0])) return true;
  return false;
}

async function geocodeCityOrThrow(ville: string): Promise<{ userLat: number; userLon: number; villeRef: string; geoScore: number; geoTypeTried: string }> {
  const q = ville.trim();
  if (isAmbiguousCityInput(q)) throw new Error("Ville ambiguë. Merci d'indiquer le nom complet (ex: Montauban, Montpellier, Montélimar, Saint-Étienne…).");

  const tries: Array<{ type: string; url: string; minScore: number }> = [
    { type: "municipality", url: `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1&type=municipality`, minScore: 0.45 },
    { type: "city", url: `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1&type=city`, minScore: 0.45 },
    { type: "fallback", url: `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1`, minScore: 0.55 },
  ];

  for (const t of tries) {
    const rep = await fetchWithTimeout(t.url, { method: "GET" }, FETCH_TIMEOUT_MS);
    const data = await rep.json().catch(() => null);
    if (!data?.features?.length) continue;

    const f = data.features[0];
    const coords = f?.geometry?.coordinates;
    const props = f?.properties;

    if (!Array.isArray(coords) || coords.length < 2) continue;

    const [lon, lat] = coords;
    const label = props?.label || q;
    const score = typeof props?.score === "number" ? props.score : 0;

    if (score < t.minScore) continue;

    return { userLat: lat, userLon: lon, villeRef: label, geoScore: score, geoTypeTried: t.type };
  }

  throw new Error("Ville inconnue ou trop ambiguë. Merci de préciser (ex: Montélimar, Mont-de-Marsan, Montauban…).");
}

// ==================================================================================
// HANDLER
// ==================================================================================
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const metier = body?.metier;
    const ville = (body?.ville ?? "").toString().trim();
    const niveau = body?.niveau;

    if (!ville) throw new Error("Ville manquante");

    const jobKey = detectJobKey(metier);
    const config: JobProfile = (JOB_CONFIG as any)[jobKey] || JOB_CONFIG.default;

    const geo = await geocodeCityOrThrow(ville);
    const userLat = geo.userLat;
    const userLon = geo.userLon;
    const villeRef = geo.villeRef;

    const niveauFiltre = normalizeNiveauFilter(niveau);
    const cap = Math.max(10, Math.min(config.max_results ?? GLOBAL_MAX_RESULTS_DEFAULT, GLOBAL_MAX_RESULTS_DEFAULT));
    const target = Math.max(6, config.target_min_results);

    // ==================================================================================
    // 0) REFEA D'ABORD (déjà filtré par refeaRules.ts)
    // IMPORTANT : RefEA suit le radius demandé (pas 250km fixe)
    // ==================================================================================
    const refeaRadius = Math.max(config.radius_km, Math.min(config.hard_distance_cap_km ?? 450, config.radius_km + 150));
    const refeaResults = (searchRefEA({
      jobLabel: config.label,
      ville: villeRef,
      userLat,
      userLon,
      radiusKm: refeaRadius,
      limit: Math.min(REFEA_MAX, cap),
    }) || []).slice(0, REFEA_MAX);

    // ==================================================================================
    // 1) LBA (strict -> relaxed -> fallback rome)
    // ==================================================================================
    const { strictKept, bestRawPool, appliedRadius, expanded, debug } = await getStrictAndPoolRaw(config, userLat, userLon);
    let mode: Mode = "strict";
    let mergedLBA: ScoredFormation[] = strictKept;

    if (mergedLBA.length < target) {
      const relaxedScored = bestRawPool
        .map((r: any) => scoreFormation(r, config, userLat, userLon, "relaxed"))
        .filter(Boolean) as ScoredFormation[];

      const relaxedMin = config.relaxed_min_score ?? Math.max(12, config.min_score - 12);
      const relaxedPicked = pickByThreshold(dedupSmart(relaxedScored, 2), relaxedMin, Math.min(LBA_MAX, cap));
      mergedLBA = dedupSmart([...mergedLBA, ...relaxedPicked], 2).sort(sortByScoreThenDistance);

      mode = mergedLBA.length > 0 ? "strict+relaxed" : "relaxed";
    }

    if (mergedLBA.length < target) {
      const fallbackRomes = Array.from(new Set([...(config.fallback_romes ?? []), ...config.romes])).filter(Boolean);
      if (fallbackRomes.length > 0) {
        const fbRadius = Math.max(appliedRadius, config.radius_km + 150);
        const fetchedFB = await fetchLBA(fallbackRomes, userLat, userLon, fbRadius);
        const rawFB = fetchedFB.results;

        const scoredFB = rawFB
          .map((r: any) => scoreFormation(r, config, userLat, userLon, "fallback"))
          .filter(Boolean) as ScoredFormation[];

        const relaxedMin = config.relaxed_min_score ?? Math.max(12, config.min_score - 12);
        const pickedFB = pickByThreshold(dedupSmart(scoredFB, 2), relaxedMin, Math.min(LBA_MAX, cap));

        mergedLBA = dedupSmart([...mergedLBA, ...pickedFB], 2).sort(sortByScoreThenDistance);

        if (mode === "strict") mode = "fallback_rome";
        else if (mode === "strict+relaxed") mode = "strict+relaxed+fallback_rome";
        else mode = "fallback_rome";
      }
    }

    // Cap LBA
    // Cap LBA
if (mergedLBA.length > LBA_MAX) mergedLBA = mergedLBA.slice(0, LBA_MAX);

const mappedLBA = mergedLBA.map((s) => {
  const computedNiveau = inferNiveau(s.diplomaLevel, s.title);
  const distRounded = s.distanceKm === null ? 999 : round1(s.distanceKm);

  return {
    id: s.id,
    intitule: s.title,
    organisme: s.companyName,
    ville: s.city ?? villeRef,
    lat: s.lat ?? undefined,
    lon: s.lon ?? undefined,
    distance_km: distRounded,
    rncp: "Non renseigné",
    modalite: "Non renseigné",
    alternance: "Non renseigné",
    categorie: "Diplôme / Titre",
    site_web: s.url,
    url: s.url,
    niveau: computedNiveau,
    match: { score: s.score, reasons: s.reasons },
    _source: "lba",
  };
});

// ==================================================================================
// 2) FILTRE LBA (ADAPTATIF HARD -> SOFT) + MERGE RefEA + LBA
// RefEA est déjà clean côté refeaSearch.ts, on ne touche pas.
// ==================================================================================

const targetLocal = Math.max(6, config.target_min_results || 8);

// HARD (strict) : priorité zéro hors sujet
const lbaHard = mappedLBA.filter((f: any) =>
  shouldKeepByHardRules(config.key, f?.intitule ?? "", f?.organisme ?? "")
);

// SOFT : si HARD vide trop, on garde seulement les meilleurs + signaux métier
function lbaSoftKeep(f: any): boolean {
  const title = cleanText(f?.intitule ?? "");
  const org = cleanText(f?.organisme ?? "");
  const txt = `${title} ${org}`.trim();
  const score = f?.match?.score ?? 0;

  // ⚠️ Cas sensibles : technico = on évite "commerce" générique
  if (config.key === "technico") {
    // signal fort technico / vente B2B / solutions techniques
    if (txt.includes("technico")) return true;
    if (txt.includes("negociateur technico")) return true;
    if (txt.includes("commercialisation de solutions techniques")) return true;
    if (txt.includes("solutions techniques")) return true;

    // si c’est juste "commercial" / "developpement commercial" sans technico => rejet
    const genericCommercial =
      txt.includes("developpement commercial") ||
      txt.includes("responsable du developpement commercial") ||
      txt.includes("conseiller commercial") ||
      txt.includes("charge d affaires") ||
      txt.includes("business developer") ||
      txt.includes("ingenierie d affaires") ||
      txt.includes("marketing");

    if (genericCommercial && !txt.includes("technico")) return false;

    // sinon on garde uniquement si score déjà haut
    return score >= 28;
  }

  // chauffeur : éviter "conduite et gestion de l'entreprise agricole" hors engins
  if (config.key === "chauffeur") {
    const hasMachines =
      txt.includes("tracteur") ||
      txt.includes("machinisme") ||
      txt.includes("machines agricoles") ||
      txt.includes("agroequipement") ||
      txt.includes("agro equipement") ||
      txt.includes("moissonneuse") ||
      txt.includes("ensileuse") ||
      txt.includes("pulverisateur") ||
      txt.includes("pilotage de machines") ||
      txt.includes("conduite d engins");
    if (hasMachines) return true;

    // "conduite et gestion de l'entreprise agricole" = pas chauffeur
    if (txt.includes("conduite et gestion de l entreprise agricole")) return false;
    return score >= 30;
  }

  // silo / responsable silo : anti eau + garder stockage céréales
  if (config.key === "silo" || config.key === "responsable_silo") {
    if (txt.includes("eau") || txt.includes("assainissement") || txt.includes("hydraulique")) return false;
    if (
      txt.includes("silo") ||
      txt.includes("cereales") ||
      txt.includes("grain") ||
      txt.includes("stockage") ||
      txt.includes("collecte") ||
      txt.includes("sechage") ||
      txt.includes("reception") ||
      txt.includes("expedition")
    ) return true;
    return score >= 30;
  }

  // technicien culture : éviter forêt / bûcheronnage / viticulture si hors scope
  if (config.key === "technicien_culture") {
    if (txt.includes("foret") || txt.includes("sylviculture") || txt.includes("bucheronnage")) return false;
    if (txt.includes("viticulture") || txt.includes("oenologie") || txt.includes("vigne")) return false;
    if (
      txt.includes("agronomie") ||
      txt.includes("grandes cultures") ||
      txt.includes("maraichage") ||
      txt.includes("fertilisation") ||
      txt.includes("itineraire technique") ||
      txt.includes("production vegetale")
    ) return true;
    return score >= 26;
  }

  // défaut : on ne garde qu’un minimum de qualité
  return score >= 24;
}

// Choix final LBA : HARD si suffisant, sinon SOFT, sinon top score
const lbaFinal = (() => {
  const minWanted = Math.max(6, Math.floor(targetLocal / 2));
  if (lbaHard.length >= minWanted) return lbaHard;

  const soft = mappedLBA.filter(lbaSoftKeep);
  if (soft.length > 0) return soft;

  return mappedLBA
    .slice()
    .sort((a: any, b: any) => (b?.match?.score ?? 0) - (a?.match?.score ?? 0))
    .slice(0, minWanted);
})();

// MERGE RefEA + LBA filtré
let allFormations = mergeFormationsWithoutDuplicates(refeaResults, lbaFinal);

// ==================================================================================
// 3) PERPLEXITY (complément discipliné) — HARD puis SOFT si vide
// ==================================================================================
let perplexityUsed = false;

if (
  shouldEnrichWithPerplexity(allFormations, {
    min_results: MIN_RESULTS_BEFORE_ENRICH,
    max_distance: MAX_AVG_DISTANCE_BEFORE_ENRICH,
  })
) {
  try {
    const missing = Math.max(0, MIN_RESULTS_BEFORE_ENRICH - allFormations.length);
    const perplexityInput: PerplexityFormationInput = {
      metierLabel: config.label,
      villeRef,
      lat: userLat,
      lon: userLon,
      limit: Math.max(3, Math.min(PPLX_MAX, missing || 5)),
    };

    const pplxRaw = await fetchPerplexityFormations(perplexityInput);
    const hardCap = getPerplexityHardCap(config);

    const pplxSafe = (pplxRaw || [])
      .filter((f: any) => f && typeof f?.distance_km === "number")
      .filter((f: any) => f.distance_km >= 0 && f.distance_km <= hardCap)
      .slice(0, PPLX_MAX)
      .map((f: any) => ({
        ...f,
        alternance: "Non renseigné",
        modalite: "Non renseigné",
        rncp: "Non renseigné",
        match: {
          score: PERPLEXITY_SCORE,
          reasons: Array.isArray(f?.match?.reasons) && f.match.reasons.length
            ? f.match.reasons.slice(0, MAX_WHY_REASONS)
            : ["Formation complémentaire vérifiée", "Correspond au métier recherché"].slice(0, MAX_WHY_REASONS),
        },
        _source: "perplexity",
      }));

    const pplxHard = pplxSafe.filter((f: any) =>
      shouldKeepByHardRules(config.key, f?.intitule ?? "", f?.organisme ?? "")
    );

    const pplxFinal = (() => {
      if (pplxHard.length > 0) return pplxHard;
      const soft = pplxSafe.filter(lbaSoftKeep); // même soft que LBA => cohérence
      return soft.length > 0 ? soft : [];
    })();

    if (pplxFinal.length > 0) {
      perplexityUsed = true;
      allFormations = mergeFormationsWithoutDuplicates(allFormations, pplxFinal);
    }
  } catch (error) {
    console.error("Perplexity enrichment failed:", error);
  }
}

// ==================================================================================
// 4) FILTRE NIVEAU + TRI FINAL + CAP GLOBAL
// ==================================================================================
const count_total_avant_filtre = allFormations.length;

let results = allFormations;

if (niveauFiltre !== "all") {
  results = results.filter((r: any) => r.niveau === niveauFiltre);
}

// Tri : score desc, distance asc
results.sort((a: any, b: any) => {
  const sa = a?.match?.score ?? 0;
  const sb = b?.match?.score ?? 0;
  if (sb !== sa) return sb - sa;

  const da = typeof a.distance_km === "number" ? a.distance_km : 9999;
  const db = typeof b.distance_km === "number" ? b.distance_km : 9999;
  return da - db;
});

// Cap final
if (results.length > cap) results = results.slice(0, cap);

// Warning distance
const soft = config.soft_distance_cap_km ?? (config.radius_km + 150);
const maxDist = results.reduce((m: number, r: any) => {
  const d = typeof r?.distance_km === "number" ? r.distance_km : 999;
  return Math.max(m, d);
}, 0);

return new Response(
  JSON.stringify({
    metier_detecte: config.label,
    ville_reference: villeRef,
    rayon_applique: `${appliedRadius} km${expanded ? " (élargi automatiquement)" : ""}`,
    niveau_filtre: niveauFiltre,
    mode,
    count_total: count_total_avant_filtre,
    count: results.length,
    formations: results,
    warnings: {
      far_results: maxDist > soft,
      geocode_score: geo.geoScore,
      geocode_type: geo.geoTypeTried,
      no_relevant_results: results.length === 0,
      absolute_min_score: ABSOLUTE_MIN_SCORE,
    },
    debug: DEBUG
      ? {
          jobKey,
          ...debug,
          strict_count: strictKept.length,
          perplexity_enrichment_used: perplexityUsed,
          hard_filter_enabled: true,
          caps: { cap, REFEA_MAX, LBA_MAX, PPLX_MAX },
          lba_counts: { mapped: mappedLBA.length, hard: lbaHard.length, final: lbaFinal.length },
        }
      : undefined,
  }),
  { headers: { ...corsHeaders, "Content-Type": "application/json" } },
);
  }
});
