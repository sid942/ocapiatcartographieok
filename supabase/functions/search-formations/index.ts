// supabase/functions/search-formations/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { searchRefEA } from "./refeaSearch.ts";
import { filterByTrainingWhitelist } from "./trainingMatch.ts";

import {
  fetchPerplexityFormations,
  shouldEnrichWithPerplexity,
  mergeFormationsWithoutDuplicates,
  type PerplexityFormationInput,
} from "./perplexity_enrich.ts";

// ==================================================================================
// CORS
// ==================================================================================
const corsHeaders: Record<string, string> = {
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
  relaxed_min_score?: number;
  target_min_results: number;
  max_extra_radius_km: number;
  max_results?: number;
  soft_distance_cap_km?: number;
  hard_distance_cap_km?: number;
}

const DEBUG = false;
const SERVER_VERSION = "index.ts@2026-01-09-v3-fixed";
const FETCH_TIMEOUT_MS = 10_000;

// Scoring constants
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
// UTILS
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

function toFiniteNumber(x: any): number | null {
  const n = typeof x === "string" ? Number(x) : x;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function inferNiveauFromText(title: string): string {
  const t = cleanText(title);
  if (t.includes("doctorat")) return "6";
  if (t.includes("master") || t.includes("ingenieur") || t.includes("ingénieur")) return "6";
  if (t.includes("licence") || t.includes("bachelor") || t.includes("but ") || t.includes("b u t")) return "6";
  if (t.includes("bts") || t.includes("btsa") || t.includes("dut")) return "5";
  if (t.includes("bac pro") || t.includes("baccalaureat pro") || t.includes("brevet pro") || t.includes("bp ")) return "4";
  if (t.includes("cap") || t.includes("capa") || t.includes("bpa") || t.includes("bepa")) return "3";
  return "N/A";
}

function safeArray<T = any>(x: any): T[] {
  return Array.isArray(x) ? x : [];
}

function filterList(list: any[], pred: (x: any) => boolean) {
  const out: any[] = [];
  for (const x of safeArray(list)) {
    try {
      if (pred(x)) out.push(x);
    } catch {
      // ignore
    }
  }
  return out;
}

// ✅ whitelist Excel (fail-open pour ne pas casser la prod)
function whitelistOK(jobKey: string, intitule: string, organisme?: string): boolean {
  try {
    return filterByTrainingWhitelist(jobKey, intitule, organisme);
  } catch (e) {
    console.error("[WHITELIST] crash:", (e as any)?.message ?? String(e));
    return true;
  }
}

// ==================================================================================
// JOB PROFILES (✅ COMPLET + cohérent)
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
      "negociateur technico",
      "négociateur technico",
      "conseil et commercialisation",
      "solutions techniques",
      "conseil vente",
      "vente conseil",
      "ccst",
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
      "biens services pour l agriculture",
      "distribution agricole",
      "alimentation et boissons", // présent dans TES formations BTSA TC AB
    ],
    weak_keywords: ["commerce", "commercial", "vente"],
    context_keywords: ["agricole", "agroalimentaire", "alimentaire", "distribution"],
    banned_keywords: [
      "marketing",
      "acquisition",
      "digital",
      "numerique",
      "numérique",
      "e commerce",
      "e-commerce",
      "communication",
      "community",
      "ux",
      "ui",
      "growth",
      "immobilier",
      "assurance",
      "banque",
    ],
    banned_phrases: ["business developer", "business development", "developpement commercial", "développement commercial"],
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
    synonyms: ["reception", "réception", "expedition", "expédition", "sechage", "séchage", "cooperative", "coopérative", "grandes cultures"],
    weak_keywords: ["magasinage", "tri", "elevateur", "élévateur"],
    context_keywords: ["cgea", "industries agroalimentaires"],
    banned_keywords: ["eau", "assainissement", "gemeau", "gém eau", "rivière", "riviere"],
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
    banned_keywords: ["eau", "assainissement", "gemeau", "aquaculture", "pisciculture"],
    banned_phrases: [],
    min_score: 18,
    relaxed_min_score: 13,
    target_min_results: 10,
    max_extra_radius_km: 200,
    soft_distance_cap_km: 180,
    hard_distance_cap_km: 300,
  },

  chauffeur: {
    key: "chauffeur",
    label: "Chauffeur agricole",
    romes: ["A1101", "N4101"],
    fallback_romes: ["N4105"],
    radius_km: 70,
    strong_keywords: [
      "chauffeur",
      "tractoriste",
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
    synonyms: ["recolte", "récolte", "benne", "remorque", "engin agricole"],
    weak_keywords: ["conduite"], // faible ONLY (évite “conduite et gestion…”)
    context_keywords: ["cgea", "grandes cultures", "agroéquipement"],
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
    synonyms: ["expedition", "expédition", "reception", "réception", "approvisionnement", "planning", "transport"],
    weak_keywords: ["wms", "exploitation", "entrepot"],
    context_keywords: ["stockage", "distribution"],
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
    synonyms: ["entrepot", "entrepôt", "logistique", "stock", "preparation", "préparation", "picking", "manutention"],
    weak_keywords: ["quai", "emballage"],
    context_keywords: ["stockage", "distribution"],
    banned_keywords: ["vendeur", "jardinerie", "animalerie", "commerce"],
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
    label: "Responsable services techniques",
    romes: ["I1304", "I1302"],
    fallback_romes: ["I1305"],
    radius_km: 100,
    strong_keywords: ["maintenance", "electromecanique", "électromécanique", "mecanique", "mécanique", "automatisme"],
    synonyms: ["electrique", "électrique", "industrie", "industrielle", "depannage", "dépannage", "ms", "mspc"],
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
    context_keywords: ["qualité", "traçabilité"],
    banned_keywords: ["eau", "gemeau", "cosmetique", "cosmétique", "pharmaceutique"],
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
    context_keywords: ["qualité", "produits frais"],
    banned_keywords: ["eau", "gemeau"],
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
    weak_keywords: ["alimentaire", "industries agroalimentaires", "bio-industries", "bio industries"],
    context_keywords: ["production", "process"],
    banned_keywords: ["viticulture", "vigne", "vin", "horticulture", "paysage", "elevage", "élevage"],
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
    strong_keywords: ["technicien culture", "agronomie", "maraichage", "maraîchage", "grandes cultures"],
    synonyms: ["production vegetale", "production végétale", "sol", "fertilisation", "irrigation", "phytosanitaire"],
    weak_keywords: ["conseil", "agroecologie", "agroécologie"],
    context_keywords: ["culture", "agronomie"],
    banned_keywords: ["elevage", "élevage", "viticulture", "vigne", "vin", "foret", "forêt", "aquaculture", "pisciculture"],
    banned_phrases: [],
    min_score: 17,
    relaxed_min_score: 12,
    target_min_results: 10,
    max_extra_radius_km: 200,
    soft_distance_cap_km: 180,
    hard_distance_cap_km: 350,
  },
};

