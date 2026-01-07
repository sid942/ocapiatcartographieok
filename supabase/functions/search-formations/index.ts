import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ==================================================================================
// 0. CONFIGURATION & TYPES (LE CERVEAU STRUCTURÉ)
// ==================================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Mode de validation métier
type ValidationMode = "KEYWORD_ONLY" | "KEYWORD_OR_ROME" | "KEYWORD_AND_ROME";

// Définition stricte d'un profil métier (amélioré pour la pertinence)
interface JobProfile {
  label: string;
  romes: string[];          // Codes officiels pour l'API
  radius: number;           // Rayon MAX strict en km
  keywords_required: string[]; // Mots clés métier spécifiques
  keywords_banned: string[];   // Si un de ces mots est présent => POUBELLE DIRECTE
  priority_domains: string[];  // Pour l'IA (contexte)

  // NOUVEAUX PARAMETRES QUALITE
  validation_mode: ValidationMode; // Mode de validation
  min_keyword_matches?: number;    // Nombre minimum de keywords requis (défaut: 1)
  weak_keywords?: string[];        // Mots génériques qui ne suffisent pas seuls
  synonymes?: string[];            // Variantes utiles
  banned_phrases?: string[];       // Expressions à exclure en priorité
}

// LISTE GLOBALE D'EXCLUSION (appliquée à TOUS les métiers)
const BANNED_GLOBAL_RAW = [
  "sûreté", "systèmes de sûreté", "sécurité incendie", "agent de sécurité",
  "bâtiment", "maçon", "maçonnerie", "menuiserie", "menuisier", "plomberie", "plombier", "électricien", "peintre",
  "informatique", "réseau", "développeur", "cybersécurité", "administrateur système", "web", "logiciel",
  "banque", "assurance", "immobilier", "crédit",
  "cuisine", "restauration", "hôtellerie", "cuisinier", "serveur", "barman",
  "aéronautique", "avion", "aérien",
  "esthétique", "coiffure", "beauté",
  "transport urbain", "bus", "métro", "taxi", "ambulance", "VTC",
  "santé", "infirmier", "aide soignant", "médical",
  "enseignement", "professeur", "formateur",
  "juridique", "avocat", "notaire"
];

