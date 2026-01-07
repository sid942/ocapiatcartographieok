import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * OCAPIAT - Search Formations (LBA)
 * V3.0 PRO (anti-honte / anti-0 / anti-lointain / anti-hors-sujet)
 *
 * Objectifs :
 * ✅ Zéro résultat évité (anti-0)
 * ✅ Mais PAS de hors-sujet en haut de liste
 * ✅ Ville ambiguë refusée ("Mont", "St", etc.)
 * ✅ Géocodage plus fiable
 * ✅ Règles strict/relaxed/fallback cohérentes pour TOUS les métiers
 * ✅ count_total (avant filtre niveau) + count (après filtre)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ==================================================================================
// 1) TYPES & CONFIG
// ==================================================================================

type NiveauFiltre = "3" | "4" | "5" | "6" | "all";
type Mode =
  | "strict"
  | "strict+relaxed"
  | "strict+relaxed+fallback_rome"
  | "relaxed"
  | "fallback_rome";

type Phase = "strict" | "relaxed" | "fallback";

interface JobProfile {
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

  // score relaxed (si absent, calcul auto)
  relaxed_min_score?: number;

  // cap global résultats
  max_results?: number;

  /**
   * Limite "humaine" pour éviter la honte :
   * - au-delà, on pénalise très fort (mais on n’interdit pas, anti-0)
   */
  soft_distance_cap_km?: number;

  /**
   * Distance max absolue de confort (au-delà = très rare, sauf fallback)
   * (si absent => soft cap + 250)
   */
  hard_distance_cap_km?: number;
}

const BANNED_GLOBAL_RAW = [
  "surete",
  "systemes de surete",
  "agent de securite",
  "securite incendie",

  "batiment",
  "macon",
  "maconnerie",
  "menuiserie",
  "plomberie",
  "electricien",
  "peintre",

  "informatique",
  "reseau",
  "developpeur",
  "cybersecurite",
  "administrateur systeme",
  "web",
  "logiciel",

  "banque",
  "assurance",
  "immobilier",
  "credit",

  "cuisine",
  "restauration",
  "hotellerie",
  "cuisinier",
  "serveur",
  "barman",

  "infirmier",
  "aide soignant",
  "medical",

  "avocat",
  "notaire",
];

