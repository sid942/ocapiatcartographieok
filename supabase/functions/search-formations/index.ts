import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ==================================================================================
// 0. CONFIGURATION & TYPES (LE CERVEAU STRUCTURÉ)
// ==================================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Définition stricte d'un profil métier
interface JobProfile {
  label: string;
  romes: string[];          // Codes officiels pour l'API
  radius: number;           // Rayon MAX strict en km
  keywords_required: string[]; // Au moins UN de ces mots doit être présent (ou le code ROME)
  keywords_banned: string[];   // Si un de ces mots est présent => POUBELLE DIRECTE
  priority_domains: string[];  // Pour l'IA (contexte)
}

// LA MATRICE DE VÉRITÉ (C'est ici que tu règles l'intelligence)
const JOB_CONFIG: Record<string, JobProfile> = {
  "silo": {
    label: "Agent de Silo",
    romes: ["A1416", "A1101"], // Conduite d'engins + Stockage
    radius: 70, // <--- TA DEMANDE : 70KM MAXIMUM
    keywords_required: ["silo", "grain", "céréal", "stockage", "agricole", "conduite"],
    keywords_banned: ["bâtiment", "maçon", "menuisier", "vendeur", "cuisine"], 
    priority_domains: ["AGRI_COEUR", "AGRI_CONDUITE"]
  },
  "chauffeur": {
    label: "Chauffeur Agricole",
    romes: ["A1101", "N4101"], 
    radius: 100,
    keywords_required: ["tracteur", "conduite", "agricole", "routier", "spl", "pl", "benne"],
    keywords_banned: ["bus", "tourisme", "taxi", "ambulance"],
    priority_domains: ["AGRI_CONDUITE", "TRANSPORT"]
  },
  "responsable_silo": {
    label: "Responsable de Silo",
    romes: ["A1301", "A1303"],
    radius: 150, // Plus rare, on cherche plus loin
    keywords_required: ["responsable", "gestion", "chef", "management", "exploitation"],
    keywords_banned: [],
    priority_domains: ["AGRI_ENCADREMENT"]
  },
  "maintenance": {
    label: "Maintenance Agricole",
    romes: ["I1602", "I1304"], // Maintenance Engins + Indus
    radius: 100,
    keywords_required: ["agricole", "tracteur", "machinisme", "agroéquipement", "maintenance"],
    keywords_banned: ["bâtiment", "informatique", "réseau", "avion", "auto ", "véhicule léger"], // On évite le garage auto du coin
    priority_domains: ["MAINTENANCE_AGRI"]
  },
  "technico": {
    label: "Technico-Commercial Agri",
    romes: ["D1407", "D1402"],
    radius: 100,
    keywords_required: ["technico", "commercial", "vente", "négociation", "agri"],
    keywords_banned: ["immobilier", "assurances", "banque", "mode"],
    priority_domains: ["COMMERCE_AGRI"]
  },
  "default": {
    label: "Recherche Générale",
    romes: ["A1416"],
    radius: 50,
    keywords_required: [],
    keywords_banned: [],
    priority_domains: ["AGRI_COEUR"]
  }
};

// ==================================================================================
// 1. OUTILS DE PRÉCISION (MATHS & LOGIQUE)
// ==================================================================================

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.round(R * c);
}

// Fonction de nettoyage de texte pour comparaison
function cleanText(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// LE JUGE IMPITOYABLE : Est-ce que cette formation est valide ?
function isFormationValid(formation: any, config: JobProfile, userLat: number, userLon: number): boolean {
  
  // 1. Check Géographique (Le plus rapide à vérifier)
  // Si LBA renvoie un truc à 80km et qu'on veut 70km, c'est NON.
  const dist = haversineDistance(userLat, userLon, formation.place.latitude, formation.place.longitude);
  if (dist > config.radius) return false;

  // Préparation du texte à analyser (Titre + Nom Organisme)
  const fullText = cleanText(`${formation.title} ${formation.company?.name || ""}`);

  // 2. Check des BANIS (Sécurité anti-pollution)
  // Ex: Si on cherche "Maintenance" et qu'on trouve "Bâtiment", on tue.
  for (const banned of config.keywords_banned) {
    if (fullText.includes(banned)) return false; 
  }

  // 3. Check de COHÉRENCE (Requis)
  // Si la liste est vide, on accepte tout (cas fallback), sinon il faut matcher.
  if (config.keywords_required.length > 0) {
    const hasKeyword = config.keywords_required.some(kw => fullText.includes(kw));
    // Si pas de mot clé, on vérifie si le code ROME match (si dispo dans la réponse LBA)
    const hasRome = formation.romes ? formation.romes.some((r: any) => config.romes.includes(r.code)) : false;
    
    if (!hasKeyword && !hasRome) return false;
  }

  return true;
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
    
    // Mapping immédiat pour normaliser
    return (data.results || []).map((item: any) => ({
      id: item.id || Math.random().toString(),
      title: item.title,
      company: item.company,
      place: {
        city: item.place?.city,
        latitude: item.place?.latitude || lat, // Fallback pour éviter crash calcul
        longitude: item.place?.longitude || lon,
        distance: item.place?.distance // Distance LBA (parfois approximative)
      },
      url: item.url,
      romes: item.romes,
      diplomaLevel: item.diplomaLevel // On garde le niveau si dispo
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
    const { metier, ville } = await req.json();
    
    // 1. Identification du profil métier (Mapping Intelligent)
    // On cherche la clé qui correspond le mieux à l'input utilisateur
    let jobKey = "default";
    const inputClean = cleanText(metier || "");
    
    if (inputClean.includes("silo") && inputClean.includes("responsable")) jobKey = "responsable_silo";
    else if (inputClean.includes("silo")) jobKey = "silo";
    else if (inputClean.includes("chauffeur") || inputClean.includes("conduite")) jobKey = "chauffeur";
    else if (inputClean.includes("maint")) jobKey = "maintenance";
    else if (inputClean.includes("comm") || inputClean.includes("technico")) jobKey = "technico";
    
    const config = JOB_CONFIG[jobKey] || JOB_CONFIG["default"];

    // 2. Géocodage
    const geoRep = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(ville)}&limit=1`);
    const geoData = await geoRep.json();
    if (!geoData.features?.length) throw new Error("Ville inconnue");
    
    const [userLon, userLat] = geoData.features[0].geometry.coordinates;
    const villeRef = geoData.features[0].properties.label;

    // 3. Récupération des données (LBA uniquement pour la fiabilité V1, IA possible en extension)
    const rawFormations = await fetchLBA(config, userLat, userLon);

    // 4. LE FILTRAGE INTELLIGENT
    const validFormations = rawFormations.filter((f: any) => isFormationValid(f, config, userLat, userLon));

    // 5. Formatage pour le frontend (Standardisation)
    const results = validFormations.map((f: any) => {
      // Recalcul précis de la distance
      const trueDist = haversineDistance(userLat, userLon, f.place.latitude, f.place.longitude);
      
      return {
        id: f.id,
        intitule: f.title,
        organisme: f.company?.name || "Organisme inconnu",
        ville: f.place.city,
        
        // --- AJOUT IMPORTANT : COORDONNÉES POUR LA CARTE ---
        lat: f.place.latitude,
        lon: f.place.longitude,
        // ----------------------------------------------------
        
        distance_km: trueDist,
        tags: [config.label, trueDist + " km"],
        url: f.url,
        niveau: f.diplomaLevel || "N/A"
      };
    });

    // Tri par distance
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