// LA MATRICE DE VÉRITÉ RENFORCÉE (Configuration métier stricte)
const JOB_CONFIG: Record<string, JobProfile> = {
  "silo": {
    label: "Agent de Silo",
    romes: ["A1416", "A1101"],
    radius: 70,
    validation_mode: "KEYWORD_ONLY",
    min_keyword_matches: 1,
    keywords_required: ["silo", "grain", "céréale", "stockage grain", "collecte céréales", "moissonneur", "séchoir"],
    weak_keywords: ["agricole"],
    keywords_banned: ["bâtiment", "menuisier", "vendeur", "cuisine", "commerce"],
    banned_phrases: ["silo à ciment", "silo béton"],
    synonymes: ["céréales", "grains", "stockage agricole"],
    priority_domains: ["AGRI_COEUR", "AGRI_CONDUITE"]
  },
  "chauffeur": {
    label: "Chauffeur Agricole",
    romes: ["A1101", "N4101"],
    radius: 100,
    validation_mode: "KEYWORD_ONLY",
    min_keyword_matches: 2,
    keywords_required: ["tracteur", "agricole", "benne céréalière", "moissonneuse", "engin agricole", "machinisme", "exploitation agricole"],
    weak_keywords: ["conduite", "spl", "permis"],
    keywords_banned: ["tourisme", "taxi", "ambulance", "transport urbain", "voyageurs"],
    banned_phrases: ["transport de personnes", "chauffeur de bus"],
    synonymes: ["conducteur tracteur", "conducteur engins agricoles"],
    priority_domains: ["AGRI_CONDUITE", "TRANSPORT"]
  },
  "responsable_silo": {
    label: "Responsable de Silo",
    romes: ["A1301", "A1303"],
    radius: 150,
    validation_mode: "KEYWORD_AND_ROME",
    min_keyword_matches: 2,
    keywords_required: ["silo", "stockage", "collecte", "céréales", "coopérative agricole", "négoce agricole"],
    weak_keywords: ["responsable", "gestion", "chef", "management"],
    keywords_banned: [],
    banned_phrases: [],
    synonymes: ["chef de silo", "responsable stockage", "gestionnaire silo"],
    priority_domains: ["AGRI_ENCADREMENT"]
  },
  "maintenance": {
    label: "Maintenance Agricole",
    romes: ["I1602", "I1304"],
    radius: 100,
    validation_mode: "KEYWORD_AND_ROME",
    min_keyword_matches: 2,
    keywords_required: ["agroéquipement", "machinisme agricole", "tracteur", "moissonneuse", "matériel agricole", "engins agricoles"],
    weak_keywords: ["maintenance", "technicien"],
    keywords_banned: ["bâtiment", "réseau", "avion", "véhicule léger", "automobile"],
    banned_phrases: ["maintenance informatique", "maintenance aéronautique"],
    synonymes: ["mécanique agricole", "réparation matériel agricole"],
    priority_domains: ["MAINTENANCE_AGRI"]
  },
  "technico": {
    label: "Technico-Commercial Agri",
    romes: ["D1407", "D1402"],
    radius: 100,
    validation_mode: "KEYWORD_AND_ROME",
    min_keyword_matches: 2,
    keywords_required: ["intrants", "semences", "phytosanitaire", "nutrition animale", "agrofourniture", "coopérative agricole", "négoce agricole", "engrais", "produits phytopharmaceutiques"],
    weak_keywords: ["commercial", "vente", "technico"],
    keywords_banned: ["immobilier", "assurance", "banque", "mode", "textile", "cosmétique"],
    banned_phrases: [],
    synonymes: ["conseiller agricole", "commercial agricole"],
    priority_domains: ["COMMERCE_AGRI"]
  },
  "default": {
    label: "Recherche Générale",
    romes: ["A1416"],
    radius: 50,
    validation_mode: "KEYWORD_OR_ROME",
    keywords_required: [],
    keywords_banned: [],
    priority_domains: ["AGRI_COEUR"]
  }
};

// ==================================================================================
// 1. OUTILS DE PRÉCISION (MATHS & LOGIQUE)
// ==================================================================================

// Mode debug (désactiver en prod)
const DEBUG = false;

// Pré-nettoyage de la liste globale d'exclusion
let BANNED_GLOBAL: string[] = [];

// Calcul de distance en km (FLOAT pour précision)
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // RETOURNE FLOAT, pas arrondi
}

// Fonction de nettoyage de texte pour comparaison (enlève accents, ponctuation, normalise espaces)
function cleanText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Enlève accents
    .replace(/['']/g, " ") // Remplace apostrophes par espace
    .replace(/[^a-z0-9\s]/g, "") // Enlève ponctuation
    .replace(/\s+/g, " ") // Réduit multi-espaces
    .trim();
}

// Nettoyage d'un tableau de keywords
function cleanKeywords(keywords: string[]): string[] {
  return keywords.map(kw => cleanText(kw)).filter(kw => kw.length >= 3); // Filtre mots trop courts
}

// Vérification si un mot entier est présent (évite "pl" qui match "diplome")
function includesWord(text: string, word: string): boolean {
  if (word.length < 3) return false; // Mots trop courts ignorés
  const regex = new RegExp(`\\b${word}\\b`, 'i');
  return regex.test(text);
}

// Vérification si une phrase est présente
function includesPhrase(text: string, phrase: string): boolean {
  return text.includes(phrase);
}

// Normalisation du niveau
function normalizeNiveau(niveau: string | null | undefined): '3' | '4' | '5' | '6' | 'all' {
  if (!niveau) return 'all';
  const n = niveau.toString().trim();
  if (n === '3' || n === '4' || n === '5' || n === '6') return n as '3' | '4' | '5' | '6';
  return 'all';
}

