import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * OCAPIAT - Search Formations (LBA)
 * Objectif : résultats pertinents et "humains" pour une utilisation au téléphone.
 * Stratégie : exclusions dures + scoring + rayon adaptatif + niveau normalisé.
 *
 * V1 FIXES (anti-0 result):
 * - Mode fallback "relaxed" si strict retourne 0
 * - Pénalité "ROME seul" moins agressive
 * - Keywords métiers élargis (chauffeur / responsable silo)
 * - Debug fields pour valider tes tests rapidement
 */

// ==================================================================================
// 0) CORS
// ==================================================================================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ==================================================================================
// 1) TYPES & CONFIG
// ==================================================================================

type NiveauFiltre = "3" | "4" | "5" | "6" | "all";
type Mode = "strict" | "relaxed";

interface JobProfile {
  label: string;
  romes: string[];

  radius_km: number;

  strong_keywords: string[];
  synonyms: string[];
  weak_keywords: string[];

  banned_keywords: string[];
  banned_phrases: string[];

  min_score: number;
  target_min_results: number;
  max_extra_radius_km: number;

  // ✅ nouveau : seuil minimal en mode "relaxed"
  relaxed_min_score?: number;

  // ✅ nouveau : taille max de réponse (utile pour éviter 200 résultats bruts)
  max_results?: number;
}

// Exclusions globales : uniquement les domaines clairement hors sujet
const BANNED_GLOBAL_RAW = [
  // sûreté / sécurité privée
  "surete",
  "systemes de surete",
  "agent de securite",
  "securite incendie",

  // bâtiment
  "batiment",
  "macon",
  "maconnerie",
  "menuiserie",
  "plomberie",
  "electricien",
  "peintre",

  // IT
  "informatique",
  "reseau",
  "developpeur",
  "cybersecurite",
  "administrateur systeme",
  "web",
  "logiciel",

  // banque/assurance/immobilier
  "banque",
  "assurance",
  "immobilier",
  "credit",

  // hôtellerie/restauration
  "cuisine",
  "restauration",
  "hotellerie",
  "cuisinier",
  "serveur",
  "barman",

  // santé
  "infirmier",
  "aide soignant",
  "medical",

  // juridique
  "avocat",
  "notaire",
];

