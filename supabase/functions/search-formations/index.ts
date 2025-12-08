import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ==================================================================================
// 1. DATA RNCP
// ==================================================================================
const RNCP_DB: Record<string, string> = {
    "AGROÉQUIPEMENT": "RNCP38234", "AGENT DE SILO": "RNCP28779", "GDEA": "RNCP38243",
    "MAINTENANCE DES MATÉRIELS": "RNCP37039", "CGEA": "RNCP31670", "PRODUCTIONS VÉGÉTALES": "RNCP38241",
    "AGRONOMIE": "RNCP35850", "ACSE": "RNCP38240", "RESPONSABLE DE SILO": "RNCP_BRANCHE",
    "INGÉNIEUR AGRI": "RNCP37682", "MASTER AGRO": "RNCP31913",
    "GTLA": "RNCP35364", "QLIO": "RNCP35367", "TSMEL": "RNCP34360", "AGENT MAGASINIER": "RNCP38413",
    "LOGISTIQUE": "RNCP38416", "PRÉPARATEUR DE COMMANDES": "RNCP38417", "CHAIN LOGISTIQUE": "RNCP31112",
    "MAINTENANCE DES SYSTÈMES": "RNCP35323", "MSPC": "RNCP35475", "GIM": "RNCP35365",
    "ÉLECTROTECHNIQUE": "RNCP35349", "CRSA": "RNCP35342", "PILOTE DE LIGNE": "RNCP35602",
    "CCST": "RNCP35801", "TECHNICO-COMMERCIAL": "RNCP38368", "NDRC": "RNCP38368", "TC": "RNCP35366",
    "COMMERCE INTERNATIONAL": "RNCP38372", "MANAGER INTERNATIONAL": "RNCP34206",
    "BIOQUALITÉ": "RNCP38235", "CONDUCTEUR ROUTIER": "RNCP35310", "AGRÉEUR": "RNCP_BRANCHE"
};

// ==================================================================================
// 2. CONFIG MÉTIERS
// ==================================================================================
const METIERS_CONFIG: Record<string, { diplomes: string[], contexte: string }> = {
    technico: { 
        diplomes: ["BTS CCST", "BTSA Technico-commercial", "BTS NDRC", "Licence Pro Technico-Commercial"],
        contexte: "Lycées Agricoles, CFA CCIP, Écoles de Commerce."
    },
    silo: { 
        diplomes: ["Bac Pro Agroéquipement", "CQP Agent de silo", "BTSA GDEA", "CAP Maintenance des matériels", "Bac Pro CGEA"],
        contexte: "Lycées Agricoles, CFPPA, MFR."
    },
    chauffeur: { 
        diplomes: ["CAP Conducteur Routier", "Titre Pro Conducteur transport", "CS Conduite machines agricoles"],
        contexte: "Aftral, Promotrans, Lycées Agricoles."
    },
    responsable_silo: { 
        diplomes: ["CS Responsable de silo", "Ingénieur Agronome", "Master Management Agroalimentaire", "BTSA GDEA"],
        contexte: "Écoles d'ingénieurs (ISARA, AgroParisTech...), Universités, CFPPA."
    },
    logistique: { 
        diplomes: ["BUT QLIO", "TSMEL", "BTS GTLA", "Master Logistique"],
        contexte: "IUT, Aftral, Promotrans, Universités."
    },
    magasinier: { 
        diplomes: ["Titre Pro Agent Magasinier", "Bac Pro Logistique", "CACES R489"],
        contexte: "AFPA, Aftral, Promotrans, Lycées Pros."
    },
    maintenance: { 
        diplomes: ["BTS Maintenance des Systèmes", "BUT GIM", "Bac Pro MSPC"],
        contexte: "Lycées Pros Industriels, CFAI, IUT."
    },
    qualite: { 
        diplomes: ["BTSA Bioqualité", "BUT Génie Biologique", "Licence Pro Qualité"],
        contexte: "ENIL, IUT, Lycées Agricoles."
    },
    agreeur: { 
        diplomes: ["CQP Agréeur", "Formation Classement des grains", "CS Stockage"],
        contexte: "CFPPA Céréaliers, Organismes de la branche."
    },
    ligne: { 
        diplomes: ["Pilote de ligne de production", "Bac Pro PSPA", "CQP Conducteur de ligne"],
        contexte: "CFAI, Lycées Pros Industriels."
    },
    culture: { 
        diplomes: ["BTSA APV", "BTSA ACSE", "Ingénieur Agri"],
        contexte: "Lycées Agricoles, CFAA."
    },
    export: { 
        diplomes: ["BTS Commerce International", "BUT TC (International)", "Master Commerce International"],
        contexte: "Lycées, IUT, Business Schools."
    }
};

// --- OUTILS ---
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round(R * c);
}

