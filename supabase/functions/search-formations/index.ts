// supabase/functions/search-formations/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  fetchPerplexityFormations,
  shouldEnrichWithPerplexity,
  mergeFormationsWithoutDuplicates,
  type PerplexityFormationInput,
} from "./perplexity_enrich.ts";

import { searchRefEA } from "./refeaSearch.ts";

/**
 * OCAPIAT - Search Formations (LBA) + RefEA + Perplexity (enrich)
 * ✅ VF ULTRA ROBUSTE / ZÉRO HORS-SUJET / ZÉRO "HONTE"
 *
 * Principes :
 * - RefEA = source #1 (socle) -> Filtrée par refeaRules.ts (ne pas re-filtrer ici)
 * - LBA = source principale "grand public" -> Filtrée par HARD_RULES_BY_JOB ici
 * - Perplexity = complément seulement si nécessaire -> Filtrée par HARD_RULES_BY_JOB ici
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

const ABSOLUTE_MIN_SCORE = 8;
const MAX_WHY_REASONS = 3;
const PERPLEXITY_SCORE = 14;
const MIN_RESULTS_BEFORE_ENRICH = 10;
const MAX_AVG_DISTANCE_BEFORE_ENRICH = 150;
const FETCH_TIMEOUT_MS = 10_000;
const DEBUG = false;

function getPerplexityHardCap(config: JobProfile) {
  return typeof config.hard_distance_cap_km === "number" ? config.hard_distance_cap_km : 450;
}

// ==================================================================================
// 2) TEXTE UTILS + DISTANCE
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
// 3) THEME GUARD (ULTRA)
// ==================================================================================

type ThemeDomain = "security" | "construction" | "it" | "finance" | "hospitality" | "health" | "law" | "beauty_fashion" | "tourism_transport_people" | "forestry" | "animal_equestrian" | "driving_road_heavy" | "education_childcare" | "sport_coaching";

const THEME_BANNED: Record<ThemeDomain, string[]> = {
  security: ["securite", "surete", "agent de securite", "ssi", "incendie", "vigile", "surveillance", "cynophile"],
  construction: ["btp", "batiment", "chantier", "macon", "maconnerie", "carrelage", "plomberie", "electricien", "peintre", "menuiserie", "charpente", "couvreur", "grutier", "grue", "engins de chantier", "terrassement", "vrd"],
  it: ["informatique", "developpeur", "programmation", "code", "web", "wordpress", "reseau", "cybersecurite", "systeme", "data", "cloud", "devops", "sql"],
  finance: ["banque", "assurance", "immobilier", "credit", "finance", "patrimoine", "courtier", "comptable", "audit financier"],
  hospitality: ["cuisine", "restauration", "hotellerie", "cuisinier", "serveur", "barman", "chef de rang", "barista"],
  health: ["infirmier", "infirmiere", "aide soignant", "medical", "pharmacie", "ambulancier", "sage femme"],
  law: ["avocat", "notaire", "juridique", "droit", "huissier"],
  beauty_fashion: ["esthetique", "coiffure", "cosmetique", "mode", "textile", "spa", "maquillage"],
  tourism_transport_people: ["tourisme", "voyageurs", "transport de personnes", "chauffeur de bus", "bus", "autocar", "taxi", "vtc", "conducteur de voyageurs", "transport urbain"],
  forestry: ["forestier", "foret", "sylviculture", "bucheronnage", "debardage", "elagage", "abattage", "tronconneuse", "grume", "grumier"],
  animal_equestrian: ["equestre", "equitation", "cheval", "chevaux", "attelage", "attelages", "palefrenier"],
  driving_road_heavy: ["routier", "transport routier", "longue distance", "messagerie", "livraison longue distance", "fimo", "fco", "conducteur routier", "poids lourd", "spl", "super lourd"],
  education_childcare: ["petite enfance", "creche", "atsem", "animateur", "animation", "educateur"],
  sport_coaching: ["coach sportif", "sport", "fitness", "bpjeps", "entrainement"],
};

const DEFAULT_BANNED_DOMAINS: ThemeDomain[] = ["security", "construction", "it", "finance", "hospitality", "health", "law", "beauty_fashion", "tourism_transport_people", "education_childcare", "sport_coaching"];

const JOB_EXTRA_BANNED_DOMAINS: Record<string, ThemeDomain[]> = {
  chauffeur: ["forestry", "animal_equestrian", "driving_road_heavy"],
  silo: ["forestry", "animal_equestrian"],
  responsable_silo: ["forestry", "animal_equestrian"],
  technicien_culture: ["forestry", "animal_equestrian"],
  responsable_logistique: ["driving_road_heavy", "tourism_transport_people"],
  magasinier_cariste: ["driving_road_heavy", "tourism_transport_people"],
};

function getThemeBannedList(jobKey: string): string[] {
  const domains = new Set<ThemeDomain>(DEFAULT_BANNED_DOMAINS);
  (JOB_EXTRA_BANNED_DOMAINS[jobKey] ?? []).forEach((d) => domains.add(d));
  const terms: string[] = [];
  for (const d of domains) terms.push(...THEME_BANNED[d]);
  return terms.map(cleanText).filter(Boolean);
}

function isThemeBanned(jobKey: string, fullText: string): boolean {
  const bans = getThemeBannedList(jobKey);
  for (const b of bans) {
    if (includesPhrase(fullText, b) || includesWord(fullText, b)) return true;
  }
  return false;
}

// ==================================================================================
// 3bis) HARD FILTER METIER (POUR LBA & PERPLEXITY UNIQUEMENT)
// ==================================================================================

type HardRules = {
  must_any?: string[];
  must_none?: string[];
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

function shouldKeepByHardRules(jobKey: string, title: string, org: string): boolean {
  // CRUCIAL : On nettoie le texte avant comparaison (lowercase + sans accents)
  const fullText = cleanText(`${title} ${org}`);
  const rules = HARD_RULES_BY_JOB[jobKey] ?? HARD_RULES_BY_JOB.default;

  if (rules.must_none?.length) {
    for (const bad of rules.must_none.map(cleanText).filter(Boolean)) {
      if (includesPhrase(fullText, bad) || includesWord(fullText, bad)) return false;
    }
  }

  if (rules.must_any?.length) {
    const hits = countHitsList(fullText, rules.must_any);
    const minHits = typeof rules.strict_min_must_hits === "number" ? rules.strict_min_must_hits : 1;
    if (hits < minHits) return false;
  }

  return true;
}

const HARD_RULES_BY_JOB: Record<string, HardRules> = {
  chauffeur: {
    must_any: ["tracteur", "machinisme", "machines agricoles", "machine agricole", "conduite d engins", "engins agricoles", "moissonneuse", "ensileuse", "pulverisateur", "remorque", "benne", "recolte", "travaux agricoles", "agroequipement", "agro equipement", "conduite et gestion de l entreprise agricole", "cgea", "cima", "conduite de machines agricoles", "conducteur de machines agricoles", "pilotage de machines agricoles"],
    must_none: ["amenagements paysagers", "aménagements paysagers", "paysagiste", "fleuriste", "horticulture", "viticulture", "oenologie", "vins", "bieres", "spiritueux", "equins", "equin", "cheval", "attelage", "attelages", "bac general", "classe de 4eme", "classe de 3eme", "cycle orientation", "college"],
  },

  silo: {
    // Élargi pour inclure l'agroalimentaire et la transformation (comme RefEA)
    must_any: ["silo", "cereales", "céréales", "grain", "collecte", "stockage", "sechage", "séchage", "tri", "reception", "expedition", "élévateur", "elevateur", "industries agroalimentaires", "bio industries", "conduite de systemes industriels", "transformation", "grandes cultures", "cgea", "agricole", "polyvalent"],
    // PAS d'interdiction "environnement" ici
    must_none: ["eau", "hydraulique", "assainissement", "gestion et maitrise de l eau"],
  },

  responsable_silo: {
    must_any: ["silo", "cereales", "céréales", "grain", "collecte", "stockage", "sechage", "séchage", "qualite", "qualité", "reception", "expedition", "stocks", "industries agroalimentaires", "management", "chef de silo"],
    // PAS d'interdiction "environnement" ici
    must_none: ["eau", "hydraulique", "assainissement", "gestion et maitrise de l eau"],
  },

  technicien_culture: {
    must_any: ["culture", "maraichage", "maraîchage", "grandes cultures", "agronomie", "sol", "fertilisation", "phyto", "phytosanitaire", "itineraire technique", "itinéraire technique", "production vegetale"],
    must_none: ["amenagements paysagers", "aménagements paysagers", "paysage", "paysager", "foret", "sylviculture", "mesures physiques"],
  },

  conducteur_ligne: {
    must_any: ["conducteur de ligne", "conduite de ligne", "conditionnement", "production", "process", "reglage", "réglage", "agroalimentaire", "alimentaire"],
  },

  controleur_qualite: {
    must_any: ["qualite", "qualité", "controle", "contrôle", "haccp", "tracabilite", "traçabilité", "laboratoire", "analyse", "audit", "bioanalyse"],
    // Anti "Mesures physiques"
    must_none: ["mesures physiques", "instrumentation", "electronique"],
  },

  agreeur: {
    must_any: ["agreeur", "agréeur", "agreage", "agréage", "fruits", "legumes", "légumes", "calibrage", "produits frais", "tri", "qualite"],
    // Anti "Logistique pure"
    must_none: ["logistique", "transport", "entrepot", "magasinier"],
  },

  responsable_logistique: {
    must_any: ["logistique", "supply chain", "entrepot", "entrepôt", "stocks", "flux", "wms", "expedition", "expédition", "reception"],
  },

  magasinier_cariste: {
    // Ajout de "logistique" pour élargir
    must_any: ["cariste", "caces", "chariot", "magasinier", "preparation", "préparation", "commandes", "picking", "manutention", "logistique", "entrepot", "quai"],
  },

  maintenance: {
    must_any: ["maintenance", "electromecanique", "électromécanique", "mecanique", "mécanique", "automatismes", "automatisme", "depannage", "dépannage"],
  },

  technico: {
    must_any: ["technico", "agrofourniture", "semences", "intrants", "engrais", "phytosanitaire", "nutrition animale", "cooperative", "négoce", "negoce"],
    // BAN du "Service aux personnes"
    must_none: ["service aux personnes", "services aux personnes", "sapver", "aide a la personne"],
  },

  commercial_export: {
    must_any: ["export", "international", "import export", "douane", "incoterms", "commerce international", "anglais"],
  },

  default: {},
};

// ==================================================================================
// 4) JOB CONFIG
// ==================================================================================

const JOB_CONFIG: Record<string, JobProfile> = {
  silo: {
    key: "silo",
    label: "Agent de Silo",
    romes: ["A1416", "A1101"],
    fallback_romes: ["N1101", "N1303", "N1302"],
    radius_km: 70,
    strong_keywords: ["silo", "grain", "grains", "cereales", "collecte", "stockage", "sechage", "tri", "reception", "expedition", "cooperative", "negoce", "elevateur"],
    synonyms: ["stockage agricole", "collecte cereales", "silo agricole", "collecte de grains"],
    weak_keywords: ["agricole", "logistique", "entrepot", "manutention", "cariste"],
    banned_keywords: ["ciment", "beton"],
    banned_phrases: ["silo a ciment", "silo beton"],
    context_keywords: ["silo", "grain", "grains", "cereales", "collecte", "stockage", "sechage", "tri"],
    min_score: 36,
    target_min_results: 8,
    max_extra_radius_km: 220,
    max_results: 60,
    relaxed_min_score: 22,
    soft_distance_cap_km: 120,
    hard_distance_cap_km: 420,
  },
  chauffeur: {
    key: "chauffeur",
    label: "Chauffeur Agricole",
    romes: ["A1101"],
    fallback_romes: ["N4101", "N4102", "N4105", "N1303"],
    radius_km: 120,
    strong_keywords: ["tracteur", "benne", "remorque", "moissonneuse", "ensileuse", "materiel agricole", "machinisme", "cereales", "recolte", "chauffeur", "conduite", "engins agricoles", "travaux agricoles", "agricole", "permis ce", "permis c", "agro equipement", "agroequipement"],
    synonyms: ["conducteur tracteur", "conduite d engins agricoles", "transport agricole", "chauffeur agricole"],
    weak_keywords: ["transport", "livraison", "route", "logistique"],
    banned_keywords: ["bus", "taxi", "ambulance", "vtc", "tourisme", "voyageurs", "cheval", "chevaux", "attelage", "attelages", "equitation", "equestre"],
    banned_phrases: ["transport de personnes", "chauffeur de bus", "conduite d attelages", "attelages de chevaux"],
    context_keywords: ["agricole", "tracteur", "benne", "remorque", "moissonneuse", "ensileuse", "cereales", "recolte", "engins", "machinisme"],
    min_score: 34,
    target_min_results: 10,
    max_extra_radius_km: 280,
    max_results: 60,
    relaxed_min_score: 20,
    soft_distance_cap_km: 180,
    hard_distance_cap_km: 550,
  },
  responsable_silo: {
    key: "responsable_silo",
    label: "Responsable de Silo",
    romes: ["A1301", "A1303"],
    fallback_romes: ["N1301", "N1302", "N1303"],
    radius_km: 180,
    strong_keywords: ["silo", "stockage", "collecte", "cereales", "cooperative", "negoce", "qualite", "reception", "expedition", "sechage", "tri", "stocks", "planning", "responsable", "chef"],
    synonyms: ["chef de silo", "responsable stockage", "gestionnaire silo"],
    weak_keywords: ["management", "pilotage", "logistique", "entrepot", "supply chain"],
    banned_keywords: [],
    banned_phrases: [],
    context_keywords: ["silo", "cereales", "collecte", "stockage", "sechage", "tri", "reception", "expedition"],
    min_score: 36,
    target_min_results: 6,
    max_extra_radius_km: 320,
    max_results: 50,
    relaxed_min_score: 22,
    soft_distance_cap_km: 250,
    hard_distance_cap_km: 650,
  },
  maintenance: {
    key: "maintenance",
    label: "Responsable services techniques",
    romes: ["I1102"],
    fallback_romes: ["I1304", "I1103"],
    radius_km: 120,
    strong_keywords: ["maintenance", "electromecanique", "mecanique", "hydraulique", "pneumatique", "automatismes", "diagnostic", "depannage", "preventive", "curative", "equipement", "industrie", "production"],
    synonyms: ["responsable maintenance", "chef maintenance", "technicien maintenance"],
    weak_keywords: ["site", "atelier", "energie"],
    banned_keywords: ["maintenance informatique", "reseau", "aeronautique", "avion"],
    banned_phrases: [],
    context_keywords: ["maintenance", "mecanique", "electro", "automatismes", "depannage", "preventive", "curative", "industrie"],
    min_score: 32,
    target_min_results: 8,
    max_extra_radius_km: 280,
    max_results: 60,
    relaxed_min_score: 20,
    soft_distance_cap_km: 180,
    hard_distance_cap_km: 600,
  },
  technico: {
    key: "technico",
    label: "Technico-commercial",
    romes: ["D1407", "D1402"],
    fallback_romes: ["D1401", "D1403"],
    radius_km: 120,
    strong_keywords: ["semences", "intrants", "engrais", "phytosanitaire", "nutrition animale", "agrofourniture", "cooperative", "negoce agricole", "conseil agricole", "agricole", "agroalimentaire"],
    synonyms: ["commercial agricole", "conseiller agricole", "technico commercial agricole"],
    weak_keywords: ["commercial", "vente", "negociation", "relation client"],
    banned_keywords: ["immobilier", "assurance", "banque", "cosmetique", "mode", "textile"],
    banned_phrases: [],
    context_keywords: ["commercial", "technico", "vente", "negociation", "relation client", "agricole", "agroalimentaire", "agrofourniture"],
    min_score: 30,
    target_min_results: 10,
    max_extra_radius_km: 320,
    max_results: 60,
    relaxed_min_score: 18,
    soft_distance_cap_km: 220,
    hard_distance_cap_km: 650,
  },
  responsable_logistique: {
    key: "responsable_logistique",
    label: "Responsable logistique",
    romes: ["N1301", "N1302"],
    fallback_romes: ["N1303", "N1101"],
    radius_km: 120,
    strong_keywords: ["logistique", "entrepot", "supply chain", "flux", "stocks", "transport", "planning", "expedition", "reception", "approvisionnement", "gestion des stocks", "wms"],
    synonyms: ["responsable entrepot", "chef de quai", "gestionnaire logistique"],
    weak_keywords: ["management", "organisation", "pilotage"],
    banned_keywords: ["transport de personnes", "voyageurs"],
    banned_phrases: ["chauffeur de bus", "transport urbain"],
    context_keywords: ["logistique", "entrepot", "stocks", "flux", "transport", "expedition", "reception", "approvisionnement"],
    min_score: 28,
    target_min_results: 10,
    max_extra_radius_km: 280,
    max_results: 80,
    relaxed_min_score: 16,
    soft_distance_cap_km: 200,
    hard_distance_cap_km: 600,
  },
  magasinier_cariste: {
    key: "magasinier_cariste",
    label: "Magasinier / cariste",
    romes: ["N1101", "N1303"],
    fallback_romes: ["N1302", "N1301"],
    radius_km: 80,
    strong_keywords: ["cariste", "caces", "chariot", "chariot elevateur", "magasinier", "preparation de commandes", "picking", "manutention", "stock", "entrepot", "quai", "logistique"],
    synonyms: ["agent magasinier", "operateur logistique", "preparateur de commandes"],
    weak_keywords: ["magasin", "distribution"],
    banned_keywords: ["grue", "btp", "chantier"],
    banned_phrases: [],
    context_keywords: ["cariste", "caces", "magasinier", "entrepot", "stock", "preparation", "manutention", "logistique"],
    min_score: 26,
    target_min_results: 12,
    max_extra_radius_km: 220,
    max_results: 120,
    relaxed_min_score: 14,
    soft_distance_cap_km: 140,
    hard_distance_cap_km: 500,
  },
  controleur_qualite: {
    key: "controleur_qualite",
    label: "Contrôleur qualité",
    romes: ["H1502", "H1506", "H1503"],
    fallback_romes: ["H1504"],
    radius_km: 120,
    strong_keywords: ["controle qualite", "qualite", "conformite", "inspection", "haccp", "tracabilite", "laboratoire", "analyse", "prelevement", "normes", "audit", "plan de controle", "agroalimentaire", "alimentaire"],
    synonyms: ["assistant qualite", "technicien qualite", "agent qualite"],
    weak_keywords: ["industrie", "production"],
    banned_keywords: ["automobile", "aeronautique", "pharmaceutique", "cosmetique", "chimie"],
    banned_phrases: [],
    context_keywords: ["qualite", "controle", "conformite", "audit", "haccp", "tracabilite", "laboratoire", "analyse", "alimentaire", "agroalimentaire"],
    min_score: 28,
    target_min_results: 10,
    max_extra_radius_km: 280,
    max_results: 80,
    relaxed_min_score: 16,
    soft_distance_cap_km: 200,
    hard_distance_cap_km: 650,
  },
  agreeur: {
    key: "agreeur",
    label: "Agréeur",
    romes: ["H1503", "N1303"],
    fallback_romes: ["H1502", "N1101"],
    radius_km: 150,
    strong_keywords: ["agreeur", "agreage", "fruits", "legumes", "produits frais", "reception", "tri", "calibrage", "lots", "tracabilite", "controle qualite", "qualite", "frais"],
    synonyms: ["agreeur fruits et legumes", "controle reception", "qualite alimentaire"],
    weak_keywords: ["qualite", "logistique", "entrepot"],
    banned_keywords: ["pharmaceutique", "cosmetique", "chimie", "biotech", "industries pharmaceutiques"],
    banned_phrases: [],
    context_keywords: ["agreeur", "agreage", "fruits", "legumes", "produits frais", "calibrage", "frais", "reception", "tri"],
    min_score: 28,
    target_min_results: 8,
    max_extra_radius_km: 320,
    max_results: 60,
    relaxed_min_score: 16,
    soft_distance_cap_km: 250,
    hard_distance_cap_km: 700,
  },
  conducteur_ligne: {
    key: "conducteur_ligne",
    label: "Conducteur de ligne",
    romes: ["H2102"],
    fallback_romes: ["H2101"],
    radius_km: 120,
    strong_keywords: ["conducteur de ligne", "conduite de ligne", "ligne", "production", "conditionnement", "fabrication", "process", "machine", "reglage", "demarrage", "arret", "hygiene", "agroalimentaire", "alimentaire"],
    synonyms: ["operateur de production", "pilote de ligne", "conducteur d installation"],
    weak_keywords: ["industrie", "usine"],
    banned_keywords: ["imprimerie", "textile"],
    banned_phrases: [],
    context_keywords: ["ligne", "production", "conditionnement", "reglage", "fabrication", "process", "machine", "agroalimentaire", "alimentaire"],
    min_score: 28,
    target_min_results: 10,
    max_extra_radius_km: 280,
    max_results: 80,
    relaxed_min_score: 16,
    soft_distance_cap_km: 220,
    hard_distance_cap_km: 650,
  },
  technicien_culture: {
    key: "technicien_culture",
    label: "Technicien culture",
    romes: ["A1301"],
    fallback_romes: ["A1416", "A1203"],
    radius_km: 180,
    strong_keywords: ["technicien", "culture", "maraichage", "grandes cultures", "itineraire technique", "agronomie", "sol", "irrigation", "fertilisation", "phyto", "diagnostic", "conseil", "suivi de parcelles", "agricole"],
    synonyms: ["technicien agricole", "technicien cultural", "conseiller technique"],
    weak_keywords: ["environnement", "terrain"],
    banned_keywords: ["informatique", "reseau"],
    banned_phrases: [],
    context_keywords: ["culture", "agronomie", "maraichage", "grandes cultures", "parcelles", "irrigation", "fertilisation", "phyto"],
    min_score: 26,
    target_min_results: 6,
    max_extra_radius_km: 380,
    max_results: 60,
    relaxed_min_score: 16,
    soft_distance_cap_km: 300,
    hard_distance_cap_km: 850,
  },
  commercial_export: {
    key: "commercial_export",
    label: "Commercial export",
    romes: ["D1402"],
    fallback_romes: ["D1401", "D1407"],
    radius_km: 200,
    strong_keywords: ["export", "international", "import export", "douane", "incoterms", "commerce international", "anglais", "negociation internationale", "business international"],
    synonyms: ["assistant import export", "responsable export", "charge d affaires export"],
    weak_keywords: ["commercial", "vente", "grands comptes", "developpement commercial"],
    banned_keywords: ["immobilier", "assurance", "banque"],
    banned_phrases: [],
    context_keywords: ["export", "international", "import", "douane", "incoterms", "commerce international", "business international"],
    min_score: 26,
    target_min_results: 8,
    max_extra_radius_km: 480,
    max_results: 60,
    relaxed_min_score: 16,
    soft_distance_cap_km: 320,
    hard_distance_cap_km: 950,
  },
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
    max_results: 80,
    relaxed_min_score: 12,
    soft_distance_cap_km: 180,
    hard_distance_cap_km: 600,
  },
};

// ==================================================================================
// 5) SCORING
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
  _reasonsInternal: string[];
  reasons: string[];
  ctxHits: number;
  strongHits: number;
  synHits: number;
  _dedupKey: string;
};

function countHits(fullText: string, list: string[]): number {
  let hits = 0;
  for (const kw of (list ?? []).map(cleanText).filter(Boolean)) {
    if (includesPhrase(fullText, kw) || includesWord(fullText, kw)) hits++;
  }
  return hits;
}

function makeDedupKey(title: string, company: string, city: string | null) {
  return `${cleanText(title)}|${cleanText(company)}|${cleanText(city || "")}`;
}

function buildUserReasons(args: {
  hasRome: boolean;
  ctxHits: number;
  strongHits: number;
  synHits: number;
  dist: number | null;
  config: JobProfile;
}) {
  const { hasRome, ctxHits, strongHits, synHits, dist, config } = args;
  const reasons: string[] = [];

  if (ctxHits > 0 || strongHits > 0 || synHits > 0) reasons.push("Correspond bien au métier recherché");
  else if (hasRome) reasons.push("Proche du métier recherché");

  if (typeof dist === "number") {
    if (dist <= 15) reasons.push("Très proche de votre zone");
    else if (dist <= 40) reasons.push("Proche de votre zone");
    else {
      const soft = config.soft_distance_cap_km ?? (config.radius_km + 150);
      if (dist > soft) reasons.push("Un peu plus éloignée");
    }
  }

  if (reasons.length === 0) reasons.push("Résultat pertinent");
  return reasons.slice(0, MAX_WHY_REASONS);
}

function applyChauffeurAntiRoutierPure(fullText: string, phase: Phase, hasThemeSignal: boolean) {
  const looksRoutier = includesWord(fullText, "routier") || includesPhrase(fullText, "transport routier") || includesPhrase(fullText, "longue distance") || includesWord(fullText, "messagerie") || includesWord(fullText, "poids lourd") || includesWord(fullText, "spl");
  if (!looksRoutier) return { reject: false, penalty: 0 };
  if (!hasThemeSignal) {
    if (phase === "strict") return { reject: true, penalty: 999 };
    if (phase === "relaxed") return { reject: false, penalty: 30 };
    return { reject: false, penalty: 18 };
  }
  return { reject: false, penalty: 0 };
}

function scoreFormation(raw: any, config: JobProfile, userLat: number, userLon: number, phase: Phase): ScoredFormation | null {
  const title = raw?.title || "";
  const companyName = raw?.company?.name || "Organisme inconnu";
  const city = raw?.place?.city ?? null;
  const lat = typeof raw?.place?.latitude === "number" ? raw.place.latitude : null;
  const lon = typeof raw?.place?.longitude === "number" ? raw.place.longitude : null;
  const fullText = cleanText(`${title} ${companyName}`);

  if (isThemeBanned(config.key, fullText)) return null;

  for (const p of (config.banned_phrases ?? []).map(cleanText).filter(Boolean)) {
    if (includesPhrase(fullText, p)) return null;
  }
  for (const b of (config.banned_keywords ?? []).map(cleanText).filter(Boolean)) {
    if (includesPhrase(fullText, b) || includesWord(fullText, b)) return null;
  }

  let dist: number | null = null;
  if (lat !== null && lon !== null) dist = haversineKm(userLat, userLon, lat, lon);

  let score = 0;
  const reasonsInternal: string[] = [];
  const hasRome = Array.isArray(raw?.romes) ? raw.romes.some((r: any) => (config.romes ?? []).includes(r?.code)) : false;

  if (hasRome) {
    score += 22;
    reasonsInternal.push("rome_match");
  }

  const strongHits = countHits(fullText, config.strong_keywords);
  const synHits = countHits(fullText, config.synonyms);
  const weakHits = countHits(fullText, config.weak_keywords);

  if (strongHits > 0) score += Math.min(45, strongHits * 10);
  if (synHits > 0) score += Math.min(22, synHits * 8);
  if (weakHits > 0) score += Math.min(12, weakHits * 3);

  const ctx = config.context_keywords ?? [];
  const ctxHits = ctx.length > 0 ? countHits(fullText, ctx) : 0;

  if (ctx.length > 0) {
    if (ctxHits === 0) {
      const penalty = phase === "strict" ? 28 : phase === "relaxed" ? 18 : 10;
      score -= penalty;
      reasonsInternal.push("out_of_context");
    } else {
      score += Math.min(10, ctxHits * 4);
      reasonsInternal.push("context_ok");
    }
  }

  const hasThemeSignal = ctxHits > 0 || strongHits > 0 || synHits > 0;

  if (phase === "strict") {
    if (!hasThemeSignal && !hasRome) return null;
    if ((config.context_keywords?.length ?? 0) > 0 && !hasThemeSignal) return null;
  }

  if (config.key === "chauffeur") {
    const ar = applyChauffeurAntiRoutierPure(fullText, phase, hasThemeSignal);
    if (ar.reject) return null;
    if (ar.penalty > 0) {
      score -= ar.penalty;
      reasonsInternal.push("routier_pur_penalty");
    }
  }

  if (dist !== null) {
    if (dist <= 10) score += 8;
    else if (dist <= 25) score += 5;
    else if (dist <= 50) score += 2;
    if (dist > config.radius_km) score -= 6;

    const soft = config.soft_distance_cap_km ?? (config.radius_km + 150);
    const hard = config.hard_distance_cap_km ?? (soft + 250);

    if (dist > soft) {
      const extra = Math.min(30, Math.round((dist - soft) / 30));
      score -= (phase === "fallback" ? 6 : 8) + extra;
      reasonsInternal.push("far");
    }
    if (dist > hard) {
      score -= phase === "fallback" ? 18 : 28;
      reasonsInternal.push("very_far");
    }
  } else {
    score -= 10;
    reasonsInternal.push("no_geo");
  }

  const id = raw?.id || crypto.randomUUID();
  const userReasons = buildUserReasons({ hasRome, ctxHits, strongHits, synHits, dist, config });

  return {
    id, title, companyName, city, lat, lon, url: raw?.url || null, romes: raw?.romes || null, diplomaLevel: raw?.diplomaLevel, distanceKm: dist, score, _reasonsInternal: reasonsInternal, reasons: userReasons, ctxHits, strongHits, synHits, _dedupKey: makeDedupKey(title, companyName, city),
  };
}

// ==================================================================================
// 6) FETCH (timeout) + utils tri/dedup/merge
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
  const url = `https://labonnealternance.apprentissage.beta.gouv.fr/api/v1/formations?romes=${encodeURIComponent(romes.join(","))}&latitude=${lat}&longitude=${lon}&radius=${radiusKm}&caller=ocapiat_app`;
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

function dedupSmart(items: ScoredFormation[], maxPerTitle = 3) {
  const seen = new Set<string>();
  const unique = items.filter((s) => {
    const k = s._dedupKey;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const counts = new Map<string, number>();
  const limited = unique.filter((s) => {
    const tk = cleanText(s.title);
    const c = (counts.get(tk) ?? 0) + 1;
    counts.set(tk, c);
    return c <= maxPerTitle;
  });
  return limited;
}

function mergeKeepBest(base: ScoredFormation[], extra: ScoredFormation[]) {
  const map = new Map<string, ScoredFormation>();
  const keep = (s: ScoredFormation) => {
    const k = s._dedupKey;
    const existing = map.get(k);
    if (!existing) return map.set(k, s);
    const best = [existing, s].sort(sortByScoreThenDistance)[0];
    map.set(k, best);
  };
  base.forEach(keep);
  extra.forEach(keep);
  return Array.from(map.values()).sort(sortByScoreThenDistance);
}

function pickByThreshold(scored: ScoredFormation[], minScore: number, cap: number) {
  const threshold = Math.max(minScore, ABSOLUTE_MIN_SCORE);
  const kept = scored.filter((s) => s.score >= threshold).sort(sortByScoreThenDistance);
  return kept.slice(0, cap);
}

// ==================================================================================
// 7) STRICT ADAPTATIF + POOL RAW POUR RESCORE
// ==================================================================================

async function getStrictAndPoolRaw(config: JobProfile, userLat: number, userLon: number): Promise<{ strictKept: ScoredFormation[]; bestRawPool: any[]; appliedRadius: number; expanded: boolean; debug: any }> {
  const baseRadius = config.radius_km;
  const steps = [0, 30, 60, 100, 150, 200, 300, 420].filter((s) => s <= config.max_extra_radius_km);
  let appliedRadius = baseRadius;
  let expanded = false;
  let raw_count_last = 0;
  let scored_count_last = 0;
  let kept_count_strict_last = 0;
  let last_status: number | undefined;
  let finalStrict: ScoredFormation[] = [];
  let bestRawPool: any[] = [];
  let bestRawCount = -1;

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
    const scoredAll = raw.map((r: any) => scoreFormation(r, config, userLat, userLon, "strict")).filter(Boolean) as ScoredFormation[];
    scored_count_last = scoredAll.length;
    const keptStrict = scoredAll.filter((s) => s.score >= config.min_score);
    kept_count_strict_last = keptStrict.length;
    finalStrict = dedupSmart(keptStrict, 3).sort(sortByScoreThenDistance);
    if (DEBUG) console.log("radius", appliedRadius, "raw", raw_count_last, "strict", finalStrict.length);
    if (finalStrict.length >= config.target_min_results) break;
  }
  return { strictKept: finalStrict, bestRawPool, appliedRadius, expanded, debug: { raw_count_last, scored_count_last, kept_count_strict_last, best_pool_raw_count: bestRawPool.length, last_status } };
}

// ==================================================================================
// 8) METIER DETECTION
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
  if ((JOB_CONFIG as any)[raw]) return raw;
  if ((JOB_CONFIG as any)[cleaned]) return cleaned;
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
// 9) GEO
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
// 10) HANDLER
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
    const config: JobProfile = (JOB_CONFIG as any)[jobKey] || (JOB_CONFIG as any).default;
    const geo = await geocodeCityOrThrow(ville);
    const userLat = geo.userLat;
    const userLon = geo.userLon;
    const villeRef = geo.villeRef;

    // ✅ 0) REFEA D'ABORD
    // On ne re-filtre PAS ici avec HARD_RULES, car refeaSearch le fait déjà mieux.
    const refeaResults = searchRefEA({
      jobLabel: config.label,
      ville: villeRef,
      userLat,
      userLon,
      radiusKm: 250,
      limit: 40,
    }) || [];

    let mapped = refeaResults;
    const target = Math.max(6, config.target_min_results);
    const cap = config.max_results ?? 60;

    // ✅ 1) LBA SEARCH
    const { strictKept, bestRawPool, appliedRadius, expanded, debug } = await getStrictAndPoolRaw(config, userLat, userLon);
    let mode: Mode = "strict";
    let merged: ScoredFormation[] = strictKept;

    if (merged.length < target) {
      const relaxedScored = bestRawPool.map((r: any) => scoreFormation(r, config, userLat, userLon, "relaxed")).filter(Boolean) as ScoredFormation[];
      const relaxedMin = config.relaxed_min_score ?? Math.max(12, config.min_score - 12);
      const relaxedPicked = pickByThreshold(dedupSmart(relaxedScored, 3), relaxedMin, cap);
      merged = mergeKeepBest(merged, relaxedPicked);
      mode = merged.length > 0 ? "strict+relaxed" : "relaxed";
    }

    if (merged.length < target) {
      const fallbackRomes = Array.from(new Set([...(config.fallback_romes ?? []), ...config.romes])).filter(Boolean);
      if (fallbackRomes.length > 0) {
        const fbRadius = Math.max(appliedRadius, config.radius_km + 150);
        const fetchedFB = await fetchLBA(fallbackRomes, userLat, userLon, fbRadius);
        const rawFB = fetchedFB.results;
        const scoredFB = rawFB.map((r: any) => scoreFormation(r, config, userLat, userLon, "fallback")).filter(Boolean) as ScoredFormation[];
        const relaxedMin = config.relaxed_min_score ?? Math.max(12, config.min_score - 12);
        const pickedFB = pickByThreshold(dedupSmart(scoredFB, 3), relaxedMin, cap);
        merged = mergeKeepBest(merged, pickedFB);
        if (mode === "strict") mode = "fallback_rome";
        else if (mode === "strict+relaxed") mode = "strict+relaxed+fallback_rome";
        else mode = "fallback_rome";
      }
    }

    merged = dedupSmart(merged, 3).sort(sortByScoreThenDistance);
    if (merged.length > cap) merged = merged.slice(0, cap);

    const niveauFiltre = normalizeNiveauFilter(niveau);
    const mappedLBA = merged.map((s) => {
      const computedNiveau = inferNiveau(s.diplomaLevel, s.title);
      const distRounded = s.distanceKm === null ? 999 : round1(s.distanceKm);
      return {
        id: s.id, intitule: s.title, organisme: s.companyName, ville: s.city ?? villeRef, lat: s.lat ?? undefined, lon: s.lon ?? undefined, distance_km: distRounded, rncp: "Non renseigné", modalite: "Non renseigné", alternance: "Non renseigné", categorie: "Diplôme / Titre", site_web: s.url, url: s.url, niveau: computedNiveau, match: { score: s.score, reasons: s.reasons },
      };
    });

    // ✅ HARD FILTER métier sur LBA (uniquement LBA)
    const mappedLBAFiltered = mappedLBA.filter((f: any) => shouldKeepByHardRules(jobKey, f?.intitule ?? "", f?.organisme ?? ""));
    mapped = mergeFormationsWithoutDuplicates(mapped, mappedLBAFiltered);

    // ✅ 2) PERPLEXITY (Complément)
    let perplexityUsed = false;
    let allFormations = mapped;

    if (shouldEnrichWithPerplexity(mapped, { min_results: MIN_RESULTS_BEFORE_ENRICH, max_distance: MAX_AVG_DISTANCE_BEFORE_ENRICH })) {
      try {
        const missing = Math.max(0, MIN_RESULTS_BEFORE_ENRICH - mapped.length);
        const perplexityInput: PerplexityFormationInput = { metierLabel: config.label, villeRef, lat: userLat, lon: userLon, limit: Math.max(3, Math.min(12, missing || 5)) };
        const pplxRaw = await fetchPerplexityFormations(perplexityInput);
        const hardCap = getPerplexityHardCap(config);
        const pplxSafe = (pplxRaw || []).filter((f: any) => f && typeof f?.distance_km === "number").filter((f: any) => f.distance_km >= 0 && f.distance_km < 900).filter((f: any) => f.distance_km <= hardCap).map((f: any) => ({
          ...f, alternance: "Non renseigné", modalite: "Non renseigné", rncp: "Non renseigné", match: { score: PERPLEXITY_SCORE, reasons: Array.isArray(f?.match?.reasons) && f.match.reasons.length ? f.match.reasons.slice(0, MAX_WHY_REASONS) : ["Formation complémentaire vérifiée", "Correspond au métier recherché"].slice(0, MAX_WHY_REASONS) },
        }));
        // Filtre aussi Perplexity avec les règles strictes
        const pplxFinal = pplxSafe.filter((f: any) => shouldKeepByHardRules(jobKey, f?.intitule ?? "", f?.organisme ?? ""));
        if (pplxFinal.length > 0) {
          perplexityUsed = true;
          allFormations = mergeFormationsWithoutDuplicates(mapped, pplxFinal);
        }
      } catch (error) { console.error("Perplexity enrichment failed:", error); }
    }

    // ✅ DÉFINITION CORRECTE AVANT UTILISATION
    const count_total_avant_filtre = allFormations.length;

    let results = allFormations;
    if (niveauFiltre !== "all") {
      results = results.filter((r: any) => r.niveau === niveauFiltre);
    }
    
    // Tri final
    results.sort((a: any, b: any) => {
      const sa = a?.match?.score ?? 0;
      const sb = b?.match?.score ?? 0;
      if (sb !== sa) return sb - sa;
      const da = typeof a.distance_km === "number" ? a.distance_km : 9999;
      const db = typeof b.distance_km === "number" ? b.distance_km : 9999;
      return da - db;
    });

    const soft = config.soft_distance_cap_km ?? (config.radius_km + 150);
    const maxDist = results.reduce((m: number, r: any) => { const d = typeof r?.distance_km === "number" ? r.distance_km : 999; return Math.max(m, d); }, 0);
    
    return new Response(JSON.stringify({
      metier_detecte: config.label, 
      ville_reference: villeRef, 
      rayon_applique: `${appliedRadius} km${expanded ? " (élargi automatiquement)" : ""}`, 
      niveau_filtre: niveauFiltre, 
      mode, 
      count_total: count_total_avant_filtre, // UTILISATION SÛRE
      count: results.length, 
      formations: results, 
      warnings: { far_results: maxDist > soft, geocode_score: geo.geoScore, geocode_type: geo.geoTypeTried, no_relevant_results: results.length === 0, absolute_min_score: ABSOLUTE_MIN_SCORE }, 
      debug: { jobKey, ...debug, strict_count: strictKept.length, perplexity_enrichment_used: perplexityUsed, hard_filter_enabled: true },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || "Erreur inconnue" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});