const JOB_CONFIG: Record<string, JobProfile> = {
  silo: {
    label: "Agent de Silo",
    romes: ["A1416", "A1101"],
    radius_km: 70,
    strong_keywords: [
      "silo",
      "grain",
      "grains",
      "cereales",
      "collecte",
      "stockage",
      "manutention",
      "sechage",
      "tri",
      "reception",
      "expedition",
      "cooperative",
      "negoce",
      "elevateur", // ✅ utile
    ],
    synonyms: ["stockage agricole", "collecte cereales", "silo agricole", "cerealiers"],
    weak_keywords: ["agricole", "logistique", "magasin", "cariste", "entrepot"],
    banned_keywords: ["ciment", "beton"],
    banned_phrases: ["silo a ciment", "silo beton", "systemes de surete", "surete", "securite incendie"],
    min_score: 35,
    relaxed_min_score: 22,
    target_min_results: 8,
    max_extra_radius_km: 180,
    max_results: 60,
  },

  chauffeur: {
    label: "Chauffeur Agricole",
    romes: ["A1101", "N4101"],
    radius_km: 120,
    // ✅ élargi : LBA remonte souvent des titres "transport / conduite" génériques
    strong_keywords: [
      "tracteur",
      "benne",
      "remorque",
      "moissonneuse",
      "ensileuse",
      "engin",
      "engins",
      "materiel agricole",
      "machinisme",
      "cereales",
      "recolte",
      "conduite",
      "chauffeur",
      "transport",
      "poids lourd",
      "pl",
      "permis",
      "permis c",
      "permis ce",
      "caces",
    ],
    synonyms: [
      "conducteur tracteur",
      "conduite d engins agricoles",
      "chauffeur livreur", // ✅ pas parfait, mais utile en fallback
      "transport routier",
    ],
    weak_keywords: ["logistique", "livraison", "route", "securite", "manutention"],
    banned_keywords: ["bus", "taxi", "ambulance", "vtc", "tourisme", "voyageurs"],
    banned_phrases: ["transport de personnes", "chauffeur de bus"],
    min_score: 32,
    relaxed_min_score: 20,
    target_min_results: 10,
    max_extra_radius_km: 250,
    max_results: 60,
  },

  responsable_silo: {
    label: "Responsable de Silo",
    romes: ["A1301", "A1303"],
    radius_km: 180,
    // ✅ élargi : un responsable silo peut apparaître sous "exploitation / gestion / logistique"
    strong_keywords: [
      "silo",
      "stockage",
      "collecte",
      "cereales",
      "cooperative",
      "negoce",
      "qualite",
      "reception",
      "expedition",
      "sechage",
      "tri",
      "exploitation",
      "gestion",
      "responsable",
      "chef",
      "planning",
      "stocks",
      "entrepot",
    ],
    synonyms: ["chef de silo", "responsable stockage", "gestionnaire silo", "responsable exploitation"],
    weak_keywords: ["management", "pilotage", "logistique", "supply chain", "securite"],
    banned_keywords: [],
    banned_phrases: ["systemes de surete", "surete", "securite incendie"],
    min_score: 34,
    relaxed_min_score: 22,
    target_min_results: 6,
    max_extra_radius_km: 300,
    max_results: 50,
  },

  maintenance: {
    label: "Responsable services techniques",
    romes: ["I1102"],
    radius_km: 120,
    strong_keywords: [
      "maintenance",
      "electromecanique",
      "mecanique",
      "hydraulique",
      "pneumatique",
      "automatismes",
      "installation",
      "equipement",
      "diagnostic",
      "depannage",
      "preventive",
      "curative",
    ],
    synonyms: ["responsable maintenance", "chef maintenance", "technicien maintenance"],
    weak_keywords: ["industrie", "production", "site", "atelier"],
    banned_keywords: ["maintenance informatique", "reseau", "aeronautique", "avion"],
    banned_phrases: [],
    min_score: 32,
    relaxed_min_score: 22,
    target_min_results: 8,
    max_extra_radius_km: 220,
    max_results: 60,
  },

  technico: {
    label: "Technico-commercial",
    romes: ["D1407", "D1402"],
    radius_km: 120,
    strong_keywords: [
      "semences",
      "intrants",
      "engrais",
      "phytosanitaire",
      "nutrition animale",
      "agrofourniture",
      "cooperative",
      "negoce agricole",
      "conseil agricole",
      "agricole",
    ],
    synonyms: ["commercial agricole", "conseiller agricole", "technico commercial agricole"],
    weak_keywords: ["commercial", "vente", "negociation", "relation client"],
    banned_keywords: ["immobilier", "assurance", "banque", "cosmetique", "mode", "textile"],
    banned_phrases: [],
    min_score: 32,
    relaxed_min_score: 22,
    target_min_results: 10,
    max_extra_radius_km: 250,
    max_results: 60,
  },

  responsable_logistique: {
    label: "Responsable logistique",
    romes: ["N1301", "N1302"],
    radius_km: 120,
    strong_keywords: [
      "logistique",
      "entrepot",
      "supply chain",
      "flux",
      "stocks",
      "stock",
      "transport",
      "planning",
      "expedition",
      "reception",
      "approvisionnement",
      "gestion des stocks",
      "wms",
    ],
    synonyms: ["responsable entrepot", "chef de quai", "gestionnaire logistique"],
    weak_keywords: ["management", "organisation", "pilotage"],
    banned_keywords: ["transport de personnes", "voyageurs"],
    banned_phrases: ["chauffeur de bus", "transport urbain"],
    min_score: 28,
    relaxed_min_score: 18,
    target_min_results: 10,
    max_extra_radius_km: 250,
    max_results: 80,
  },

  magasinier_cariste: {
    label: "Magasinier / cariste",
    romes: ["N1101", "N1303"],
    radius_km: 80,
    strong_keywords: [
      "cariste",
      "caces",
      "chariot",
      "chariot elevateur",
      "magasinier",
      "preparation de commandes",
      "picking",
      "manutention",
      "stock",
      "entrepot",
      "logistique",
      "quai",
    ],
    synonyms: ["agent magasinier", "operateur logistique", "preparateur de commandes"],
    weak_keywords: ["magasin", "distribution"],
    banned_keywords: ["grue", "btp", "chantier"],
    banned_phrases: [],
    min_score: 26,
    relaxed_min_score: 16,
    target_min_results: 12,
    max_extra_radius_km: 180,
    max_results: 120,
  },

  controleur_qualite: {
    label: "Contrôleur qualité",
    romes: ["H1502", "H1506", "H1503"],
    radius_km: 120,
    strong_keywords: [
      "controle qualite",
      "qualite",
      "conformite",
      "inspection",
      "haccp",
      "tracabilite",
      "laboratoire",
      "analyse",
      "prelevement",
      "normes",
      "audit",
      "plan de controle",
      // ✅ agro
      "agroalimentaire",
      "alimentaire",
    ],
    synonyms: ["assistant qualite", "technicien qualite", "agent qualite"],
    weak_keywords: ["industrie", "production"],
    // ✅ on évite que ça parte sur pharma/cosméto si on veut rester OCAPIAT
    banned_keywords: ["automobile", "aeronautique", "pharmaceutique", "cosmetique"],
    banned_phrases: [],
    min_score: 28,
    relaxed_min_score: 18,
    target_min_results: 10,
    max_extra_radius_km: 250,
    max_results: 80,
  },

  agreeur: {
    label: "Agréeur",
    romes: ["H1503", "N1303"],
    radius_km: 150,
    strong_keywords: [
      "agreeur",
      "fruits",
      "legumes",
      "produits frais",
      "controle qualite",
      "reception",
      "tri",
      "calibrage",
      "conformite",
      "lots",
      "tracabilite",
      // ✅ agro
      "agroalimentaire",
      "alimentaire",
      "frais",
    ],
    synonyms: ["agreeur fruits et legumes", "controle reception", "qualite alimentaire"],
    weak_keywords: ["qualite", "logistique", "entrepot"],
    // ✅ évite les dérives type chimie/pharma
    banned_keywords: ["assurance", "immobilier", "pharmaceutique", "cosmetique", "chimie", "biotech"],
    banned_phrases: [],
    min_score: 26,
    relaxed_min_score: 18,
    target_min_results: 8,
    max_extra_radius_km: 300,
    max_results: 60,
  },

  conducteur_ligne: {
    label: "Conducteur de ligne",
    romes: ["H2102"],
    radius_km: 120,
    strong_keywords: [
      "conducteur de ligne",
      "conduite de ligne",
      "ligne",
      "production",
      "conditionnement",
      "fabrication",
      "process",
      "machine",
      "reglage",
      "demarrage",
      "arret",
      "hygiene",
      "agroalimentaire",
      "alimentaire",
    ],
    synonyms: ["operateur de production", "pilote de ligne", "conducteur d installation"],
    weak_keywords: ["industrie", "usine"],
    banned_keywords: ["imprimerie", "textile"],
    banned_phrases: [],
    min_score: 28,
    relaxed_min_score: 18,
    target_min_results: 10,
    max_extra_radius_km: 250,
    max_results: 80,
  },

  technicien_culture: {
    label: "Technicien culture",
    romes: ["A1301"],
    radius_km: 180,
    strong_keywords: [
      "technicien",
      "culture",
      "maraichage",
      "grandes cultures",
      "itineraire technique",
      "agronomie",
      "sol",
      "irrigation",
      "fertilisation",
      "phyto",
      "diagnostic",
      "conseil",
      "suivi de parcelles",
      "agricole",
    ],
    synonyms: ["technicien agricole", "technicien cultural", "conseiller technique"],
    weak_keywords: ["environnement", "terrain"],
    banned_keywords: ["informatique", "reseau"],
    banned_phrases: [],
    min_score: 26,
    relaxed_min_score: 18,
    target_min_results: 6,
    max_extra_radius_km: 350,
    max_results: 60,
  },

  commercial_export: {
    label: "Commercial export",
    romes: ["D1402"],
    radius_km: 200,
    strong_keywords: [
      "export",
      "international",
      "import export",
      "douane",
      "incoterms",
      "negociation",
      "relation clients",
      "zone export",
      "anglais",
      "commerce international",
    ],
    synonyms: ["assistant import export", "responsable export", "charge d affaires export"],
    weak_keywords: ["commercial", "vente", "grands comptes"],
    banned_keywords: ["immobilier", "assurance", "banque"],
    banned_phrases: [],
    min_score: 26,
    relaxed_min_score: 18,
    target_min_results: 8,
    max_extra_radius_km: 450,
    max_results: 60,
  },

  default: {
    label: "Recherche Générale",
    romes: ["A1416"],
    radius_km: 80,
    strong_keywords: [],
    synonyms: [],
    weak_keywords: [],
    banned_keywords: [],
    banned_phrases: [],
    min_score: 18,
    relaxed_min_score: 12,
    target_min_results: 8,
    max_extra_radius_km: 200,
    max_results: 80,
  },
};