// ✅ ALIASES : protège contre les clés front différentes
const JOB_KEY_ALIASES: Record<string, string> = {
  "technico-commercial": "technico",
  "technico_commercial": "technico",
  "technicocommercial": "technico",
  "commercial export": "commercial_export",
  "commercial-export": "commercial_export",
  "agent de silo": "silo",
  "responsable silo": "responsable_silo",
  "chauffeur agricole": "chauffeur",
  "responsable services techniques": "maintenance",
  "controleur qualite": "controleur_qualite",
  "contrôleur qualité": "controleur_qualite",
  "conducteur de ligne": "conducteur_ligne",
  "technicien culture": "technicien_culture",
};

// ==================================================================================
// SCORING (LBA)
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

  for (const banned of config.banned_keywords) {
    if (includesWord(text, banned)) return { score: 0, reasons: ["Contenu non pertinent"] };
  }
  for (const phrase of config.banned_phrases) {
    if (includesPhrase(text, phrase)) return { score: 0, reasons: ["Contenu non pertinent"] };
  }

  let strongMatches = 0;
  for (const kw of config.strong_keywords) {
    if (includesWord(text, kw)) {
      strongMatches++;
      score += 8;
    }
  }
  if (strongMatches > 0) reasons.push(`Correspond au métier recherché (${strongMatches} critères)`);

  let synonymMatches = 0;
  for (const syn of config.synonyms) {
    if (includesWord(text, syn)) {
      synonymMatches++;
      score += 5;
    }
  }
  if (synonymMatches > 0) reasons.push(`Domaine proche (${synonymMatches} éléments)`);

  if (config.context_keywords?.length) {
    for (const ctx of config.context_keywords) {
      if (includesWord(text, ctx)) score += 3;
    }
  }

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
// GEOCODING (fallback)
// ==================================================================================
async function geocodeCity(ville: string): Promise<{ lat: number; lon: number; score: number; type: string } | null> {
  const q = ville.trim();
  if (!q) return null;

  const url =
    `https://nominatim.openstreetmap.org/search?` +
    `q=${encodeURIComponent(q)}` +
    `&format=json&addressdetails=1&limit=5`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "ocapiat-search/1.0 (supabase edge function)",
        "Accept": "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    if (!res.ok) return null;

    const arr = (await res.json().catch(() => null)) as any[] | null;
    if (!Array.isArray(arr) || arr.length === 0) return null;

    const best = [...arr].sort((a, b) => {
      const ia = toFiniteNumber(a?.importance) ?? 0;
      const ib = toFiniteNumber(b?.importance) ?? 0;
      if (ib !== ia) return ib - ia;
      const ra = toFiniteNumber(a?.place_rank) ?? 0;
      const rb = toFiniteNumber(b?.place_rank) ?? 0;
      return rb - ra;
    })[0];

    const lat = toFiniteNumber(best?.lat);
    const lon = toFiniteNumber(best?.lon);
    if (lat === null || lon === null) return null;

    const score = Math.max(0, Math.min(1, toFiniteNumber(best?.importance) ?? 0.5));
    const type = String(best?.type ?? best?.class ?? "nominatim");
    return { lat, lon, score, type };
  } catch {
    return null;
  }
}

