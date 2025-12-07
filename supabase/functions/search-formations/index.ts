import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// --- DATA RNCP ---
const RNCP_DB: Record<string, string> = {
    "AGROÉQUIPEMENT": "RNCP38234", "AGENT DE SILO": "RNCP28779", "GDEA": "RNCP38243",
    "MAINTENANCE DES MATÉRIELS": "RNCP37039", "CGEA": "RNCP31670", "PRODUCTIONS VÉGÉTALES": "RNCP38241",
    "AGRONOMIE": "RNCP35850", "ACSE": "RNCP38240", "RESPONSABLE DE SILO": "RNCP_BRANCHE",
    "GTLA": "RNCP35364", "QLIO": "RNCP35367", "TSMEL": "RNCP34360", "AGENT MAGASINIER": "RNCP38413",
    "LOGISTIQUE": "RNCP38416", "PRÉPARATEUR DE COMMANDES": "RNCP38417", "CHAIN LOGISTIQUE": "RNCP31112",
    "MAINTENANCE DES SYSTÈMES": "RNCP35323", "MSPC": "RNCP35475", "GIM": "RNCP35365",
    "ÉLECTROTECHNIQUE": "RNCP35349", "CRSA": "RNCP35342", "PILOTE DE LIGNE": "RNCP35602",
    "CCST": "RNCP35801", "TECHNICO-COMMERCIAL": "RNCP38368", "NDRC": "RNCP38368", "TC": "RNCP35366",
    "COMMERCE INTERNATIONAL": "RNCP38372", "MANAGER INTERNATIONAL": "RNCP34206",
    "BIOQUALITÉ": "RNCP38235", "CONDUCTEUR ROUTIER": "RNCP35310", "AGRÉEUR": "RNCP_BRANCHE"
};

// --- CONFIG MÉTIERS ---
const METIERS_CONFIG: Record<string, { diplomes: string[], contexte: string }> = {
    "technico": { 
        diplomes: ["BTS CCST", "BTSA Technico-commercial", "BTS NDRC", "Licence Pro Technico-Commercial"],
        contexte: "Lycées Agricoles, CFA CCIP, Écoles de Commerce."
    },
    "silo": {
        diplomes: ["Bac Pro Agroéquipement", "CQP Agent de silo", "BTSA GDEA", "CAP Maintenance des matériels", "Bac Pro CGEA"],
        contexte: "Lycées Agricoles, CFPPA, MFR. (Focus Rural)."
    },
    "chauffeur": { 
        diplomes: ["CAP Conducteur Routier", "Titre Pro Conducteur transport", "CS Conduite machines agricoles"],
        contexte: "Aftral, Promotrans, Lycées Agricoles."
    },
    "responsable_silo": { 
        diplomes: ["CS Responsable de silo", "Licence Pro Management agri", "BTSA GDEA"],
        contexte: "CFPPA, Écoles d'ingénieurs Agri."
    },
    "logistique": { 
        diplomes: ["BUT QLIO", "TSMEL", "BTS GTLA", "Master Logistique"],
        contexte: "IUT, Aftral, Promotrans, Universités."
    },
    "magasinier": { 
        diplomes: ["Titre Pro Agent Magasinier", "Bac Pro Logistique", "CACES R489"],
        contexte: "AFPA, Aftral, Promotrans, Lycées Pros."
    },
    "maintenance": { 
        diplomes: ["BTS Maintenance des Systèmes", "BUT GIM", "Bac Pro MSPC"],
        contexte: "Lycées Pros Industriels, CFAI, IUT."
    },
    "qualite": { 
        diplomes: ["BTSA Bioqualité", "BUT Génie Biologique", "Licence Pro Qualité"],
        contexte: "ENIL, IUT, Lycées Agricoles."
    },
    "agreeur": { 
        diplomes: ["CQP Agréeur", "Formation Classement des grains", "CS Stockage"],
        contexte: "CFPPA Céréaliers, Organismes de la branche."
    },
    "ligne": { 
        diplomes: ["Pilote de ligne de production", "Bac Pro PSPA", "CQP Conducteur de ligne"],
        contexte: "CFAI, Lycées Pros Industriels."
    },
    "culture": { 
        diplomes: ["BTSA APV", "BTSA ACSE", "Ingénieur Agri"],
        contexte: "Lycées Agricoles, CFAA."
    },
    "export": { 
        diplomes: ["BTS Commerce International", "BUT TC (International)", "Master Commerce International"],
        contexte: "Lycées, IUT, Business Schools."
    }
};