// ==================================================================================
// 2) OUTILS TEXTE & DISTANCE
// ==================================================================================

const DEBUG = false;

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
  const w = cleanText(word);
  if (!w || w.length < 3) return false;
  const re = new RegExp(`\\b${escapeRegExp(w)}\\b`, "i");
  return re.test(text);
}

function includesPhrase(text: string, phrase: string): boolean {
  const p = cleanText(phrase);
  if (!p) return false;
  return text.includes(p);
}

// ✅ Haversine correcte
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
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

  if (includesWord(t, "cap")) return "3";
  if (includesPhrase(t, "bep")) return "3";
  if (includesPhrase(t, "brevet professionnel") || includesPhrase(t, "bp ")) return "4";
  if (includesPhrase(t, "bac pro") || includesPhrase(t, "baccalaureat professionnel")) return "4";
  if (includesWord(t, "bts") || includesWord(t, "btsa")) return "5";
  if (includesWord(t, "but") || includesWord(t, "dut") || includesWord(t, "licence")) return "6";

  return "N/A";
}

// ==================================================================================
// 3) SCORING
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
};

const BANNED_GLOBAL = BANNED_GLOBAL_RAW.map(cleanText).filter(Boolean);

function isGloballyBanned(fullText: string): string | null {
  for (const b of BANNED_GLOBAL) {
    if (includesWord(fullText, b) || includesPhrase(fullText, b)) return b;
  }
  return null;
}