function detecterMetier(input: string): string {
    const m = input.toLowerCase();
    if (m.match(/silo|grain/)) return m.includes("responsable") ? "responsable_silo" : "silo";
    if (m.match(/culture|végétal|céréale|agronomie/)) return "culture";
    if (m.match(/chauffeur|conducteur|routier/)) return m.includes("ligne") ? "ligne" : "chauffeur";
    if (m.match(/maintenance|technique/)) return "maintenance";
    if (m.match(/logistique|supply/)) return m.includes("responsable") ? "logistique" : "magasinier";
    if (m.match(/magasinier|cariste/)) return "magasinier";
    if (m.match(/commercial|technico/)) return m.includes("export") ? "export" : "technico";
    if (m.match(/qualité|contrôle/)) return "qualite";
    if (m.match(/agréeur/)) return "agreeur";
    if (m.match(/ligne|production/)) return "ligne";
    return "technico";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { metier, ville, niveau } = await req.json();
    if (!metier || !ville) throw new Error("Paramètres manquants");

    const perplexityApiKey = Deno.env.get("PERPLEXITY_API_KEY");
    if (!perplexityApiKey) throw new Error("Clé API manquante");

    // 1. API GOUV (GPS UTILISATEUR)
    let userLat = 0, userLon = 0;
    let villeNomOfficiel = ville;
    let villeContext = "";

    try {
        // On cherche la ville. Si c'est "Fresnes", l'API Gouv va sortir celle du 94 en premier car plus peuplée.
        const geoRep = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(ville)}&limit=1`);
        const geoData = await geoRep.json();
        if (geoData.features?.length > 0) {
            const f = geoData.features[0];
            userLon = f.geometry.coordinates[0]; 
            userLat = f.geometry.coordinates[1];
            villeNomOfficiel = f.properties.city; // ex: "Fresnes"
            const postcode = f.properties.postcode; // ex: "94260"
            const context = f.properties.context; // ex: "94, Val-de-Marne, Île-de-France"
            villeContext = `${villeNomOfficiel} (${context})`; // On verrouille le contexte
            console.log(`📍 User localisé : ${villeContext}`);
        }
    } catch { villeContext = ville; }

    // 2. CONFIG IA
    const metierKey = detecterMetier(metier);
    const config = METIERS_CONFIG[metierKey];
    
    // 3. CONSTRUCTION DE LA ZONE (C'est ici qu'on avait le bug "Lost Anchor")
    let zonePrompt = "";
    
    const isRuralOnly = ["silo", "culture", "agreeur", "chauffeur"].includes(metierKey);
    // Détection IDF basée sur le code postal (91, 92, 93, 94, 95, 75, 77, 78) ou les noms
    const isIDF = villeContext.match(/9[1-5]|7[578]|paris|fresnes|creteil|massy|cergy/i);
    
    if (isRuralOnly) {
        if (isIDF) {
            // Si on est en IDF pour un métier rural -> On force la grande couronne AVEC le nom de la ville de départ
            zonePrompt = `Périphérie de ${villeContext} (Focus sur Seine-et-Marne 77, Yvelines 78, Essonne 91)`;
        } else {
            // Sinon -> Périphérie classique
            zonePrompt = `Périphérie rurale de ${villeContext} (Rayon 50km)`;
        }
    } else if (metierKey === "responsable_silo") {
        zonePrompt = `${villeContext} et sa région (Intra-muros + Périphérie)`;
    } else {
        zonePrompt = `${villeContext} (Rayon 30km)`;
    }

    const systemPrompt = `Tu es un MOTEUR DE RECHERCHE D'ÉTABLISSEMENTS.
    Trouve les établissements réels. 
    JSON STRICT: { "formations": [{ "intitule": "", "organisme": "", "ville": "", "rncp": "", "modalite": "", "niveau": "" }] }`;

    // On injecte le villeContext qui contient le département (ex: Fresnes 94) pour que l'IA ne cherche pas Fresnes (02)
    const userPrompt = `Trouve 15 formations pour : "${config.diplomes.join(", ")}" 
    ZONE DE RECHERCHE : ${zonePrompt}.
    CONTEXTE : ${config.contexte}.
    Règle : Donne le NOM EXACT et la VILLE. JSON uniquement.`;

    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${perplexityApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        temperature: 0.1,
        max_tokens: 4000
      }),
    });

    if (!perplexityResponse.ok) throw new Error(`Erreur API: ${perplexityResponse.status}`);
    const data = await perplexityResponse.json();
    
    // 4. PARSING
    let result;
    try {
        const clean = data.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
        const start = clean.indexOf('{');
        const end = clean.lastIndexOf('}');
        result = JSON.parse(clean.substring(start, end + 1));
    } catch { result = { formations: [] }; }

    // 5. VALIDATION & FILTRAGE (RETOUR DU FILET DE SÉCURITÉ V32)
    if (result.formations && result.formations.length > 0) {
        
        const verificationPromises = result.formations.map(async (f: any) => {
            try {
                let query = `${f.organisme} ${f.ville}`;
                let apiRep = await fetch(`https://api-adresse.data.gouv.