// --- OUTILS MATHÉMATIQUES ---
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
    if (m.match(/culture|végétal|céréale/)) return "culture";
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
    if (!perplexityApiKey) throw new Error("Clé API Perplexity manquante");

    // 1. API GOUV (GPS UTILISATEUR)
    let userLat = 0, userLon = 0;
    try {
        const geoRep = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(ville)}&limit=1`);
        const geoData = await geoRep.json();
        if (geoData.features?.length > 0) {
            const coords = geoData.features[0].geometry.coordinates;
            userLon = coords[0]; userLat = coords[1];
        }
    } catch (e) { console.error("Erreur Geo", e); }

    // 2. CONFIG IA
    const metierKey = detecterMetier(metier);
    const config = METIERS_CONFIG[metierKey];
    
    let zonePrompt = `${ville} (Rayon 50km)`;
    const isAgri = ["silo", "culture", "agreeur", "chauffeur", "responsable_silo"].includes(metierKey);
    const isBigCity = ville.toLowerCase().match(/paris|lyon|marseille|lille|bordeaux|nantes|fresnes|massy|creteil/);
    if (isAgri && isBigCity) zonePrompt = "Départements limitrophes et zones rurales proches (max 60km)";

    const systemPrompt = `Tu es un MOTEUR DE RECHERCHE D'ÉTABLISSEMENTS.
    Trouve les établissements réels. 
    JSON STRICT: { "formations": [{ "intitule": "", "organisme": "", "ville": "", "rncp": "", "modalite": "", "niveau": "" }] }`;

    const userPrompt = `Liste les établissements pour : "${config.diplomes.join(", ")}" DANS LA ZONE : "${zonePrompt}".
    CONTEXTE : ${config.contexte}. JSON uniquement.`;

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
    
    // --- 3. PARSING BLINDÉ (C'est ici que ça change) ---
    let result;
    const content = data.choices[0].message.content;
    
    try {
        // Extraction chirurgicale du JSON : On cherche le premier { et le dernier }
        const firstOpen = content.indexOf('{');
        const lastClose = content.lastIndexOf('}');
        
        if (firstOpen !== -1 && lastClose !== -1) {
            const jsonString = content.substring(firstOpen, lastClose + 1);
            result = JSON.parse(jsonString);
        } else {
            throw new Error("Aucune structure JSON trouvée dans la réponse");
        }
    } catch (e) {
        console.error("CRITICAL PARSE ERROR:", content);
        // Fallback vide pour éviter le crash complet de l'app
        result = { formations: [] }; 
    }

    // --- 4. VALIDATION & CORRECTION VIA API GOUV ---
    if (result.formations && result.formations.length > 0) {
        const verificationPromises = result.formations.map(async (f: any) => {
            try {
                const query = `${f.organisme} ${f.ville}`;
                const apiRep = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=1`);
                const apiData = await apiRep.json();

                if (apiData.features?.length > 0) {
                    const feature = apiData.features[0];
                    f.ville = feature.properties.city; 
                    if (userLat !== 0) {
                        f.distance_km = haversineDistance(userLat, userLon, feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
                    } else { f.distance_km = 999; }
                } else { f.distance_km = 999; }
            } catch (err) { f.distance_km = 999; }
            return f;
        });

        await Promise.all(verificationPromises);

        // 5. FILTRAGE ET ENRICHISSEMENT
        const niveauCible = niveau === 'all' ? null : niveau.toString();
        const uniqueSet = new Set();

        result.formations = result.formations.filter((f: any) => {
            if(f.niveau && f.niveau.toString().startsWith('Niveau')) f.niveau = f.niveau.replace('Niveau ', '').trim();
            if (niveauCible && f.niveau !== 'N/A' && f.niveau !== niveauCible) return false;

            const org = f.organisme.toLowerCase();
            if (org.includes("lycées") || org.includes("réseau")) return false;

            const key = `${f.intitule}-${f.organisme}`;
            if (uniqueSet.has(key)) return false;
            uniqueSet.add(key);

            return (f.distance_km || 999) <= 80;
        });

        result.formations.forEach((f: any) => {
            const intituleUpper = f.intitule.toUpperCase();
            
            if (intituleUpper.match(/BAC|BTS|BUT|CAP|LICENCE|TITRE|MASTER|INGÉNIEUR/)) f.categorie = "Diplôme";
            else if (intituleUpper.match(/CQP|CS /)) f.categorie = "Certification";
            else f.categorie = "Habilitation";

            const mode = (f.modalite || "").toLowerCase();
            if (mode.includes("apprenti") || mode.includes("alternance") || mode.includes("pro")) {
                f.alternance = "Oui"; f.modalite = "Alternance";
            } else {
                f.alternance = "Non"; f.modalite = "Initial";
            }

            if (!f.rncp || f.rncp.length < 5) {
                for (const [key, code] of Object.entries(RNCP_DB)) {
                    if (intituleUpper.includes(key)) { f.rncp = code; break; }
                }
            }
        });

        result.formations.sort((a: any, b: any) => a.distance_km - b.distance_km);
    } else {
        // Sécurité si result.formations est vide ou undefined
        result.formations = [];
    }

    const finalResponse = {
        metier_normalise: metier,
        ville_reference: ville,
        formations: result.formations || []
    };

    console.log(`✅ V26 FINAL: ${finalResponse.formations.length} résultats.`);

    return new Response(JSON.stringify(finalResponse), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});