function scoreFormation(raw: any, config: JobProfile, userLat: number, userLon: number): ScoredFormation | null {
  const title = raw?.title || "";
  const companyName = raw?.company?.name || "Organisme inconnu";
  const city = raw?.place?.city ?? null;

  const lat = typeof raw?.place?.latitude === "number" ? raw.place.latitude : null;
  const lon = typeof raw?.place?.longitude === "number" ? raw.place.longitude : null;

  const fullText = cleanText(`${title} ${companyName}`);

  // Exclusions globales
  const globalBan = isGloballyBanned(fullText);
  if (globalBan) return null;

  // Exclusions métier
  for (const p of config.banned_phrases.map(cleanText).filter(Boolean)) {
    if (includesPhrase(fullText, p)) return null;
  }
  for (const b of config.banned_keywords.map(cleanText).filter(Boolean)) {
    if (includesPhrase(fullText, b) || includesWord(fullText, b)) return null;
  }

  // Distance
  let dist: number | null = null;
  if (lat !== null && lon !== null) dist = haversineKm(userLat, userLon, lat, lon);

  let score = 0;
  const reasons: string[] = [];

  // ROME match
  const hasRome = Array.isArray(raw?.romes)
    ? raw.romes.some((r: any) => config.romes.includes(r?.code))
    : false;

  if (hasRome) {
    score += 22;
    reasons.push("ROME compatible");
  }

  const strong = config.strong_keywords.map(cleanText).filter(Boolean);
  const synonyms = config.synonyms.map(cleanText).filter(Boolean);
  const weak = config.weak_keywords.map(cleanText).filter(Boolean);

  let strongHits = 0;
  for (const kw of strong) if (includesPhrase(fullText, kw) || includesWord(fullText, kw)) strongHits++;
  if (strongHits > 0) {
    score += Math.min(45, strongHits * 10);
    reasons.push(`${strongHits} mot(s) clé(s) métier`);
  }

  let synHits = 0;
  for (const kw of synonyms) if (includesPhrase(fullText, kw) || includesWord(fullText, kw)) synHits++;
  if (synHits > 0) {
    score += Math.min(22, synHits * 8);
    reasons.push("synonyme(s) métier");
  }

  let weakHits = 0;
  for (const kw of weak) if (includesPhrase(fullText, kw) || includesWord(fullText, kw)) weakHits++;
  if (weakHits > 0) score += Math.min(12, weakHits * 3);

  // ✅ Pénalité ROME seul : moins violente (sinon tu tues tout)
  if (hasRome && strongHits === 0 && synHits === 0) {
    score -= 10;
    reasons.push("ROME seul (prudence)");
  }

  // Bonus proximité / pénalité élargissement
  if (dist !== null) {
    if (dist <= 10) score += 8;
    else if (dist <= 25) score += 5;
    else if (dist <= 50) score += 2;

    if (dist > config.radius_km) {
      score -= 6;
      reasons.push("hors rayon initial (élargissement)");
    }
  } else {
    score -= 8;
    reasons.push("non géolocalisé");
  }

  return {
    id: raw?.id || crypto.randomUUID(),
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
  };
}