// ==================================================================================
// LBA FETCH (ULTRA ROBUSTE)
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
      headers: { "Accept": "application/json" },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error(`[LBA] HTTP ${res.status} - ${txt.slice(0, 250)}`);
      return [];
    }

    const data = await res.json().catch(() => null);

    const results =
      (data && Array.isArray((data as any).results) && (data as any).results) ||
      (data && Array.isArray((data as any).formations) && (data as any).formations) ||
      (data && Array.isArray((data as any).data?.results) && (data as any).data.results) ||
      (data && Array.isArray((data as any).data?.formations) && (data as any).data.formations) ||
      [];

    return safeArray(results);
  } catch (err: any) {
    console.error("[LBA] Fetch error:", err?.message ?? String(err));
    return [];
  }
}

// ==================================================================================
// MAIN
// ==================================================================================
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return new Response(JSON.stringify({ error: "Body JSON invalide" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const metierIn = String((body as any)?.metier ?? "").trim();
    const ville = String((body as any)?.ville ?? "").trim();
    const niveauFiltre: NiveauFiltre = ((body as any)?.niveau ?? "all") as NiveauFiltre;
    const searchMode: Mode = ((body as any)?.mode ?? "strict+relaxed+fallback_rome") as Mode;

    if (!metierIn || !ville) {
      return new Response(JSON.stringify({ error: "Paramètres manquants: metier, ville requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ✅ resolve metier key
    const metierClean = cleanText(metierIn);
    const metier = JOB_KEY_ALIASES[metierClean] ?? metierIn;

    const config = JOB_PROFILES[metier];
    if (!config) {
      const keys = Object.keys(JOB_PROFILES);
      return new Response(
        JSON.stringify({
          error: `Métier inconnu: ${metierIn}`,
          hint: "Vérifie que METIERS(front) envoie une key existante dans JOB_PROFILES(back).",
          available: DEBUG ? keys : undefined,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // lat/lon (optionnels)
    const latFromReq = toFiniteNumber((body as any)?.lat);
    const lonFromReq = toFiniteNumber((body as any)?.lon);

    let userLat = latFromReq;
    let userLon = lonFromReq;

    const warnings: any = {};
    const debug: any = DEBUG
      ? {
          version: SERVER_VERSION,
          metier_in: metierIn,
          metier_key: metier,
          ville_in: ville,
          phases: [] as Phase[],
          sources: { refea_raw: 0, refea_ok: 0, lba_raw: 0, lba_ok: 0, perplexity_ok: 0 },
          geo: { used: false, score: null as number | null, type: null as string | null },
        }
      : undefined;

    // fallback geocode
    if (userLat === null || userLon === null) {
      const geo = await geocodeCity(ville);
      if (!geo) {
        return new Response(JSON.stringify({ error: "Impossible de géocoder la ville. Essaie une ville plus précise." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userLat = geo.lat;
      userLon = geo.lon;
      warnings.geocode_score = geo.score;
      warnings.geocode_type = geo.type;
      if (DEBUG && debug) debug.geo = { used: true, score: geo.score, type: geo.type };
    }

    let appliedRadiusKm = config.radius_km;
    const globalMaxResults = config.max_results ?? GLOBAL_MAX_RESULTS_DEFAULT;

    // ==================================================================================
    // 1) RefEA
    // ==================================================================================
    let refeaRaw: any[] = [];
    try {
      refeaRaw = safeArray(
        searchRefEA({
          jobLabel: config.label,
          ville,
          userLat: userLat!,
          userLon: userLon!,
          radiusKm: Math.min(config.radius_km + 50, 200),
          limit: REFEA_MAX,
        }),
      );
    } catch (e: any) {
      console.error("[RefEA] error:", e?.message ?? String(e));
      refeaRaw = [];
    }

    const refeaOk = filterList(refeaRaw, (f) =>
      whitelistOK(config.key, String(f?.intitule ?? ""), String(f?.organisme ?? "")),
    );

    if (DEBUG && debug) {
      debug.sources.refea_raw = refeaRaw.length;
      debug.sources.refea_ok = refeaOk.length;
    }

    // ==================================================================================
    // 2) LBA + scoring + whitelist
    // ==================================================================================
    const phases: Phase[] = [];
    if (searchMode.includes("strict")) phases.push("strict");
    if (searchMode.includes("relaxed")) phases.push("relaxed");
    if (searchMode.includes("fallback_rome")) phases.push("fallback");
    if (DEBUG && debug) debug.phases = phases;

    let lbaAccum: any[] = [];

    for (const phase of phases) {
      const romes = phase === "fallback" ? (config.fallback_romes ?? config.romes) : config.romes;
      const currentRadius = phase === "strict" ? config.radius_km : config.radius_km + config.max_extra_radius_km;
      appliedRadiusKm = Math.max(appliedRadiusKm, currentRadius);

      const lbaRaw = await fetchLBA({
        romes,
        latitude: userLat!,
        longitude: userLon!,
        radius: currentRadius,
        caller: "ocapiat",
      });

      if (DEBUG && debug) debug.sources.lba_raw += lbaRaw.length;

      for (const item of safeArray(lbaRaw)) {
        const intitule = String(item?.title ?? item?.intitule ?? "").trim();
        const organisme = String(item?.company?.name ?? item?.organisme ?? "").trim();
        if (!intitule) continue;

        if (!whitelistOK(config.key, intitule, organisme)) continue;

        const itemLat = toFiniteNumber(item?.place?.latitude ?? item?.lat);
        const itemLon = toFiniteNumber(item?.place?.longitude ?? item?.lon);
        if (itemLat === null || itemLon === null) continue;

        const distance = haversineKm(userLat!, userLon!, itemLat, itemLon);
        const hardCap = config.hard_distance_cap_km ?? 500;
        if (distance > hardCap) continue;

        const { score: baseScore, reasons } = computeMatchScore(intitule, organisme, config, phase);
        if (baseScore < ABSOLUTE_MIN_SCORE) continue;

        const finalScore = applyDistanceBonus(baseScore, distance, config);
        if (finalScore < ABSOLUTE_MIN_SCORE) continue;

        const niv = String(item?.diploma?.level ?? "").trim() || inferNiveauFromText(intitule) || "N/A";

        if (niveauFiltre !== "all") {
          if (niv === "N/A") continue;
          if (niv !== niveauFiltre) continue;
        }

        lbaAccum.push({
          id: item?.id || `lba_${crypto.randomUUID()}`,
          intitule,
          organisme,
          ville: String(item?.place?.city ?? item?.ville ?? ville),
          lat: itemLat,
          lon: itemLon,
          distance_km: round1(distance),
          rncp: item?.rncp_code || item?.rncp || "Non renseigné",
          modalite: "Non renseigné",
          alternance: "Non renseigné",
          categorie: "Diplôme / Titre",
          site_web: item?.company?.website || item?.site_web || null,
          url: item?.url || null,
          niveau: niv,
          match: { score: finalScore, reasons: reasons.length ? reasons : ["Formation pertinente"] },
          _source: "lba",
        });
      }

      lbaAccum.sort((a, b) => {
        const sa = a?.match?.score ?? 0;
        const sb = b?.match?.score ?? 0;
        if (sb !== sa) return sb - sa;
        return (a?.distance_km ?? 9999) - (b?.distance_km ?? 9999);
      });
      if (lbaAccum.length > LBA_MAX) lbaAccum = lbaAccum.slice(0, LBA_MAX);

      if (lbaAccum.length >= config.target_min_results) break;
    }

    if (DEBUG && debug) debug.sources.lba_ok = lbaAccum.length;

    // ==================================================================================
    // 3) MERGE RefEA + LBA
    // ==================================================================================
    let allFormations = mergeFormationsWithoutDuplicates(refeaOk, lbaAccum);

    // ==================================================================================
    // 4) PERPLEXITY (complément) + whitelist
    // ==================================================================================
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
          lat: userLat!,
          lon: userLon!,
          limit: Math.min(PPLX_MAX, Math.max(3, MIN_RESULTS_BEFORE_ENRICH - allFormations.length)),
          job_keywords: [...config.strong_keywords, ...config.synonyms].slice(0, 30),
          banned_keywords: [...config.banned_keywords, ...config.banned_phrases].slice(0, 40),
          hard_cap_km: getPerplexityHardCap(config),
          output_score: PERPLEXITY_SCORE,
        };

        const raw = await fetchPerplexityFormations(pplxInput);
        const hardCap = getPerplexityHardCap(config);

        perplexityResults = safeArray(raw)
          .filter((f: any) => f && typeof f?.distance_km === "number")
          .filter((f: any) => f.distance_km >= 0 && f.distance_km <= hardCap)
          .filter((f: any) => whitelistOK(config.key, String(f?.intitule ?? ""), String(f?.organisme ?? "")))
          .map((f: any) => ({
            ...f,
            rncp: f?.rncp ?? "Non renseigné",
            alternance: f?.alternance ?? "Non renseigné",
            modalite: f?.modalite ?? "Non renseigné",
            match: {
              score: PERPLEXITY_SCORE,
              reasons:
                Array.isArray(f?.match?.reasons) && f.match.reasons.length
                  ? f.match.reasons.slice(0, MAX_WHY_REASONS)
                  : ["Formation complémentaire vérifiée"],
            },
            _source: "perplexity",
          }))
          .slice(0, PPLX_MAX);

        if (perplexityResults.length > 0) {
          allFormations = mergeFormationsWithoutDuplicates(allFormations, perplexityResults);
        }
      } catch (e: any) {
        console.error("[Perplexity] error:", e?.message ?? String(e));
      }
    }

    if (DEBUG && debug) debug.sources.perplexity_ok = perplexityResults.length;

    // ==================================================================================
    // 5) FILTRE NIVEAU GLOBAL
    // ==================================================================================
    const count_total_avant_filtre = allFormations.length;

    let results = allFormations;
    if (niveauFiltre !== "all") {
      results = safeArray(results).filter((r: any) => r?.niveau === niveauFiltre);
    }

    // ==================================================================================
    // 6) TRI FINAL + CAP GLOBAL
    // ==================================================================================
    results.sort((a: any, b: any) => {
      const sa = a?.match?.score ?? 0;
      const sb = b?.match?.score ?? 0;
      if (sb !== sa) return sb - sa;

      const da = typeof a?.distance_km === "number" ? a.distance_km : 9999;
      const db = typeof b?.distance_km === "number" ? b.distance_km : 9999;
      return da - db;
    });

    if (results.length > globalMaxResults) results = results.slice(0, globalMaxResults);

    // ==================================================================================
    // 7) WARNINGS
    // ==================================================================================
    const soft = config.soft_distance_cap_km ?? (config.radius_km + 150);
    const maxDist = safeArray(results).reduce((m: number, r: any) => {
      const d = typeof r?.distance_km === "number" ? r.distance_km : 0;
      return Math.max(m, d);
    }, 0);

    warnings.far_results = results.length > 0 && maxDist > soft;
    warnings.no_relevant_results = results.length === 0;
    warnings.absolute_min_score = ABSOLUTE_MIN_SCORE;

    // ==================================================================================
    // RESPONSE
    // ==================================================================================
    return new Response(
      JSON.stringify({
        metier_detecte: config.label,
        ville_reference: ville,
        rayon_applique: `${appliedRadiusKm} km`,
        mode: searchMode,

        count_total: count_total_avant_filtre,
        count: results.length,

        formations: results,
        warnings,
        debug: DEBUG
          ? {
              ...debug,
              caps: { globalMaxResults, REFEA_MAX, LBA_MAX, PPLX_MAX },
              whitelist_enabled: true,
              version: SERVER_VERSION,
            }
          : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[ERROR]", error?.message ?? error);
    console.error("[ERROR_STACK]", error?.stack ?? "no-stack");

    return new Response(
      JSON.stringify({
        error: "Erreur serveur",
        details: error?.message ?? String(error),
        version: SERVER_VERSION,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