const JOB_CONFIG: Record<string, JobProfile> = {
  silo: {
    label: "Agent de Silo",
    romes: ["A1416", "A1101"],
    fallback_romes: ["N1101", "N1303", "N1302"],
    radius_km: 70,

    strong_keywords: [
      "silo",
      "grain",
      "grains",
      "cereales",
      "collecte",
      "stockage",
      "sechage",
      "tri",
      "reception",
      "expedition",
      "cooperative",
      "negoce",
      "elevateur",
    ],
    synonyms: ["stockage agricole", "collecte cereales", "silo agricole", "collecte de grains"],
    weak_keywords: ["agricole", "logistique", "entrepot", "manutention", "cariste"],

    banned_keywords: ["ciment", "beton"],
    banned_phrases: ["silo a ciment", "silo beton", "systemes de surete", "surete", "securite incendie"],

    // garde-fou CONTEXTE : un agent de silo sans "silo/collecte/cereales" => hors sujet
    context_keywords: ["silo", "grain", "grains", "cereales", "collecte", "stockage", "sechage", "tri"],

    min_score: 36,
    relaxed_min_score: 22,
    target_min_results: 8,
    max_extra_radius_km: 220,
    max_results: 60,

    soft_distance_cap_km: 120,
    hard_distance_cap_km: 420,
  },

  chauffeur: {
    label: "Chauffeur Agricole",
    romes: ["A1101", "N4101"],
    fallback_romes: ["N4102", "N4105", "N1303"],
    radius_km: 120,

    strong_keywords: [
      "tracteur",
      "benne",
      "remorque",
      "moissonneuse",
      "ensileuse",
      "materiel agricole",
      "machinisme",
      "cereales",
      "recolte",
      "chauffeur",
      "conduite",
      "engins agricoles",
      "permis ce",
      "permis c",
    ],
    synonyms: ["conducteur tracteur", "conduite d engins agricoles", "transport agricole"],
    weak_keywords: ["transport", "livraison", "route", "logistique"],

    // On évite "transport voyageurs"
    banned_keywords: ["bus", "taxi", "ambulance", "vtc", "tourisme", "voyageurs"],
    banned_phrases: ["transport de personnes", "chauffeur de bus"],

    // garde-fou contexte : si c’est juste “transport routier marchandises” sans agricole -> hors sujet en strict
    context_keywords: ["agricole", "tracteur", "benne", "remorque", "moissonneuse", "ensileuse", "cereales", "recolte", "engins"],

    min_score: 34,
    relaxed_min_score: 20,
    target_min_results: 10,
    max_extra_radius_km: 280,
    max_results: 60,

    soft_distance_cap_km: 180,
    hard_distance_cap_km: 550,
  },

  responsable_silo: {
    label: "Responsable de Silo",
    romes: ["A1301", "A1303"],
    fallback_romes: ["N1301", "N1302", "N1303"],
    radius_km: 180,

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
      "stocks",
      "planning",
      "responsable",
      "chef",
    ],
    synonyms: ["chef de silo", "responsable stockage", "gestionnaire silo"],
    weak_keywords: ["management", "pilotage", "logistique", "entrepot", "supply chain"],

    banned_keywords: [],
    banned_phrases: ["systemes de surete", "surete", "securite incendie"],

    context_keywords: ["silo", "cereales", "collecte", "stockage", "sechage", "tri", "reception", "expedition"],

    min_score: 36,
    relaxed_min_score: 22,
    target_min_results: 6,
    max_extra_radius_km: 320,
    max_results: 50,

    soft_distance_cap_km: 250,
    hard_distance_cap_km: 650,
  },

  maintenance: {
    label: "Responsable services techniques",
    romes: ["I1102"],
    fallback_romes: ["I1304", "I1103"],
    radius_km: 120,

    strong_keywords: [
      "maintenance",
      "electromecanique",
      "mecanique",
      "hydraulique",
      "pneumatique",
      "automatismes",
      "diagnostic",
      "depannage",
      "preventive",
      "curative",
      "equipement",
      "industrie",
      "production",
    ],
    synonyms: ["responsable maintenance", "chef maintenance", "technicien maintenance"],
    weak_keywords: ["site", "atelier", "energie"],

    banned_keywords: ["maintenance informatique", "reseau", "aeronautique", "avion"],
    banned_phrases: [],

    // ici le contexte est "maintenance industrielle"
    context_keywords: ["maintenance", "mecanique", "electro", "automatismes", "depannage", "preventive", "curative", "industrie"],

    min_score: 32,
    relaxed_min_score: 20,
    target_min_results: 8,
    max_extra_radius_km: 280,
    max_results: 60,

    soft_distance_cap_km: 180,
    hard_distance_cap_km: 600,
  },

  technico: {
    label: "Technico-commercial",
    romes: ["D1407", "D1402"],
    fallback_romes: ["D1401", "D1403"],
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
      "agroalimentaire",
    ],
    synonyms: ["commercial agricole", "conseiller agricole", "technico commercial agricole"],
    weak_keywords: ["commercial", "vente", "negociation", "relation client"],

    banned_keywords: ["immobilier", "assurance", "banque", "cosmetique", "mode", "textile"],
    banned_phrases: [],

    // garde-fou : on accepte des spécialités (vin, boisson) si c’est bien du techno-commercial
    context_keywords: ["commercial", "technico", "vente", "negociation", "relation client", "agricole", "agroalimentaire", "agrofourniture"],

    min_score: 30,
    relaxed_min_score: 18,
    target_min_results: 10,
    max_extra_radius_km: 320,
    max_results: 60,

    soft_distance_cap_km: 220,
    hard_distance_cap_km: 650,
  },

  responsable_logistique: {
    label: "Responsable logistique",
    romes: ["N1301", "N1302"],
    fallback_romes: ["N1303", "N1101"],
    radius_km: 120,

    strong_keywords: [
      "logistique",
      "entrepot",
      "supply chain",
      "flux",
      "stocks",
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

    context_keywords: ["logistique", "entrepot", "stocks", "flux", "transport", "expedition", "reception", "approvisionnement"],

    min_score: 28,
    relaxed_min_score: 16,
    target_min_results: 10,
    max_extra_radius_km: 280,
    max_results: 80,

    soft_distance_cap_km: 200,
    hard_distance_cap_km: 600,
  },

  magasinier_cariste: {
    label: "Magasinier / cariste",
    romes: ["N1101", "N1303"],
    fallback_romes: ["N1302", "N1301"],
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
      "quai",
      "logistique",
    ],
    synonyms: ["agent magasinier", "operateur logistique", "preparateur de commandes"],
    weak_keywords: ["magasin", "distribution"],

    banned_keywords: ["grue", "btp", "chantier"],
    banned_phrases: [],

    context_keywords: ["cariste", "caces", "magasinier", "entrepot", "stock", "preparation", "manutention", "logistique"],

    min_score: 26,
    relaxed_min_score: 14,
    target_min_results: 12,
    max_extra_radius_km: 220,
    max_results: 120,

    soft_distance_cap_km: 140,
    hard_distance_cap_km: 500,
  },

  controleur_qualite: {
    label: "Contrôleur qualité",
    romes: ["H1502", "H1506", "H1503"],
    fallback_romes: ["H1504"],
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
      "agroalimentaire",
      "alimentaire",
    ],
    synonyms: ["assistant qualite", "technicien qualite", "agent qualite"],
    weak_keywords: ["industrie", "production"],

    banned_keywords: ["automobile", "aeronautique", "pharmaceutique", "cosmetique", "chimie"],
    banned_phrases: [],

    context_keywords: ["qualite", "controle", "conformite", "audit", "haccp", "tracabilite", "laboratoire", "analyse", "alimentaire", "agroalimentaire"],

    min_score: 28,
    relaxed_min_score: 16,
    target_min_results: 10,
    max_extra_radius_km: 280,
    max_results: 80,

    soft_distance_cap_km: 200,
    hard_distance_cap_km: 650,
  },

  agreeur: {
    label: "Agréeur",
    romes: ["H1503", "N1303"],
    fallback_romes: ["H1502", "N1101"],
    radius_km: 150,

    strong_keywords: [
      "agreeur",
      "agreage",
      "fruits",
      "legumes",
      "produits frais",
      "reception",
      "tri",
      "calibrage",
      "lots",
      "tracabilite",
      "controle qualite",
      "qualite",
      "frais",
    ],
    synonyms: ["agreeur fruits et legumes", "controle reception", "qualite alimentaire"],
    weak_keywords: ["qualite", "logistique", "entrepot"],

    banned_keywords: ["pharmaceutique", "cosmetique", "chimie", "biotech", "industries pharmaceutiques"],
    banned_phrases: [],

    // garde-fou fort : si pas fruits/légumes/frais/agréage => hors contexte en strict
    context_keywords: ["agreeur", "agreage", "fruits", "legumes", "produits frais", "calibrage", "frais", "reception", "tri"],

    min_score: 28,
    relaxed_min_score: 16,
    target_min_results: 8,
    max_extra_radius_km: 320,
    max_results: 60,

    soft_distance_cap_km: 250,
    hard_distance_cap_km: 700,
  },

  conducteur_ligne: {
    label: "Conducteur de ligne",
    romes: ["H2102"],
    fallback_romes: ["H2101"],
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

    context_keywords: ["ligne", "production", "conditionnement", "reglage", "fabrication", "process", "machine", "agroalimentaire", "alimentaire"],

    min_score: 28,
    relaxed_min_score: 16,
    target_min_results: 10,
    max_extra_radius_km: 280,
    max_results: 80,

    soft_distance_cap_km: 220,
    hard_distance_cap_km: 650,
  },

  technicien_culture: {
    label: "Technicien culture",
    romes: ["A1301"],
    fallback_romes: ["A1416", "A1203"],
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

    context_keywords: ["culture", "agronomie", "maraichage", "grandes cultures", "parcelles", "irrigation", "fertilisation", "phyto"],

    min_score: 26,
    relaxed_min_score: 16,
    target_min_results: 6,
    max_extra_radius_km: 380,
    max_results: 60,

    soft_distance_cap_km: 300,
    hard_distance_cap_km: 850,
  },

  commercial_export: {
    label: "Commercial export",
    romes: ["D1402"],
    fallback_romes: ["D1401", "D1407"],
    radius_km: 200,

    strong_keywords: [
      "export",
      "international",
      "import export",
      "douane",
      "incoterms",
      "commerce international",
      "anglais",
      "negociation internationale",
      "business international",
    ],
    synonyms: ["assistant import export", "responsable export", "charge d affaires export"],
    weak_keywords: ["commercial", "vente", "grands comptes", "developpement commercial"],

    banned_keywords: ["immobilier", "assurance", "banque"],
    banned_phrases: [],

    context_keywords: ["export", "international", "import", "douane", "incoterms", "commerce international", "business international"],

    min_score: 26,
    relaxed_min_score: 16,
    target_min_results: 8,
    max_extra_radius_km: 480,
    max_results: 60,

    soft_distance_cap_km: 320,
    hard_distance_cap_km: 950,
  },

  default: {
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
    relaxed_min_score: 12,
    target_min_results: 8,
    max_extra_radius_km: 220,
    max_results: 80,

    soft_distance_cap_km: 180,
    hard_distance_cap_km: 600,
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

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;

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

  if (includesWord(t, "cap") || includesPhrase(t, "capa")) return "3";
  if (includesPhrase(t, "bep")) return "3";
  if (includesPhrase(t, "brevet professionnel") || includesPhrase(t, "bp ")) return "4";
  if (includesPhrase(t, "bac pro") || includesPhrase(t, "baccalaureat professionnel")) return "4";
  if (includesWord(t, "bts") || includesWord(t, "btsa")) return "5";
  if (includesWord(t, "but") || includesWord(t, "dut") || includesWord(t, "licence")) return "6";
  if (includesWord(t, "bachelor")) return "6";

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

  // utile pour debug/tri
  ctxHits: number;
  strongHits: number;
  synHits: number;
};