// Interface pour le résultat de validation (debug)
interface ValidationResult {
  valid: boolean;
  reason?: string;
}

// LE JUGE IMPITOYABLE V2 : Validation avec scoring intelligent
function isFormationValid(
  formation: any,
  config: JobProfile,
  userLat: number,
  userLon: number,
  cleanedBanned: string[],
  cleanedRequired: string[],
  cleanedWeak: string[],
  cleanedBannedPhrases: string[],
  cleanedSynonymes: string[]
): ValidationResult {

  const formationTitle = formation.title || "";

  // 1. CHECK GÉOGRAPHIQUE (le plus rapide)
  const dist = haversineKm(userLat, userLon, formation.place.latitude, formation.place.longitude);
  if (dist > config.radius) {
    if (DEBUG) console.log(`❌ [${formationTitle}] Distance: ${dist.toFixed(1)}km > ${config.radius}km`);
    return { valid: false, reason: "distance" };
  }

  // 2. PRÉPARATION DU TEXTE
  const fullText = cleanText(`${formation.title} ${formation.company?.name || ""}`);

  // 3. CHECK BANNISSEMENT GLOBAL (appliqué à tous les métiers)
  for (const banned of BANNED_GLOBAL) {
    if (includesWord(fullText, banned) || includesPhrase(fullText, banned)) {
      if (DEBUG) console.log(`❌ [${formationTitle}] Banned global: "${banned}"`);
      return { valid: false, reason: `banned_global: ${banned}` };
    }
  }

  // 4. CHECK BANNISSEMENT MÉTIER (phrases prioritaires)
  for (const phrase of cleanedBannedPhrases) {
    if (includesPhrase(fullText, phrase)) {
      if (DEBUG) console.log(`❌ [${formationTitle}] Banned phrase: "${phrase}"`);
      return { valid: false, reason: `banned_phrase: ${phrase}` };
    }
  }

  // 5. CHECK BANNISSEMENT MÉTIER (mots individuels)
  for (const banned of cleanedBanned) {
    if (includesWord(fullText, banned) || includesPhrase(fullText, banned)) {
      if (DEBUG) console.log(`❌ [${formationTitle}] Banned keyword: "${banned}"`);
      return { valid: false, reason: `banned_keyword: ${banned}` };
    }
  }

  // 6. SCORING KEYWORDS
  // Compter les matches sur keywords_required + synonymes
  const allPositiveKeywords = [...cleanedRequired, ...cleanedSynonymes];
  let keywordHits = 0;
  let weakHits = 0;
  const matchedKeywords: string[] = [];

  for (const kw of allPositiveKeywords) {
    if (includesWord(fullText, kw) || includesPhrase(fullText, kw)) {
      keywordHits++;
      matchedKeywords.push(kw);
    }
  }

  for (const weak of cleanedWeak) {
    if (includesWord(fullText, weak) || includesPhrase(fullText, weak)) {
      weakHits++;
    }
  }

  // 7. CHECK ROME
  const hasRome = formation.romes ? formation.romes.some((r: any) => config.romes.includes(r.code)) : false;

  // 8. APPLICATION DU MODE DE VALIDATION
  const minMatches = config.min_keyword_matches || 1;

  switch (config.validation_mode) {
    case "KEYWORD_ONLY":
      // Exiger des keywords, ET s'assurer que ce ne sont pas QUE des weak
      if (keywordHits < minMatches) {
        if (DEBUG) console.log(`❌ [${formationTitle}] KEYWORD_ONLY: ${keywordHits} < ${minMatches}`);
        return { valid: false, reason: `keyword_only: ${keywordHits} < ${minMatches}` };
      }
      // Si on a des weak keywords configurés, on veut au moins 1 keyword "fort"
      if (cleanedWeak.length > 0 && keywordHits === weakHits) {
        if (DEBUG) console.log(`❌ [${formationTitle}] Seulement des weak keywords`);
        return { valid: false, reason: "only_weak_keywords" };
      }
      if (DEBUG) console.log(`✅ [${formationTitle}] KEYWORD_ONLY OK: ${matchedKeywords.join(", ")}`);
      return { valid: true };

    case "KEYWORD_AND_ROME":
      // Exiger ROME ET keywords
      if (!hasRome) {
        if (DEBUG) console.log(`❌ [${formationTitle}] KEYWORD_AND_ROME: pas de ROME match`);
        return { valid: false, reason: "no_rome" };
      }
      if (keywordHits < minMatches) {
        if (DEBUG) console.log(`❌ [${formationTitle}] KEYWORD_AND_ROME: ${keywordHits} < ${minMatches}`);
        return { valid: false, reason: `keyword_and_rome: ${keywordHits} < ${minMatches}` };
      }
      if (DEBUG) console.log(`✅ [${formationTitle}] KEYWORD_AND_ROME OK: ROME + ${matchedKeywords.join(", ")}`);
      return { valid: true };

    case "KEYWORD_OR_ROME":
      // Accepter si keywords OU ROME, mais avec sécurité si ROME seul
      const hasEnoughKeywords = keywordHits >= minMatches && (cleanedWeak.length === 0 || keywordHits > weakHits);

      if (hasEnoughKeywords) {
        if (DEBUG) console.log(`✅ [${formationTitle}] KEYWORD_OR_ROME OK via keywords: ${matchedKeywords.join(", ")}`);
        return { valid: true };
      }

      if (hasRome) {
        // ROME seul : appliquer sécurité supplémentaire
        // Si on a des keywords configurés mais AUCUN ne matche, c'est suspect
        if (cleanedRequired.length > 0 && keywordHits === 0) {
          if (DEBUG) console.log(`❌ [${formationTitle}] ROME seul mais aucun keyword métier`);
          return { valid: false, reason: "rome_only_no_keywords" };
        }
        if (DEBUG) console.log(`✅ [${formationTitle}] KEYWORD_OR_ROME OK via ROME`);
        return { valid: true };
      }

      if (DEBUG) console.log(`❌ [${formationTitle}] KEYWORD_OR_ROME: ni keywords ni ROME`);
      return { valid: false, reason: "no_keyword_no_rome" };

    default:
      return { valid: false, reason: "invalid_mode" };
  }
}

