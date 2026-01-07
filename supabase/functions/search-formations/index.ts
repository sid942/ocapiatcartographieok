import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * OCAPIAT - Search Formations (LBA)
 * Objectif : résultats pertinents et "humains" pour une utilisation au téléphone.
 * Stratégie : exclusions dures + scoring + rayon adaptatif + niveau normalisé.
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

interface JobProfile {
  label: string;
  romes: string[];
  // Rayon "attendu" (humain). On pourra élargir si pas assez de résultats.
  radius_km: number;

  // Mots-clés "forts" (spécifiques métier)
  strong_keywords: string[];
  // Synonymes utiles
  synonyms: string[];
  // Mots-clés faibles (génériques)
  weak_keywords: string[];

  // Exclusions spécifiques métier
  banned_keywords: string[];
  banned_phrases: string[];

  // Réglages pertinence
  // score minimal pour qu'on garde l’item
  min_score: number;

  // nombre de résultats minimum souhaité avant d'élargir le rayon
  target_min_results: number;

  // Rayon max d'élargissement (ex: +80 km)
  max_extra_radius_km: number;
}

// Exclusions globales : uniquement les domaines clairement hors sujet
const BANNED_GLOBAL_RAW = [
  // sûreté / sécurité privée
  "surete", "systemes de surete", "agent de securite", "securite incendie",
  // bâtiment
  "batiment", "macon", "maconnerie", "menuiserie", "plomberie", "electricien", "peintre",
  // IT
  "informatique", "reseau", "developpeur", "cybersecurite", "administrateur systeme", "web", "logiciel",
  // banque/assurance/immobilier
  "banque", "assurance", "immobilier", "credit",
  // hôtellerie/restauration
  "cuisine", "restauration", "hotellerie", "cuisinier", "serveur", "barman",
  // santé
  "infirmier", "aide soignant", "medical",
  // juridique
  "avocat", "notaire",
];

