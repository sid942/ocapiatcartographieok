// supabase/functions/search-formations/index.ts
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
const ABSOLUTE_MIN_SCORE = 10;
const MAX_WHY_REASONS = 3;

// Perplexity
const PERPLEXITY_SCORE = 14;
const MIN_RESULTS_BEFORE_ENRICH = 10;
const MAX_AVG_DISTANCE_BEFORE_ENRICH = 150;

// Global caps
const GLOBAL_MAX_RESULTS_DEFAULT = 40;
const REFEA_MAX = 20;
const LBA_MAX = 30;
const PPLX_MAX = 10;

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
    .replace(/['']/g, " ")
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
  if (!p || p.length < 3) return false;
  return t.includes(p);
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

// ==================================================================================
// JOB PROFILES
// ==================================================================================
const JOB_PROFILES: Record<string, JobProfile> = {
  technico: {
    key: "technico",
    label: "Technico-commercial",
    romes: ["D1407", "D1406"],
    fallback_romes: ["D1401", "D1402"],
    radius_km: 100,
    strong_keywords: [
      "technico",
      "technico commercial",
      "technico-commercial",
      "negociateur",
      "négociateur",
      "conseil vente",
      "vente conseil",
    ],
    synonyms: [
      "agrofourniture",
      "intrants",
      "semences",
      "engrais",
      "phytosanitaire",
      "nutrition animale",
      "cooperative",
      "coopérative",
      "negoce agricole",
      "négoce agricole",
    ],
    weak_keywords: ["commerce", "vente", "commercial"],
    context_keywords: ["agricole", "agri", "agriculture", "agroalimentaire", "alimentaire", "distribution"],
    banned_keywords: [
      "marketing",
      "digital",
      "numerique",
      "numérique",
      "e commerce",
      "e-commerce",
      "community",
      "immobilier",
      "assurance",
      "banque",
    ],
    banned_phrases: [
      "business developer",
      "business development",
      "developpement commercial",
      "développement commercial",
      "charge d affaires",
      "chargé d affaires",
    ],
    min_score: 18,
    relaxed_min_score: 12,
    target_min_results: 12,
    max_extra_radius_km: 250,
    soft_distance_cap_km: 200,
    hard_distance_cap_km: 350,
  },

  commercial_export: {
    key: "commercial_export",
    label: "Commercial Export",
    romes: ["D1407", "D1406"],
    fallback_romes: ["D1401"],
    radius_km: 150,
    strong_keywords: ["export", "international", "commerce international", "import export", "import-export"],
    synonyms: ["douane", "incoterms", "anglais", "negociation internationale", "négociation internationale"],
    weak_keywords: ["commerce", "commercial", "vente"],
    context_keywords: ["logistique internationale", "export"],
    banned_keywords: ["tourisme", "loisirs", "hotellerie", "hôtellerie", "restauration"],
    banned_phrases: [],
    min_score: 16,
    relaxed_min_score: 11,
    target_min_results: 10,
    max_extra_radius_km: 300,
    soft_distance_cap_km: 250,
    hard_distance_cap_km: 450,
  },

  silo: {
    key: "silo",
    label: "Agent de silo",
    romes: ["N1103", "A1416"],
    fallback_romes: ["N1105", "H2301"],
    radius_km: 80,
    strong_keywords: ["silo", "cereales", "céréales", "grain", "grains", "collecte", "stockage"],
    synonyms: [
      "reception",
      "réception",
      "expedition",
      "expédition",
      "sechage",
      "séchage",
      "cooperative",
      "coopérative",
      "grandes cultures",
    ],
    weak_keywords: ["magasinage", "tri", "elevateur", "élévateur"],
    context_keywords: ["cgea", "industries agroalimentaires"],
    banned_keywords: ["eau", "assainissement", "gemeau", "gém eau", "elevage", "élevage", "bovin", "porcin"],
    banned_phrases: ["gestion de l eau", "gestion de l'eau"],
    min_score: 20,
    relaxed_min_score: 14,
    target_min_results: 10,
    max_extra_radius_km: 180,
    soft_distance_cap_km: 150,
    hard_distance_cap_km: 250,
  },

  responsable_silo: {
    key: "responsable_silo",
    label: "Responsable de silo",
    romes: ["N1103", "A1416"],
    fallback_romes: ["N1301", "H2301"],
    radius_km: 100,
    strong_keywords: ["silo", "cereales", "céréales", "grain", "responsable", "chef", "management"],
    synonyms: ["collecte", "stockage", "qualite", "qualité", "logistique", "approvisionnement"],
    weak_keywords: ["reception", "réception", "expedition", "expédition"],
    context_keywords: ["cgea", "grandes cultures"],
    banned_keywords: ["eau", "assainissement", "gemeau", "elevage", "élevage"],
    banned_phrases: ["aquaculture", "pisciculture"],
    min_score: 18,
    relaxed_min_score: 13,
    target_min_results: 10,
    max_extra_radius_km: 200,
    soft_distance_cap_km: 180,
    hard_distance_cap_km: 300,
  },

  // ✅ FIX IMPORTANT : "conduite" ne doit PAS être un strong_keyword (trop générique)
  chauffeur: {
    key: "chauffeur",
    label: "Chauffeur agricole",
    romes: ["A1101", "N4101"],
    fallback_romes: ["N4105"],
    radius_km: 70,
    strong_keywords: [
      "chauffeur",
      "tracteur",
      "moissonneuse",
      "machinisme",
      "machines agricoles",
      "travaux mecanises",
      "travaux mécanisés",
      "agroequipement",
      "agro equipement",
      "pulverisateur",
      "pulvérisateur",
    ],
    synonyms: ["recolte", "récolte", "benne", "remorque"],
    weak_keywords: ["conduite"], // ✅ "faible" uniquement
    context_keywords: ["cgea", "grandes cultures"],
    banned_keywords: ["taxi", "vtc", "bus", "autocar", "voyageurs", "btp", "travaux publics", "routier", "poids lourd"],
    banned_phrases: ["transport de personnes", "transport routier"],
    min_score: 19,
    relaxed_min_score: 13,
    target_min_results: 8,
    max_extra_radius_km: 150,
    soft_distance_cap_km: 120,
    hard_distance_cap_km: 200,
  },

  responsable_logistique: {
    key: "responsable_logistique",
    label: "Responsable logistique",
    romes: ["N1301", "N1303"],
    fallback_romes: ["N1302"],
    radius_km: 120,
    strong_keywords: ["logistique", "supply chain", "stocks", "flux", "entrepot", "entrepôt", "responsable"],
    synonyms: ["expedition", "expédition", "reception", "réception", "approvisionnement", "planning"],
    weak_keywords: ["wms", "transport", "exploitation"],
    context_keywords: [],
    banned_keywords: ["chauffeur", "taxi", "vtc", "voyageurs"],
    banned_phrases: ["transport de personnes"],
    min_score: 17,
    relaxed_min_score: 12,
    target_min_results: 10,
    max_extra_radius_km: 250,
    soft_distance_cap_km: 200,
    hard_distance_cap_km: 400,
  },

  magasinier_cariste: {
    key: "magasinier_cariste",
    label: "Magasinier / Cariste",
    romes: ["N1103", "N1105"],
    fallback_romes: ["N1101"],
    radius_km: 80,
    strong_keywords: ["cariste", "caces", "chariot", "chariot elevateur", "chariot élévateur", "magasinier"],
    synonyms: ["entrepot", "entrepôt", "logistique", "stock", "preparation", "préparation", "picking"],
    weak_keywords: ["manutention", "quai", "emballage"],
    context_keywords: [],
    banned_keywords: ["vente", "vendeur", "jardinerie", "animalerie", "commerce"],
    banned_phrases: [],
    min_score: 18,
    relaxed_min_score: 13,
    target_min_results: 10,
    max_extra_radius_km: 180,
    soft_distance_cap_km: 150,
    hard_distance_cap_km: 250,
  },

  maintenance: {
    key: "maintenance",
    label: "Technicien de maintenance",
    romes: ["I1304", "I1302"],
    fallback_romes: ["I1305"],
    radius_km: 100,
    strong_keywords: ["maintenance", "electromecanique", "électromécanique", "mecanique", "mécanique", "automatisme"],
    synonyms: ["electrique", "électrique", "industrie", "industrielle", "depannage", "dépannage"],
    weak_keywords: ["robotique"],
    context_keywords: ["maintenance industrielle"],
    banned_keywords: ["informatique", "reseaux", "réseaux", "telecom", "télécom", "cyber", "data", "automobile"],
    banned_phrases: ["systemes d information", "systèmes d'information", "motoculture de plaisance"],
    min_score: 17,
    relaxed_min_score: 12,
    target_min_results: 10,
    max_extra_radius_km: 200,
    soft_distance_cap_km: 180,
    hard_distance_cap_km: 350,
  },

  controleur_qualite: {
    key: "controleur_qualite",
    label: "Contrôleur qualité",
    romes: ["H1503", "H1502"],
    fallback_romes: ["H1504"],
    radius_km: 100,
    strong_keywords: ["qualite", "qualité", "controle", "contrôle", "haccp", "tracabilite", "traçabilité"],
    synonyms: ["laboratoire", "analyse", "audit", "securite des aliments", "sécurité des aliments"],
    weak_keywords: ["agroalimentaire", "alimentaire", "bioanalyse"],
    context_keywords: [],
    banned_keywords: ["eau", "gemeau", "cosmetique", "cosmétique", "pharmaceutique", "chimie"],
    banned_phrases: ["gestion de l eau"],
    min_score: 17,
    relaxed_min_score: 12,
    target_min_results: 10,
    max_extra_radius_km: 200,
    soft_distance_cap_km: 180,
    hard_distance_cap_km: 350,
  },

  agreeur: {
    key: "agreeur",
    label: "Agréeur",
    romes: ["A1416", "H1503"],
    fallback_romes: ["N1103"],
    radius_km: 100,
    strong_keywords: ["agreeur", "agréeur", "agreage", "agréage", "fruits", "legumes", "légumes"],
    synonyms: ["produits frais", "qualite", "qualité", "reception", "réception", "tri", "calibrage"],
    weak_keywords: ["normalisation", "maturation"],
    context_keywords: [],
    banned_keywords: ["eau", "gemeau", "logistique", "transport", "cariste"],
    banned_phrases: ["horticulture", "fleuriste"],
    min_score: 18,
    relaxed_min_score: 13,
    target_min_results: 8,
    max_extra_radius_km: 180,
    soft_distance_cap_km: 150,
    hard_distance_cap_km: 300,
  },

  conducteur_ligne: {
    key: "conducteur_ligne",
    label: "Conducteur de ligne",
    romes: ["H2301", "H2102"],
    fallback_romes: ["H2101"],
    radius_km: 100,
    strong_keywords: ["conducteur de ligne", "conduite de ligne", "production", "conditionnement", "process"],
    synonyms: ["reglage", "réglage", "transformation", "operateur", "opérateur", "agroalimentaire"],
    weak_keywords: ["alimentaire", "industries agroalimentaires"],
    context_keywords: [],
    banned_keywords: ["elevage", "élevage", "viticulture", "vigne", "vin", "horticulture", "paysage"],
    banned_phrases: [],
    min_score: 17,
    relaxed_min_score: 12,
    target_min_results: 10,
    max_extra_radius_km: 200,
    soft_distance_cap_km: 180,
    hard_distance_cap_km: 350,
  },

  technicien_culture: {
    key: "technicien_culture",
    label: "Technicien culture",
    romes: ["A1301", "A1303"],
    fallback_romes: ["A1101"],
    radius_km: 100,
    strong_keywords: ["technicien culture", "culture", "agronomie", "maraichage", "maraîchage", "grandes cultures"],
    synonyms: ["production vegetale", "production végétale", "sol", "fertilisation", "irrigation", "phytosanitaire"],
    weak_keywords: ["conseil", "agroecologie", "agroécologie"],
    context_keywords: [],
    banned_keywords: ["elevage", "élevage", "viticulture", "vigne", "vin", "foret", "forêt"],
    banned_phrases: ["aquaculture", "pisciculture"],
    min_score: 17,
    relaxed_min_score: 12,
    target_min_results: 10,
    max_extra_radius_km: 200,
    soft_distance_cap_km: 180,
    hard_distance_cap_km: 350,
  },
};