// ==================================================================================
// 2. FETCHING OPTIMISÉ
// ==================================================================================

async function fetchLBA(config: JobProfile, lat: number, lon: number) {
  // On demande un rayon un peu plus large à l'API pour être sûr, puis on filtre nous-même strictement
  const searchRadius = config.radius + 20;
  const romes = config.romes.join(",");
  const url = `https://labonnealternance.apprentissage.beta.gouv.fr/api/v1/formations?romes=${romes}&latitude=${lat}&longitude=${lon}&radius=${searchRadius}&caller=ocapiat_app`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();

    // Mapping immédiat pour normaliser - IGNORE les items sans coords valides
    return (data.results || [])
      .filter((item: any) => {
        // CRITIQUE : ignorer les formations sans coordonnées valides
        const hasValidCoords = typeof item.place?.latitude === 'number' && typeof item.place?.longitude === 'number';
        return hasValidCoords;
      })
      .map((item: any) => ({
        id: item.id || crypto.randomUUID(), // ID stable
        title: item.title,
        company: item.company,
        place: {
          city: item.place.city,
          latitude: item.place.latitude, // PAS de fallback
          longitude: item.place.longitude, // PAS de fallback
          distance: item.place.distance
        },
        url: item.url,
        romes: item.romes,
        diplomaLevel: item.diplomaLevel
      }));
  } catch (e) {
    console.error("LBA Error:", e);
    return [];
  }
}