const BANNED_GLOBAL = BANNED_GLOBAL_RAW.map(cleanText).filter(Boolean);

function isGloballyBanned(fullText: string): string | null {
  for (const b of BANNED_GLOBAL) {
    if (includesWord(fullText, b) || includesPhrase(fullText, b)) return b;
  }
  return null;
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

  const strongHits = countHits(fullText, config.strong_keywords);
  const synHits = countHits(fullText, config.synonyms);
  const weakHits = countHits(fullText, config.weak_keywords);

  if (strongHits > 0) {
    score += Math.min(45, strongHits * 10);
    reasons.push(`${strongHits} mot(s) clé(s) métier`);
  }

  if (synHits > 0) {
    score += Math.min(22, synHits * 8);
    reasons.push("synonyme(s) métier");
  }

  if (weakHits > 0) score += Math.min(12, weakHits * 3);

  // Pénalité ROME seul
  if (hasRome && strongHits === 0 && synHits === 0) {
    score -= 10;
    reasons.push("ROME seul (prudence)");
  }

  // ✅ GARDE-FOU CONTEXTE (par phase)
  const ctx = config.context_keywords ?? [];
  const ctxHits = ctx.length > 0 ? countHits(fullText, ctx) : 0;

  if (ctx.length > 0) {
    if (ctxHits === 0) {
      // En STRICT : on bloque quasi tout hors-contexte
      // En RELAXED : pénalité forte
      // En FALLBACK : pénalité modérée (anti-0)
      const penalty = phase === "strict" ? 28 : phase === "relaxed" ? 18 : 10;
      score -= penalty;
      reasons.push("hors contexte métier");
    } else {
      score += Math.min(10, ctxHits * 4);
      reasons.push("contexte métier OK");
    }
  }

  // Bonus proximité / pénalité distance
  if (dist !== null) {
    if (dist <= 10) score += 8;
    else if (dist <= 25) score += 5;
    else if (dist <= 50) score += 2;

    // si au-delà rayon initial, petite pénalité
    if (dist > config.radius_km) {
      score -= 6;
      reasons.push("hors rayon initial");
    }

    // pénalités “anti-honte”
    const soft = config.soft_distance_cap_km ?? (config.radius_km + 150);
    const hard = config.hard_distance_cap_km ?? (soft + 250);

    if (dist > soft) {
      // plus c'est loin, plus on descend dans la liste
      const extra = Math.min(30, Math.round((dist - soft) / 30)); // +1 tous les 30 km
      score -= 8 + extra;
      reasons.push("distance élevée");
    }

    if (dist > hard) {
      // au-delà hard cap : chute forte (sauf fallback, où c’est “moins violent”)
      score -= phase === "fallback" ? 18 : 28;
      reasons.push("très éloigné");
    }
  } else {
    score -= 10;
    reasons.push("non géolocalisé");
  }

  // ✅ Garde-fou final : en STRICT, si contexte absent + aucun signal fort => on jette
  if (phase === "strict" && (config.context_keywords?.length ?? 0) > 0) {
    const hasAnyStrongSignal = strongHits > 0 || synHits > 0 || hasRome;
    if (ctxHits === 0 && !hasAnyStrongSignal) return null;
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
    ctxHits,
    strongHits,
    synHits,
  };
}