// ==================================================================================
// SCORING
// ==================================================================================
function computeMatchScore(
  intitule: string,
  etablissement: string,
  config: JobProfile,
  phase: Phase,
): { score: number; reasons: string[] } {
  const text = `${intitule} ${etablissement}`;
  const reasons: string[] = [];
  let score = 0;

  const minScore = phase === "strict" ? config.min_score : (config.relaxed_min_score ?? config.min_score);

  // Banned check
  for (const banned of config.banned_keywords) {
    if (includesWord(text, banned)) {
      return { score: 0, reasons: ["Contenu non pertinent"] };
    }
  }
  for (const phrase of config.banned_phrases) {
    if (includesPhrase(text, phrase)) {
      return { score: 0, reasons: ["Contenu non pertinent"] };
    }
  }

  // Strong keywords
  let strongMatches = 0;
  for (const kw of config.strong_keywords) {
    if (includesWord(text, kw)) {
      strongMatches++;
      score += 8;
    }
  }
  if (strongMatches > 0) reasons.push(`Correspond au métier recherché (${strongMatches} critères)`);

  // Synonyms
  let synonymMatches = 0;
  for (const syn of config.synonyms) {
    if (includesWord(text, syn)) {
      synonymMatches++;
      score += 5;
    }
  }
  if (synonymMatches > 0) reasons.push(`Domaine proche (${synonymMatches} éléments)`);

  // Context keywords
  if (config.context_keywords && config.context_keywords.length > 0) {
    for (const ctx of config.context_keywords) {
      if (includesWord(text, ctx)) score += 3;
    }
  }

  // Weak keywords (phase relaxed)
  if (phase !== "strict") {
    for (const weak of config.weak_keywords) {
      if (includesWord(text, weak)) score += 2;
    }
  }

  if (score < minScore) return { score: 0, reasons: [] };

  return { score: Math.min(score, 100), reasons: reasons.slice(0, MAX_WHY_REASONS) };
}