// IMPORTANT : ce mapping n’est pas "trop restrictif".
// Il donne une direction. Le scoring permettra de garder des parcours possibles.
const JOB_CONFIG: Record<string, JobProfile> = {
  silo: {
    label: "Agent de Silo",
    romes: ["A1416", "A1101"],
    radius_km: 70,

    // Spécifiques silo/grains (garder assez large)
    strong_keywords: [
      "silo", "grains", "grain", "cereales", "cereal", "collecte",
      "stockage", "manutention", "sechage", "tri", "trieur",
      "ensilage", "reception", "expedition", "coop", "cooperative"
    ],
    synonyms: ["stockage agricole", "collecte cereales", "silo agricole", "cerealiers"],
    weak_keywords: ["agricole", "logistique", "magasin", "cariste"],

    banned_keywords: ["ciment", "beton"],
    banned_phrases: ["silo a ciment", "silo beton"],

    // pas trop haut : on veut du rappel
    min_score: 35,
    target_min_results: 8,
    max_extra_radius_km: 120,
  },

  chauffeur: {
    label: "Chauffeur Agricole",
    romes: ["A1101", "N4101"],
    radius_km: 100,

    strong_keywords: [
      "tracteur", "benne", "remorque", "moissonneuse", "ensileuse",
      "engin", "engins", "materiel agricole", "machinisme",
      "transport cereales", "cereales", "recolte"
    ],
    synonyms: ["conducteur tracteur", "conduite d engins agricoles"],
    weak_keywords: ["conduite", "permis", "transport"],

    banned_keywords: ["bus", "taxi", "ambulance", "vtc", "tourisme", "voyageurs"],
    banned_phrases: ["transport de personnes", "chauffeur de bus"],

    min_score: 35,
    target_min_results: 10,
    max_extra_radius_km: 150,
  },

  responsable_silo: {
    label: "Responsable de Silo",
    romes: ["A1301", "A1303"],
    radius_km: 150,

    strong_keywords: [
      "silo", "stockage", "collecte", "cereales", "cooperative", "negoce",
      "qualite", "reception", "expedition", "sechage", "tri"
    ],
    synonyms: ["chef de silo", "responsable stockage", "gestionnaire silo"],
    weak_keywords: ["responsable", "gestion", "chef", "management", "pilotage"],

    banned_keywords: [],
    banned_phrases: [],

    min_score: 40,
    target_min_results: 6,
    max_extra_radius_km: 200,
  },

  maintenance: {
    label: "Maintenance Agricole",
    romes: ["I1602", "I1304"],
    radius_km: 100,

    strong_keywords: [
      "machinisme", "materiel agricole", "tracteur", "moissonneuse",
      "agroequipement", "hydraulique", "mecanique", "diagnostic"
    ],
    synonyms: ["mecanique agricole", "reparation materiel agricole"],
    weak_keywords: ["maintenance", "technicien"],

    banned_keywords: ["vehicule leger", "automobile", "aeronautique", "avion"],
    banned_phrases: ["maintenance informatique", "maintenance aeronautique"],

    min_score: 40,
    target_min_results: 8,
    max_extra_radius_km: 150,
  },

  technico: {
    label: "Technico-Commercial Agri",
    romes: ["D1407", "D1402"],
    radius_km: 100,

    strong_keywords: [
      "semences", "intrants", "engrais", "phytosanitaire",
      "nutrition animale", "agrofourniture", "cooperative", "negoce agricole",
      "conseil agricole"
    ],
    synonyms: ["commercial agricole", "conseiller agricole", "technico commercial agricole"],
    weak_keywords: ["commercial", "vente", "negociation"],

    banned_keywords: ["immobilier", "assurance", "banque", "cosmetique", "mode", "textile"],
    banned_phrases: [],

    min_score: 40,
    target_min_results: 10,
    max_extra_radius_km: 150,
  },

  default: {
    label: "Recherche Générale",
    romes: ["A1416"],
    radius_km: 50,

    strong_keywords: [],
    synonyms: [],
    weak_keywords: [],

    banned_keywords: [],
    banned_phrases: [],

    min_score: 20,
    target_min_results: 8,
    max_extra_radius_km: 100,
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
    .replace(/[\u0300-\u036f]/g, "")         // accents
    .replace(/[’']/g, " ")                   // apostrophes
    .replace(/[^a-z0-9\s]/g, " ")            // ponctuation -> espace
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
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.sin(dLon / 2) ** 2 * Math.cos(lat2 * Math.PI / 180);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Niveau : tente d’utiliser diplomaLevel si propre, sinon infère via intitulé
function inferNiveau(diplomaLevel: any, title: string): string {
  const dl = (diplomaLevel ?? "").toString().trim();
  if (dl === "3" || dl === "4" || dl === "5" || dl === "6") return dl;

  const t = cleanText(title);

  // Heuristiques usuelles
  if (includesPhrase(t, "cap")) return "3";
  if (includesPhrase(t, "bp ") || includesPhrase(t, "brevet professionnel")) return "4";
  if (includesPhrase(t, "bac pro") || includesPhrase(t, "baccalaureat professionnel")) return "4";
  if (includesPhrase(t, "bts") || includesPhrase(t, "btsa")) return "5";
  if (includesPhrase(t, "licence") || includesPhrase(t, "but") || includesPhrase(t, "dut")) return "6";
  if (includesPhrase(t, "titre professionnel") || includesPhrase(t, "tp ")) {
    // TP varie : par défaut N/A (ou 4/5 selon info absente)
    return "N/A";
  }
  return "N/A";
}

function normalizeNiveauFilter(n: any): NiveauFiltre {
  const s = (n ?? "all").toString().trim();
  if (s === "3" || s === "4" || s === "5" || s === "6") return s;
  return "all";
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
  // prêt pour le futur "?"
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
  const title = raw.title || "";
  const companyName = raw.company?.name || "Organisme inconnu";
  const city = raw.place?.city ?? null;

  const lat = typeof raw.place?.latitude === "number" ? raw.place.latitude : null;
  const lon = typeof raw.place?.longitude === "number" ? raw.place.longitude : null;

  const fullText = cleanText(`${title} ${companyName}`);

  // Exclusions globales
  const globalBan = isGloballyBanned(fullText);
  if (globalBan) {
    if (DEBUG) console.log("BAN global:", globalBan, title);
    return null;
  }

  // Exclusions métier
  for (const p of config.banned_phrases.map(cleanText).filter(Boolean)) {
    if (includesPhrase(fullText, p)) return null;
  }
  for (const b of config.banned_keywords.map(cleanText).filter(Boolean)) {
    if (includesWord(fullText, b) || includesPhrase(fullText, b)) return null;
  }

  // Distance : si coords manquantes, on garde mais non cartographiable, et score pénalisé
  let dist: number | null = null;
  if (lat !== null && lon !== null) {
    dist = haversineKm(userLat, userLon, lat, lon);
  }

  // Scoring
  let score = 0;
  const reasons: string[] = [];

  // ROME match : signal fort (mais pas suffisant seul)
  const hasRome = Array.isArray(raw.romes)
    ? raw.romes.some((r: any) => config.romes.includes(r.code))
    : false;

  if (hasRome) {
    score += 25;
    reasons.push("ROME compatible");
  }

  // Strong keywords
  const strong = config.strong_keywords.map(cleanText).filter(Boolean);
  const synonyms = config.synonyms.map(cleanText).filter(Boolean);
  const weak = config.weak_keywords.map(cleanText).filter(Boolean);

  let strongHits = 0;
  for (const kw of strong) {
    if (includesWord(fullText, kw) || includesPhrase(fullText, kw)) strongHits++;
  }
  if (strongHits > 0) {
    score += Math.min(40, strongHits * 12);
    reasons.push(`${strongHits} mot(s) clé(s) métier`);
  }

  let synHits = 0;
  for (const kw of synonyms) {
    if (includesPhrase(fullText, kw) || includesWord(fullText, kw)) synHits++;
  }
  if (synHits > 0) {
    score += Math.min(20, synHits * 8);
    reasons.push("synonyme(s) métier");
  }

  let weakHits = 0;
  for (const kw of weak) {
    if (includesWord(fullText, kw) || includesPhrase(fullText, kw)) weakHits++;
  }
  if (weakHits > 0) {
    score += Math.min(10, weakHits * 3);
  }

  // Garde-fou : si ROME seul sans aucun signal métier (strong/syn), on pénalise fort
  if (hasRome && strongHits === 0 && synHits === 0) {
    score -= 20;
    reasons.push("ROME seul (prudence)");
  }

  // Distance : bonus proximité (si coords)
  if (dist !== null) {
    // Bonus si très proche
    if (dist <= 10) score += 8;
    else if (dist <= 25) score += 5;
    else if (dist <= 50) score += 2;

    // Pénalité douce si loin (mais dans rayon)
    if (dist > config.radius_km) {
      // on gardera si rayon élargi, mais moins bon
      score -= 8;
      reasons.push("hors rayon initial (élargissement)");
    }
  } else {
    // Non géolocalisé : on garde mais pénalise
    score -= 10;
    reasons.push("non géolocalisé");
  }

  return {
    id: raw.id || crypto.randomUUID(),
    title,
    companyName,
    city,
    lat,
    lon,
    url: raw.url || null,
    romes: raw.romes || null,
    diplomaLevel: raw.diplomaLevel,
    distanceKm: dist,

    score,
    reasons,
  };
}

// ==================================================================================
// 4) LBA FETCH + RAYON ADAPTATIF
// ==================================================================================

async function fetchLBA(romes: string[], lat: number, lon: number, radiusKm: number) {
  const url = `https://labonnealternance.apprentissage.beta.gouv.fr/api/v1/formations?romes=${encodeURIComponent(
    romes.join(",")
  )}&latitude=${lat}&longitude=${lon}&radius=${radiusKm}&caller=ocapiat_app`;

  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.results) ? data.results : [];
}

async function getScoredResultsAdaptive(
  config: JobProfile,
  userLat: number,
  userLon: number
): Promise<{ scored: ScoredFormation[]; appliedRadius: number; expanded: boolean }> {
  const baseRadius = config.radius_km;

  // On va chercher progressivement plus loin si pas assez de résultats pertinents
  const steps = [0, 30, 60, 100, 150, 200].filter((s) => s <= config.max_extra_radius_km);
  let finalScored: ScoredFormation[] = [];
  let appliedRadius = baseRadius;
  let expanded = false;

  for (const extra of steps) {
    appliedRadius = baseRadius + extra;
    expanded = extra > 0;

    const raw = await fetchLBA(config.romes, userLat, userLon, appliedRadius);
    if (DEBUG) console.log("LBA raw:", raw.length, "radius:", appliedRadius);

    const scored = raw
      .map((r: any) => scoreFormation(r, config, userLat, userLon))
      .filter(Boolean) as ScoredFormation[];

    // Filtre score minimal (mais pas brutalement haut)
    const kept = scored.filter((s) => s.score >= config.min_score);

    // Dedup grossier : (title+org+city)
    const seen = new Set<string>();
    const dedup = kept.filter((s) => {
      const key = `${cleanText(s.title)}|${cleanText(s.companyName)}|${cleanText(s.city || "")}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Tri par score puis distance
    dedup.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const da = a.distanceKm ?? 9999;
      const db = b.distanceKm ?? 9999;
      return da - db;
    });

    finalScored = dedup;

    // Si on a assez de résultats, on s’arrête
    if (finalScored.length >= config.target_min_results) break;
  }

  return { scored: finalScored, appliedRadius, expanded };
}

// ==================================================================================
// 5) HANDLER
// ==================================================================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { metier, ville, niveau } = await req.json();

    // 1) Detect jobKey (simple mais robuste)
    const input = cleanText(metier || "");
    let jobKey: string = "default";

    if (input.includes("silo") && input.includes("responsable")) jobKey = "responsable_silo";
    else if (input.includes("silo")) jobKey = "silo";
    else if (input.includes("chauffeur") || input.includes("conduite")) jobKey = "chauffeur";
    else if (input.includes("maint")) jobKey = "maintenance";
    else if (input.includes("technico") || input.includes("commercial")) jobKey = "technico";

    const config = JOB_CONFIG[jobKey] || JOB_CONFIG.default;

    // 2) Geocoding (municipality)
    const geoRep = await fetch(
      `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(ville)}&limit=1&type=municipality`
    );
    const geoData = await geoRep.json();
    if (!geoData.features?.length) throw new Error("Ville inconnue");

    const [userLon, userLat] = geoData.features[0].geometry.coordinates;
    const villeRef = geoData.features[0].properties.label;

    // 3) Get scored results with adaptive radius
    const { scored, appliedRadius, expanded } = await getScoredResultsAdaptive(config, userLat, userLon);

    // 4) Build frontend results
    const niveauFiltre = normalizeNiveauFilter(niveau);

    let results = scored.map((s) => {
      const dist = s.distanceKm;
      const distRounded = dist === null ? 999 : round1(dist);

      const computedNiveau = inferNiveau(s.diplomaLevel, s.title);

      return {
        id: s.id,
        intitule: s.title,
        organisme: s.companyName,
        ville: s.city,

        lat: s.lat ?? undefined,
        lon: s.lon ?? undefined,

        distance_km: dist === null ? 999 : distRounded,

        tags: [
          config.label,
          (dist === null ? "Non géolocalisé" : `${distRounded} km`),
        ],

        url: s.url,
        niveau: computedNiveau,

        // OPTIONNEL (pour le futur "?") — si tu veux zéro impact frontend, dis-moi et je le supprime
        match: expanded
          ? { score: s.score, reasons: s.reasons.slice(0, 3) }
          : { score: s.score, reasons: s.reasons.slice(0, 3) },
      };
    });

    // 5) Filter by niveau (sur niveau normalisé)
    if (niveauFiltre !== "all") {
      results = results.filter((r: any) => r.niveau === niveauFiltre);
    }

    // 6) Sort distance asc (mais les non géolocalisés à la fin)
    results.sort((a: any, b: any) => {
      const da = typeof a.distance_km === "number" ? a.distance_km : 9999;
      const db = typeof b.distance_km === "number" ? b.distance_km : 9999;
      return da - db;
    });

    // 7) Response
    return new Response(
      JSON.stringify({
        metier_detecte: config.label,
        ville_reference: villeRef,
        rayon_applique: `${appliedRadius} km${expanded ? " (élargi automatiquement)" : ""}`,
        count: results.length,
        formations: results,
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