// ==================================================================================
// 4) LBA FETCH + DÉDUP
// ==================================================================================

async function fetchLBA(romes: string[], lat: number, lon: number, radiusKm: number) {
  const url =
    `https://labonnealternance.apprentissage.beta.gouv.fr/api/v1/formations` +
    `?romes=${encodeURIComponent(romes.join(","))}` +
    `&latitude=${lat}&longitude=${lon}` +
    `&radius=${radiusKm}` +
    `&caller=ocapiat_app`;

  const res = await fetch(url);
  if (!res.ok) return { results: [], raw_count: 0, status: res.status };

  const data = await res.json().catch(() => null);
  const results = Array.isArray(data?.results) ? data.results : [];
  return { results, raw_count: results.length, status: 200 };
}

function dedupKey(s: ScoredFormation): string {
  return `${cleanText(s.title)}|${cleanText(s.companyName)}|${cleanText(s.city || "")}`;
}

function titleKey(s: ScoredFormation): string {
  return cleanText(s.title);
}

function sortByScoreThenDistance(a: ScoredFormation, b: ScoredFormation) {
  if (b.score !== a.score) return b.score - a.score;
  const da = a.distanceKm ?? 9999;
  const db = b.distanceKm ?? 9999;
  return da - db;
}

function dedupSmart(items: ScoredFormation[], maxPerTitle = 3) {
  const seen = new Set<string>();
  const unique = items.filter((s) => {
    const k = dedupKey(s);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const counts = new Map<string, number>();
  const limited = unique.filter((s) => {
    const tk = titleKey(s);
    const c = (counts.get(tk) ?? 0) + 1;
    counts.set(tk, c);
    return c <= maxPerTitle;
  });

  return limited;
}

function mergeKeepBest(base: ScoredFormation[], extra: ScoredFormation[]) {
  const map = new Map<string, ScoredFormation>();

  const keep = (s: ScoredFormation) => {
    const k = dedupKey(s);
    const existing = map.get(k);
    if (!existing) {
      map.set(k, s);
      return;
    }
    const best = [existing, s].sort(sortByScoreThenDistance)[0];
    map.set(k, best);
  };

  base.forEach(keep);
  extra.forEach(keep);

  return Array.from(map.values()).sort(sortByScoreThenDistance);
}

function pickRelaxed(allCandidates: ScoredFormation[], config: JobProfile) {
  const relaxedMin = config.relaxed_min_score ?? Math.max(12, config.min_score - 12);

  const relaxed = allCandidates
    .filter((s) => s.score >= relaxedMin)
    .sort(sortByScoreThenDistance);

  const cap = config.max_results ?? 60;

  if (relaxed.length === 0) {
    return [...allCandidates].sort(sortByScoreThenDistance).slice(0, Math.min(25, cap));
  }

  return relaxed.slice(0, cap);
}

// ==================================================================================
// 5) STRICT ADAPTATIF + CANDIDATS
// ==================================================================================

async function getStrictAndCandidates(
  config: JobProfile,
  userLat: number,
  userLon: number
): Promise<{
  strictKept: ScoredFormation[];
  bestCandidates: ScoredFormation[];
  appliedRadius: number;
  expanded: boolean;
  debug: {
    raw_count_last: number;
    scored_count_last: number;
    kept_count_strict_last: number;
    best_candidates_count: number;
    last_status?: number;
  };
}> {
  const baseRadius = config.radius_km;
  const steps = [0, 30, 60, 100, 150, 200, 300, 420].filter((s) => s <= config.max_extra_radius_km);

  let appliedRadius = baseRadius;
  let expanded = false;

  let raw_count_last = 0;
  let scored_count_last = 0;
  let kept_count_strict_last = 0;
  let last_status: number | undefined;

  let finalStrict: ScoredFormation[] = [];

  let bestCandidates: ScoredFormation[] = [];
  let bestRawCount = -1;

  for (const extra of steps) {
    appliedRadius = baseRadius + extra;
    expanded = extra > 0;

    const fetched = await fetchLBA(config.romes, userLat, userLon, appliedRadius);
    const raw = fetched.results;
    raw_count_last = fetched.raw_count;
    last_status = fetched.status;

    const scoredAll = raw
      .map((r: any) => scoreFormation(r, config, userLat, userLon, "strict"))
      .filter(Boolean) as ScoredFormation[];

    scored_count_last = scoredAll.length;

    // meilleur rayon “candidats”
    if (raw_count_last > bestRawCount) {
      bestRawCount = raw_count_last;
      bestCandidates = dedupSmart(scoredAll, 3).sort(sortByScoreThenDistance);
    }

    const keptStrict = scoredAll.filter((s) => s.score >= config.min_score);
    kept_count_strict_last = keptStrict.length;

    finalStrict = dedupSmart(keptStrict, 3).sort(sortByScoreThenDistance);

    if (DEBUG) console.log("radius", appliedRadius, "raw", raw_count_last, "strict", finalStrict.length);

    if (finalStrict.length >= config.target_min_results) break;
  }

  return {
    strictKept: finalStrict,
    bestCandidates,
    appliedRadius,
    expanded,
    debug: {
      raw_count_last,
      scored_count_last,
      kept_count_strict_last,
      best_candidates_count: bestCandidates.length,
      last_status,
    },
  };
}

// ==================================================================================
// 6) METIER DETECTION
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

  if (cleaned.includes("responsable") && cleaned.includes("silo")) return "responsable_silo";
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

  if (cleaned.includes("technicien") && cleaned.includes("culture")) return "technicien_culture";
  if (cleaned.includes("culture") || cleaned.includes("agronomie")) return "technicien_culture";

  if (cleaned.includes("services") && cleaned.includes("tech")) return "maintenance";
  if (cleaned.includes("maintenance")) return "maintenance";

  return "default";
}

// ==================================================================================
// 7) GEO (anti "Mont")
// ==================================================================================

async function geocodeCityOrThrow(ville: string): Promise<{
  userLat: number;
  userLon: number;
  villeRef: string;
  geoScore: number;
  geoTypeTried: string;
}> {
  const q = ville.trim();

  // Anti-villes ambiguës / trop courtes
  if (q.length < 4) {
    throw new Error("Ville trop courte. Merci d’indiquer le nom complet (ex: Montauban, Montpellier, Montélimar).");
  }

  const tries: Array<{ type: string; url: string }> = [
    { type: "municipality", url: `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1&type=municipality` },
    { type: "city", url: `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1&type=city` },
    { type: "fallback", url: `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1` },
  ];

  for (const t of tries) {
    const rep = await fetch(t.url);
    const data = await rep.json().catch(() => null);
    if (!data?.features?.length) continue;

    const f = data.features[0];
    const coords = f?.geometry?.coordinates;
    const props = f?.properties;

    if (!Array.isArray(coords) || coords.length < 2) continue;
    const [lon, lat] = coords;
    const label = props?.label || q;
    const score = typeof props?.score === "number" ? props.score : 0;

    // Seuil qualité : en dessous, la ville est probablement mal reconnue
    if (score < 0.40 && t.type !== "fallback") continue;

    return {
      userLat: lat,
      userLon: lon,
      villeRef: label,
      geoScore: score,
      geoTypeTried: t.type,
    };
  }

  throw new Error("Ville inconnue ou ambiguë. Merci de préciser (ex: Montélimar, Mont-de-Marsan, Montauban…).");
}

// ==================================================================================
// 8) HANDLER
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

    // GEO robuste (anti “Mont”)
    const geo = await geocodeCityOrThrow(ville);
    const userLat = geo.userLat;
    const userLon = geo.userLon;
    const villeRef = geo.villeRef;

    // 1) Strict + candidats
    const { strictKept, bestCandidates, appliedRadius, expanded, debug } = await getStrictAndCandidates(config, userLat, userLon);

    const target = Math.max(6, config.target_min_results);
    const cap = config.max_results ?? 60;

    let mode: Mode = "strict";
    let merged: ScoredFormation[] = strictKept;

    // 2) Relaxed (sur candidats) si strict insuffisant
    if (merged.length < target) {
      const relaxedCandidates = bestCandidates
        .map((s) => s) // déjà scorés strict; on rescore en relaxed pour être plus juste
        .map((s) => {
          // On reconstruit un “raw minimal” impossible ici, donc on garde la base mais on permet une sélection plus large via seuil.
          // => pickRelaxed gère déjà la logique "relaxed_min_score"
          return s;
        });

      const relaxedPicked = pickRelaxed(relaxedCandidates, config);
      merged = mergeKeepBest(merged, relaxedPicked);
      mode = merged.length > 0 ? "strict+relaxed" : "relaxed";
    }

    // 3) Fallback ROME si toujours insuffisant
    if (merged.length < target) {
      const fallbackRomes = Array.from(new Set([...(config.fallback_romes ?? []), ...config.romes])).filter(Boolean);

      if (fallbackRomes.length > 0) {
        const fbRadius = Math.max(appliedRadius, config.radius_km + 150);

        const fetchedFB = await fetchLBA(fallbackRomes, userLat, userLon, fbRadius);
        const rawFB = fetchedFB.results;

        const candidatesFB = rawFB
          .map((r: any) => scoreFormation(r, config, userLat, userLon, "fallback"))
          .filter(Boolean) as ScoredFormation[];

        const dedupFB = dedupSmart(candidatesFB, 3).sort(sortByScoreThenDistance);
        const relaxedFB = pickRelaxed(dedupFB, config);

        merged = mergeKeepBest(merged, relaxedFB);

        if (mode === "strict") mode = "fallback_rome";
        else if (mode === "strict+relaxed") mode = "strict+relaxed+fallback_rome";
        else mode = "fallback_rome";
      }
    }

    // Dédup final + cap
    merged = dedupSmart(merged, 3).sort(sortByScoreThenDistance);
    if (merged.length > cap) merged = merged.slice(0, cap);

    // 4) Map -> frontend
    const niveauFiltre = normalizeNiveauFilter(niveau);

    const mapped = merged.map((s) => {
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
        alternance: "Non",
        categorie: "Diplôme / Titre",

        site_web: s.url,
        url: s.url,

        niveau: computedNiveau,
        match: { score: s.score, reasons: s.reasons.slice(0, 3) },
      };
    });

    // 5) Filtre niveau + compteurs
    const count_total_avant_filtre = mapped.length;

    let results = mapped;
    if (niveauFiltre !== "all") {
      results = results.filter((r: any) => r.niveau === niveauFiltre);
    }

    // tri final UI (score puis distance)
    results.sort((a: any, b: any) => {
      const sa = a?.match?.score ?? 0;
      const sb = b?.match?.score ?? 0;
      if (sb !== sa) return sb - sa;

      const da = typeof a.distance_km === "number" ? a.distance_km : 9999;
      const db = typeof b.distance_km === "number" ? b.distance_km : 9999;
      return da - db;
    });

    // indicateur “résultats loin”
    const maxDist = results.reduce((m: number, r: any) => {
      const d = typeof r?.distance_km === "number" ? r.distance_km : 999;
      return Math.max(m, d);
    }, 0);

    const soft = config.soft_distance_cap_km ?? (config.radius_km + 150);
    const farResults = maxDist > soft;

    return new Response(
      JSON.stringify({
        metier_detecte: config.label,
        ville_reference: villeRef,
        rayon_applique: `${appliedRadius} km${expanded ? " (élargi automatiquement)" : ""}`,
        niveau_filtre: niveauFiltre,

        mode,

        // ✅ humain : total vs affiché
        count_total: count_total_avant_filtre,
        count: results.length,

        formations: results,

        // ✅ infos optionnelles (UI peut ignorer)
        warnings: {
          far_results: farResults,
          geocode_score: geo.geoScore,
          geocode_type: geo.geoTypeTried,
        },

        debug: {
          jobKey,
          ...debug,
          strict_count: strictKept.length,
          merged_count_before_level_filter: count_total_avant_filtre,
          final_count_after_level_filter: results.length,
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