// ==================================================================================
// 3. HANDLER PRINCIPAL
// ==================================================================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    // INITIALISATION : Pré-nettoyage de la liste globale d'exclusion (une fois)
    if (BANNED_GLOBAL.length === 0) {
      BANNED_GLOBAL = cleanKeywords(BANNED_GLOBAL_RAW);
      if (DEBUG) console.log(`📋 BANNED_GLOBAL initialisé avec ${BANNED_GLOBAL.length} termes`);
    }

    const { metier, ville, niveau } = await req.json();

    // 1. Identification du profil métier (Mapping Intelligent)
    let jobKey = "default";
    const inputClean = cleanText(metier || "");

    if (inputClean.includes("silo") && inputClean.includes("responsable")) jobKey = "responsable_silo";
    else if (inputClean.includes("silo")) jobKey = "silo";
    else if (inputClean.includes("chauffeur") || inputClean.includes("conduite")) jobKey = "chauffeur";
    else if (inputClean.includes("maint")) jobKey = "maintenance";
    else if (inputClean.includes("comm") || inputClean.includes("technico")) jobKey = "technico";

    const config = JOB_CONFIG[jobKey] || JOB_CONFIG["default"];

    // Pré-nettoyage de TOUS les paramètres métier
    const cleanedRequired = cleanKeywords(config.keywords_required);
    const cleanedBanned = cleanKeywords(config.keywords_banned);
    const cleanedWeak = cleanKeywords(config.weak_keywords || []);
    const cleanedBannedPhrases = cleanKeywords(config.banned_phrases || []);
    const cleanedSynonymes = cleanKeywords(config.synonymes || []);

    if (DEBUG) {
      console.log(`\n🎯 Métier: ${config.label} (mode: ${config.validation_mode})`);
      console.log(`📍 Keywords requis: ${cleanedRequired.length}, Weak: ${cleanedWeak.length}, Synonymes: ${cleanedSynonymes.length}`);
    }

    // Normalisation du niveau
    const niveauFiltre = normalizeNiveau(niveau);

    // 2. Géocodage PRÉCIS avec type=municipality
    const geoRep = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(ville)}&limit=1&type=municipality`);
    const geoData = await geoRep.json();
    if (!geoData.features?.length) throw new Error("Ville inconnue");

    const [userLon, userLat] = geoData.features[0].geometry.coordinates;
    const villeRef = geoData.features[0].properties.label;

    // 3. Récupération des données (LBA)
    const rawFormations = await fetchLBA(config, userLat, userLon);
    if (DEBUG) console.log(`📦 Récupéré ${rawFormations.length} formations brutes depuis LBA`);

    // 4. FILTRAGE INTELLIGENT V2 avec scoring
    const validFormations = rawFormations.filter((f: any) => {
      const result = isFormationValid(
        f,
        config,
        userLat,
        userLon,
        cleanedBanned,
        cleanedRequired,
        cleanedWeak,
        cleanedBannedPhrases,
        cleanedSynonymes
      );
      return result.valid;
    });

    if (DEBUG) console.log(`✅ ${validFormations.length} formations valides après filtrage\n`);

    // 5. Formatage pour le frontend
    let results = validFormations.map((f: any) => {
      const trueDist = haversineKm(userLat, userLon, f.place.latitude, f.place.longitude);

      return {
        id: f.id,
        intitule: f.title,
        organisme: f.company?.name || "Organisme inconnu",
        ville: f.place.city,
        lat: f.place.latitude,
        lon: f.place.longitude,
        distance_km: Math.round(trueDist * 10) / 10,
        tags: [config.label, Math.round(trueDist * 10) / 10 + " km"],
        url: f.url,
        niveau: f.diplomaLevel || "N/A"
      };
    });

    // 6. FILTRE PAR NIVEAU si demandé
    if (niveauFiltre !== 'all') {
      results = results.filter((f: any) => f.niveau === niveauFiltre);
    }

    // 7. Tri par distance
    results.sort((a: any, b: any) => a.distance_km - b.distance_km);

    return new Response(JSON.stringify({
      metier_detecte: config.label,
      ville_reference: villeRef,
      rayon_applique: config.radius + " km",
      count: results.length,
      formations: results
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});