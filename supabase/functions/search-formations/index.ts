import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ==================================================================================
// 1. DATA RNCP (POUR ÊTRE CARRÉ AVEC OCAPIAT)
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
// 2. CONFIG MÉTIERS (AIDE À LA DÉCISION)
// ==================================================================================
const METIERS_CONFIG: Record<string, { contexte: string }> = {
    technico: { contexte: "Lycées Agricoles, CFA, Écoles de Commerce." },
    silo: { contexte: "Lycées Agricoles, CFPPA, MFR." },
    chauffeur: { contexte: "Aftral, Promotrans, CFPPA, Lycées Agricoles." },
    responsable_silo: { contexte: "Écoles d'ingénieurs (ISARA, ESA...), Universités, CFPPA." },
    logistique: { contexte: "IUT, Aftral, Promotrans, Universités, IAE." },
    magasinier: { contexte: "AFPA, Aftral, Promotrans, Lycées Pros." },
    maintenance: { contexte: "Lycées Pros, CFAI, IUT." },
    qualite: { contexte: "ENIL, IUT, Lycées Agricoles." },
    agreeur: { contexte: "CFPPA Céréaliers." },
    ligne: { contexte: "CFAI, Lycées Pros." },
    culture: { contexte: "Lycées Agricoles, CFAA." },
    export: { contexte: "Lycées, IUT, Business Schools." }
};

// --- OUTILS MATHÉMATIQUES (POUR NE PAS MENTIR SUR LA DISTANCE) ---
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
    if (m.match(/chauffeur|conducteur|routier/)) return "chauffeur";
    if (m.match(/maintenance|technique/)) return "maintenance";
    if (m.match(/logistique|supply/)) return "logistique";
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
    try {
        const geoRep = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(ville)}&limit=1`);
        const geoData = await geoRep.json();
        if (geoData.features?.length > 0) {
            const coords = geoData.features[0].geometry.coordinates;
            userLon = coords[0]; userLat = coords[1];
        }
    } catch {}

    // 2. CONFIG & ZONE
    const metierKey = detecterMetier(metier);
    const config = METIERS_CONFIG[metierKey];
    
    // Stratégie géographique : Si rural + grande ville = on pousse vers la sortie
    let zonePrompt = `${ville} et sa région (Rayon 50km)`;
    const isRuralOnly = ["silo", "culture", "agreeur", "chauffeur"].includes(metierKey);
    const isBigCity = ville.toLowerCase().match(/paris|lyon|marseille|lille|bordeaux|nantes|fresnes|massy|creteil|toulouse/);
    
    if (isRuralOnly && isBigCity) {
         zonePrompt = "Périphérie rurale et départements limitrophes (max 80km)";
    }

    // ==================================================================================
    // 3. LE PROMPT "CONSEILLER EXPERT" (C'est lui qui débloque Lyon)
    // ==================================================================================
    const systemPrompt = `Tu es un conseiller expert en formation.
    Ton but : Trouver des formations RÉELLES pour le métier demandé.
    
    Raisonnement :
    1. Si le métier est "Cadre" (ex: Responsable Silo), cherche les Écoles d'Ingénieurs, IUT, Masters.
    2. Si le métier est "Ouvrier" (ex: Agent), cherche les Lycées Agricoles, CFPPA, MFR.
    3. Si le diplôme exact n'existe pas, trouve le diplôme transversal le plus proche (ex: Maintenance, Logistique).
    
    JSON STRICT UNIQUEMENT :
    { "formations": [{ "intitule": "", "organisme": "", "ville": "", "rncp": "", "modalite": "", "niveau": "" }] }`;

    const userPrompt = `Trouve 15 formations pour devenir "${metier}" autour de "${zonePrompt}".
    CONTEXTE CIBLE : ${config.contexte}.
    
    RÈGLES :
    - Cherche large : Public, Privé, Universités, CFA.
    - Donne le NOM EXACT de l'école et sa VILLE.
    - JSON uniquement.`;

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
    
    // 4. PARSING ROBUSTE
    let result;
    try {
        const clean = data.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
        const start = clean.indexOf('{');
        const end = clean.lastIndexOf('}');
        result = JSON.parse(clean.substring(start, end + 1));
    } catch { result = { formations: [] }; }

    // ==================================================================================
    // 5. LE FILET DE SÉCURITÉ (API GOUV + FILTRES)
    // ==================================================================================
    if (result.formations && result.formations.length > 0) {
        
        // Vérification des adresses en parallèle
        const verificationPromises = result.formations.map(async (f: any) => {
            try {
                // Recherche exacte
                let query = `${f.organisme} ${f.ville}`;
                let apiRep = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=1`);
                let apiData = await apiRep.json();

                // Fallback ville seule
                if (!apiData.features?.length) {
                    apiRep = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(f.ville)}&type=municipality&limit=1`);
                    apiData = await apiRep.json();
                }

                if (apiData.features?.length > 0) {
                    const coords = apiData.features[0].geometry.coordinates;
                    if (userLat !== 0) {
                        f.distance_km = haversineDistance(userLat, userLon, coords[1], coords[0]);
                    } else { f.distance_km = 999; }
                } else { f.distance_km = 999; }
            } catch { f.distance_km = 999; }
            return f;
        });

        await Promise.all(verificationPromises);

        const niveauCible = niveau === 'all' ? null : niveau.toString();
        const uniqueSet = new Set();

        result.formations = result.formations.filter((f: any) => {
            // Nettoyage niveau
            if(f.niveau && f.niveau.toString().startsWith('Niveau')) f.niveau = f.niveau.replace('Niveau ', '').trim();
            if (niveauCible && f.niveau !== 'N/A' && f.niveau !== niveauCible) return false;

            const org = f.organisme.toLowerCase();
            if (org.includes("lycées") || org.includes("réseau")) return false;

            const key = `${f.intitule}-${f.organisme}`;
            if (uniqueSet.has(key)) return false;
            uniqueSet.add(key);

            // FILTRE DISTANCE : On est large (100km) car l'API Gouv est fiable
            return (f.distance_km || 999) <= 100;
        });

        // ENRICHISSEMENT FINAL
        result.formations.forEach((f: any) => {
            const intituleUpper = f.intitule.toUpperCase();
            
            // Catégorie
            if (intituleUpper.match(/BAC|BTS|BUT|CAP|LICENCE|TITRE|MASTER|INGÉNIEUR/)) f.categorie = "Diplôme";
            else if (intituleUpper.match(/CQP|CS /)) f.categorie = "Certification";
            else f.categorie = "Habilitation";

            // Alternance Ocapiat
            const mode = (f.modalite || "").toLowerCase();
            if (mode.includes("apprenti") || mode.includes("alternance") || mode.includes("pro")) {
                f.alternance = "Oui"; f.modalite = "Alternance";
            } else {
                f.alternance = "Non"; f.modalite = "Initial";
            }

            // Patch RNCP
            if (!f.rncp || f.rncp.length < 5) {
                for (const [key, code] of Object.entries(RNCP_DB)) {
                    if (intituleUpper.includes(key)) { f.rncp = code; break; }
                }
            }
        });

        result.formations.sort((a: any, b: any) => a.distance_km - b.distance_km);
    }

    const finalResponse = {
        metier_normalise: metier,
        ville_reference: ville,
        formations: result.formations || []
    };

    console.log(`✅ V32 FUSION: ${finalResponse.formations.length} résultats.`);

    return new Response(JSON.stringify(finalResponse), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});