function applyDistanceBonus(baseScore: number, distanceKm: number, config: JobProfile): number {
  const softCap = config.soft_distance_cap_km ?? 200;
  if (distanceKm <= softCap) return baseScore;

  const penalty = Math.floor((distanceKm - softCap) / 50) * 2;
  return Math.max(baseScore - penalty, ABSOLUTE_MIN_SCORE);
}

// ==================================================================================
// LBA FETCH (robuste: results | formations | data.results)
// ==================================================================================
async function fetchLBA(params: {
  romes: string[];
  latitude: number;
  longitude: number;
  radius: number;
  caller?: string;
}): Promise<any[]> {
  const { romes, latitude, longitude, radius, caller } = params;

  const romesParam = romes.join(",");
  const url =
    `https://labonnealternance-recette.apprentissage.beta.gouv.fr/api/v1/formations` +
    `?romes=${encodeURIComponent(romesParam)}` +
    `&latitude=${encodeURIComponent(String(latitude))}` +
    `&longitude=${encodeURIComponent(String(longitude))}` +
    `&radius=${encodeURIComponent(String(radius))}` +
    `&caller=${encodeURIComponent(caller ?? "ocapiat")}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error(`[LBA] HTTP ${res.status} - ${txt.slice(0, 300)}`);
      return [];
    }

    const data = await res.json().catch(() => null);

    // ✅ robust parsing (API variants)
    const results =
      (data && Array.isArray(data.results) && data.results) ||
      (data && Array.isArray(data.formations) && data.formations) ||
      (data && Array.isArray(data.data?.results) && data.data.results) ||
      [];

    if (DEBUG) console.log(`[LBA] Received ${results.length} results`);

    return Array.isArray(results) ? results : [];
  } catch (err: any) {
    console.error("[LBA] Fetch error:", err?.message ?? String(err));
    return [];
  }
}

// ==================================================================================
// MAIN SEARCH
// ==================================================================================
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { metier, ville, lat, lon, niveau, mode } = await req.json();

    if (!metier || !ville || typeof lat !== "number" || typeof lon !== "number") {
      return new Response(
        JSON.stringify({ error: "Paramètres manquants: metier, ville, lat, lon requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const config = JOB_PROFILES[metier];
    if (!config) {
      return new Response(
        JSON.stringify({ error: `Métier inconnu: ${metier}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const niveauFiltre: NiveauFiltre = niveau || "all";
    const searchMode: Mode = mode || "strict+relaxed+fallback_rome";

    const globalMaxResults = config.max_results ?? GLOBAL_MAX_RESULTS_DEFAULT;

    // Pour affichage UI
    let appliedRadiusKm = config.radius_km;

    // ===== PHASE 1: RefEA (source officielle) =====
    let refeaResults: any[] = [];
    try {
      const refeaRadius = Math.min(config.radius_km + 50, 200);
      refeaResults = searchRefEA({
        jobLabel: config.label,
        ville,
        userLat: lat,
        userLon: lon,
        radiusKm: refeaRadius,
        limit: REFEA_MAX,
      });
    } catch (e) {
      console.error("[RefEA] Error:", e);
    }

    // ===== PHASE 2: LBA (API externe) =====
    let allFormations: any[] = [];
    const phases: Phase[] = [];
    if (searchMode.includes("strict")) phases.push("strict");
    if (searchMode.includes("relaxed")) phases.push("relaxed");
    if (searchMode.includes("fallback_rome")) phases.push("fallback");

    // Warnings / debug utiles
    const warnings: any = {};
    const debug: any = {
      phases,
      lba_requests: [] as any[],
      sources: {
        refea: refeaResults.length,
        lba: 0,
        perplexity: 0,
      },
    };

    for (const phase of phases) {
      const romes = phase === "fallback" ? (config.fallback_romes ?? config.romes) : config.romes;
      const currentRadius = phase === "strict" ? config.radius_km : config.radius_km + config.max_extra_radius_km;

      appliedRadiusKm = Math.max(appliedRadiusKm, currentRadius);

      debug.lba_requests.push({ phase, romes, radius: currentRadius });

      const lbaRaw = await fetchLBA({
        romes,
        latitude: lat,
        longitude: lon,
        radius: currentRadius,
        caller: "ocapiat",
      });

      for (const item of lbaRaw) {
        const intitule = item?.title || item?.intitule || "";
        const organisme = item?.company?.name || item?.organisme || "";

        const itemLat = item?.place?.latitude ?? item?.lat;
        const itemLon = item?.place?.longitude ?? item?.lon;

        if (typeof itemLat !== "number" || typeof itemLon !== "number") continue;

        const distance = haversineKm(lat, lon, itemLat, itemLon);

        const hardCap = config.hard_distance_cap_km ?? 500;
        if (distance > hardCap) continue;

        const { score: baseScore, reasons } = computeMatchScore(intitule, organisme, config, phase);
        if (baseScore < ABSOLUTE_MIN_SCORE) continue;

        const finalScore = applyDistanceBonus(baseScore, distance, config);
        if (finalScore < ABSOLUTE_MIN_SCORE) continue;

        const niv = item?.diploma?.level?.toString() || "N/A";
        if (niveauFiltre !== "all" && niv !== niveauFiltre && niv !== "N/A") continue;

        allFormations.push({
          id: item?.id || `lba_${Math.random().toString(36).slice(2)}`,
          intitule,
          organisme,
          ville: item?.place?.city || item?.ville || "",
          lat: itemLat,
          lon: itemLon,
          distance_km: Math.round(distance * 10) / 10,
          rncp: item?.rncp_code || item?.rncp || "Non renseigné",
          modalite: item?.onisep_url ? "Présentiel" : "Non renseigné",
          alternance: item?.diploma?.level ? "Oui" : "Non renseigné",
          categorie: "Diplôme / Titre",
          site_web: item?.company?.website || item?.site_web || null,
          url: item?.url || null,
          niveau: niv,
          match: {
            score: finalScore,
            reasons: reasons.length > 0 ? reasons : ["Formation pertinente"],
          },
          _source: "lba",
        });
      }

      if (allFormations.length >= config.target_min_results) break;
    }

    // Sort LBA by score desc, then distance asc
    allFormations.sort((a, b) => {
      if (b.match.score !== a.match.score) return b.match.score - a.match.score;
      return (a.distance_km ?? 999) - (b.distance_km ?? 999);
    });

    allFormations = allFormations.slice(0, LBA_MAX);
    debug.sources.lba = allFormations.length;

    // ===== PHASE 3: Perplexity (enrichissement si nécessaire) =====
    let perplexityResults: any[] = [];
    const shouldEnrich = shouldEnrichWithPerplexity(allFormations, {
      min_results: MIN_RESULTS_BEFORE_ENRICH,
      max_distance: MAX_AVG_DISTANCE_BEFORE_ENRICH,
    });

    if (shouldEnrich) {
      try {
        const pplxInput: PerplexityFormationInput = {
          metierLabel: config.label,
          villeRef: ville,
          lat,
          lon,
          limit: PPLX_MAX,
          job_keywords: [...config.strong_keywords, ...config.synonyms].slice(0, 30),
          banned_keywords: [...config.banned_keywords, ...config.banned_phrases].slice(0, 40),
          hard_cap_km: getPerplexityHardCap(config),
          output_score: PERPLEXITY_SCORE,
        };

        perplexityResults = await fetchPerplexityFormations(pplxInput);
        debug.sources.perplexity = perplexityResults.length;
      } catch (e) {
        console.error("[Perplexity] Error:", e);
      }
    }

    // ===== MERGE & DEDUP =====
    let finalResults = mergeFormationsWithoutDuplicates(refeaResults, allFormations);
    finalResults = mergeFormationsWithoutDuplicates(finalResults, perplexityResults);

    // Final sort by score desc, then distance asc
    finalResults.sort((a, b) => {
      const scoreA = a?.match?.score ?? 0;
      const scoreB = b?.match?.score ?? 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return (a?.distance_km ?? 999) - (b?.distance_km ?? 999);
    });

    // Apply global max results cap
    finalResults = finalResults.slice(0, globalMaxResults);

    // Warning si très peu / ou résultats éloignés
    if (finalResults.length > 0) {
      const avgDist =
        finalResults.reduce((sum, x) => sum + (typeof x.distance_km === "number" ? x.distance_km : 0), 0) /
        finalResults.length;
      if (avgDist > (config.soft_distance_cap_km ?? 200)) warnings.far_results = true;
    }

    // ✅ RÉPONSE AU FORMAT ATTENDU PAR TON FRONT
    return new Response(
      JSON.stringify({
        // champs attendus par SearchFormationsResponse
        metier_detecte: config.label,
        ville_reference: ville,
        rayon_applique: `${appliedRadiusKm} km`,
        mode: searchMode,
        count: finalResults.length,
        count_total: finalResults.length,

        formations: finalResults,

        warnings,
        debug,

        // meta (bonus, pas obligatoire)
        meta: {
          total: finalResults.length,
          sources: {
            refea: refeaResults.length,
            lba: allFormations.length,
            perplexity: perplexityResults.length,
          },
          config: {
            metier: config.label,
            ville,
            niveau: niveauFiltre,
            mode: searchMode,
          },
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[ERROR]", error);
    return new Response(JSON.stringify({ error: "Erreur serveur", details: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