// ==================================================================================
// 4) LBA FETCH + RAYON ADAPTATIF
// ==================================================================================

async function fetchLBA(romes: string[], lat: number, lon: number, radiusKm: number) {
  const url =
    `https://labonnealternance.apprentissage.beta.gouv.fr/api/v1/formations` +
    `?romes=${encodeURIComponent(romes.join(","))}` +
    `&latitude=${lat}&longitude=${lon}` +
    `&radius=${radiusKm}` +
    `&caller=ocapiat_app`;

  const res = await fetch(url);
  if (!res.ok) return { results: [], raw_count: 0 };
  const data = await res.json().catch(() => null);
  const results = Array.isArray(data?.results) ? data.results : [];
  return { results, raw_count: results.length };
}

function dedupKey(s: ScoredFormation): string {
  return `${cleanText(s.title)}|${cleanText(s.companyName)}|${cleanText(s.city || "")}`;
}

function sortByScoreThenDistance(a: ScoredFormation, b: ScoredFormation) {
  if (b.score !== a.score) return b.score - a.score;
  const da = a.distanceKm ?? 9999;
  const db = b.distanceKm ?? 9999;
  return da - db;
}

async function getScoredResultsAdaptive(
  config: JobProfile,
  userLat: number,
  userLon: number
): Promise<{
  scored: ScoredFormation[];
  appliedRadius: number;
  expanded: boolean;
  debug: { raw_count_last: number; scored_count_last: number; kept_count_strict_last: number };
}> {
  const baseRadius = config.radius_km;
  const steps = [0, 30, 60, 100, 150, 200, 300].filter((s) => s <= config.max_extra_radius_km);

  let finalScored: ScoredFormation[] = [];
  let appliedRadius = baseRadius;
  let expanded = false;

  let raw_count_last = 0;
  let scored_count_last = 0;
  let kept_count_strict_last = 0;

  for (const extra of steps) {
    appliedRadius = baseRadius + extra;
    expanded = extra > 0;

    const { results: raw, raw_count } = await fetchLBA(config.romes, userLat, userLon, appliedRadius);
    raw_count_last = raw_count;

    const scored = raw
      .map((r: any) => scoreFormation(r, config, userLat, userLon))
      .filter(Boolean) as ScoredFormation[];

    scored_count_last = scored.length;

    const keptStrict = scored.filter((s) => s.score >= config.min_score);
    kept_count_strict_last = keptStrict.length;

    // Dedup
    const seen = new Set<string>();
    const dedup = keptStrict.filter((s) => {
      const key = dedupKey(s);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    dedup.sort(sortByScoreThenDistance);
    finalScored = dedup;

    if (DEBUG) console.log("radius", appliedRadius, "raw", raw_count, "scored", scored.length, "keptStrict", finalScored.length);

    if (finalScored.length >= config.target_min_results) break;
  }

  return {
    scored: finalScored,
    appliedRadius,
    expanded,
    debug: { raw_count_last, scored_count_last, kept_count_strict_last },
  };
}

// ==================================================================================
// 5) METIER DETECTION (alignement UI ↔ backend)
// ==================================================================================

const METIER_KEY_ALIASES: Record<string, string> = {
  logistique: "responsable_logistique",
  magasinier: "magasinier_cariste",
  services_tech: "maintenance",
  qualite: "controleur_qualite",

  responsable_logistique: "responsable_logistique",
  magasinier_cariste: "magasinier_cariste",
  controleur_qualite: "controleur_qualite",
  maintenance: "maintenance",
};

function detectJobKey(inputMetier: any): string {
  const raw = (inputMetier ?? "").toString().trim();
  const cleaned = cleanText(raw);

  if (METIER_KEY_ALIASES[raw]) return METIER_KEY_ALIASES[raw];
  if (METIER_KEY_ALIASES[cleaned]) return METIER_KEY_ALIASES[cleaned];

  if (JOB_CONFIG[raw]) return raw;
  if (JOB_CONFIG[cleaned]) return cleaned;

  // fallback fuzzy
  if (cleaned.includes("responsable") && cleaned.includes("silo")) return "responsable_silo";
  if (cleaned.includes("agent") && cleaned.includes("silo")) return "silo";
  if (cleaned.includes("silo")) return "silo";

  if (cleaned.includes("chauffeur") || cleaned.includes("conduite")) return "chauffeur";

  if (cleaned.includes("commercial") && cleaned.includes("export")) return "commercial_export";
  if (cleaned.includes("export")) return "commercial_export";
  if (cleaned.includes("technico")) return "technico";
  if (cleaned.includes("commercial")) return "technico";

  if (cleaned.includes("logistique")) return "responsable_logistique";
  if (cleaned.includes("magasinier") || cleaned.includes("cariste")) return "magasinier_cariste";

  if (cleaned.includes("qualite") && (cleaned.includes("controle") || cleaned.includes("controleur"))) return "controleur_qualite";
  if (cleaned.includes("agreeur")) return "agreeur";

  if (cleaned.includes("conducteur") && cleaned.includes("ligne")) return "conducteur_ligne";
  if (cleaned.includes("ligne") && cleaned.includes("production")) return "conducteur_ligne";

  if (cleaned.includes("technicien") && cleaned.includes("culture")) return "technicien_culture";
  if (cleaned.includes("culture") || cleaned.includes("agronomie")) return "technicien_culture";

  if (cleaned.includes("services") && cleaned.includes("tech")) return "maintenance";
  if (cleaned.includes("maintenance")) return "maintenance";

  return "default";
}

// ==================================================================================
// 6) POST-PROCESS (STRICT -> RELAXED anti-0)
// ==================================================================================

function pickFinalFormations(
  scoredStrict: ScoredFormation[],
  allScoredCandidates: ScoredFormation[],
  config: JobProfile
): { mode: Mode; picked: ScoredFormation[] } {
  if (scoredStrict.length > 0) {
    return { mode: "strict", picked: scoredStrict };
  }

  // ✅ Mode relaxed : on garde quelque chose de "proche" plutôt que 0
  const relaxedMin = config.relaxed_min_score ?? Math.max(12, config.min_score - 10);

  const relaxed = allScoredCandidates
    .filter((s) => s.score >= relaxedMin)
    .sort(sortByScoreThenDistance);

  const cap = config.max_results ?? 60;

  // si même ça ne donne rien (rare), on prend juste les meilleurs scores bruts
  if (relaxed.length === 0) {
    const best = [...allScoredCandidates].sort(sortByScoreThenDistance).slice(0, Math.min(25, cap));
    return { mode: "relaxed", picked: best };
  }

  return { mode: "relaxed", picked: relaxed.slice(0, cap) };
}

// ==================================================================================
// 7) HANDLER
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
    const config = JOB_CONFIG[jobKey] || JOB_CONFIG.default;

    // Geocoding (municipality)
    const geoRep = await fetch(
      `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(ville)}&limit=1&type=municipality`
    );
    const geoData = await geoRep.json().catch(() => null);
    if (!geoData?.features?.length) throw new Error("Ville inconnue");

    const [userLon, userLat] = geoData.features[0].geometry.coordinates;
    const villeRef = geoData.features[0].properties.label;

    // 1) Mode strict adaptatif (ton moteur actuel)
    const { scored: strictKept, appliedRadius, expanded, debug } = await getScoredResultsAdaptive(config, userLat, userLon);

    // 2) IMPORTANT : pour le relaxed, il faut des candidats.
    // Ici on reconstruit des candidats "bruts" à partir du dernier rayon (appliedRadius),
    // pour éviter de renvoyer 0.
    const { results: rawLast } = await fetchLBA(config.romes, userLat, userLon, appliedRadius);

    const allCandidates = rawLast
      .map((r: any) => scoreFormation(r, config, userLat, userLon))
      .filter(Boolean) as ScoredFormation[];

    // Dedup candidats
    const seen = new Set<string>();
    const dedupCandidates = allCandidates.filter((s) => {
      const key = dedupKey(s);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 3) strict -> relaxed si besoin
    const { mode, picked } = pickFinalFormations(strictKept, dedupCandidates, config);

    // 4) Map -> results frontend
    const niveauFiltre = normalizeNiveauFilter(niveau);

    let results = picked.map((s) => {
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

        // placeholders (étape 2 on rendra ça clean côté types/UI)
        rncp: "Non renseigné",
        modalite: "Non renseigné",
        alternance: "Non",
        categorie: "Diplôme / Titre",

        site_web: s.url,
        url: s.url,

        niveau: computedNiveau,
        match: { score: s.score, reasons: s.reasons.slice(0, 3) },
      };
    });

    // Filtre niveau
    if (niveauFiltre !== "all") {
      results = results.filter((r: any) => r.niveau === niveauFiltre);
    }

    // Tri final : score desc puis distance
    results.sort((a: any, b: any) => {
      const sa = a?.match?.score ?? 0;
      const sb = b?.match?.score ?? 0;
      if (sb !== sa) return sb - sa;

      const da = typeof a.distance_km === "number" ? a.distance_km : 9999;
      const db = typeof b.distance_km === "number" ? b.distance_km : 9999;
      return da - db;
    });

    return new Response(
      JSON.stringify({
        metier_detecte: config.label,
        ville_reference: villeRef,
        rayon_applique: `${appliedRadius} km${expanded ? " (élargi automatiquement)" : ""}`,
        niveau_filtre: niveauFiltre,
        mode,
        count: results.length,
        formations: results,

        // ✅ debug (tu peux l’afficher en console ou le cacher plus tard)
        debug: {
          jobKey,
          raw_count_last: debug.raw_count_last,
          scored_count_last: debug.scored_count_last,
          kept_count_strict_last: debug.kept_count_strict_last,
          candidates_last_radius: dedupCandidates.length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || "Erreur inconnue" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
