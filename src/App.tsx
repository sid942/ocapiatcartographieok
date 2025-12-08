import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ==================================================================================
// 1. CONFIGURATION "CONSEILLER D'ORIENTATION" (Compétences & Passerelles)
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
    "BIOQUALITÉ": "RNCP38235", "CONDUCTEUR ROUTIER": "RNCP35310", "AGRÉEUR": "RNCP_BRANCHE",
    "FIMO": "RNCP_BRANCHE", "PERMIS": "Habilitation"
};

// ICI : On définit TOUT ce qui permet d'accéder au métier (Direct + Transversal)
const METIERS_CONFIG: Record<string, { diplomes: string[], contexte: string }> = {
    silo: { 
        diplomes: [
            "CQP Agent de silo (Spécifique)", 
            "Bac Pro Agroéquipement (Agri)", 
            "CAP Maintenance des matériels (Méca)", 
            "Bac Pro Maintenance des Systèmes (Indus/Transversal)", 
            "Bac Pro Électrotechnique (Indus/Transversal)"
        ],
        contexte: "Lycées Agricoles, Lycées Professionnels Industriels, CFPPA, MFR." 
    },
    chauffeur: { 
        diplomes: [
            "Titre Pro Conducteur du transport routier (Transport)", 
            "CAP Conducteur Routier (Transport)", 
            "Permis C / EC + FIMO (Habilitation)",
            "CS Conduite de machines agricoles (Agri)"
        ],
        contexte: "Centres de Transport (AFTRAL, Promotrans), Auto-écoles Pro, Lycées Agricoles." 
    },
    responsable_silo: { 
        diplomes: [
            "CS Responsable de silo", 
            "BTSA GDEA (Génie des équipements)", 
            "Ingénieur Agronome", 
            "Master Management Industriel ou Logistique"
        ],
        contexte: "Écoles d'ingénieurs, Universités, IUT, CFPPA." 
    },
    technico: { 
        diplomes: ["BTS CCST (ex-TC)", "BTSA Technico-commercial", "BTS NDRC", "Licence Pro Commerce"],
        contexte: "Lycées Agricoles (Priorité), CFA, Écoles de Commerce, Lycées Polyvalents." 
    },
    logistique: { 
        diplomes: ["BUT QLIO", "TSMEL", "BTS GTLA", "Master Supply Chain"],
        contexte: "IUT, Aftral, Promotrans, Universités, Écoles de Gestion." 
    },
    magasinier: { 
        diplomes: ["Titre Pro Agent Magasinier", "Bac Pro Logistique", "CACES R489"],
        contexte: "AFPA, Aftral, Promotrans, Lycées Pros, GRETA." 
    },
    maintenance: { 
        diplomes: ["BTS Maintenance des Systèmes (MS)", "BUT GIM", "Bac Pro MSPC", "BTS Électrotechnique"],
        contexte: "Lycées Professionnels (Indus), CFAI, IUT." 
    },
    qualite: { 
        diplomes: ["BTSA Bioqualité", "BUT Génie Biologique", "Licence Pro Qualité", "Master Qualité"],
        contexte: "ENIL, IUT, Lycées Agricoles, Universités Sciences." 
    },
    agreeur: { 
        diplomes: ["CQP Agréeur", "CS Stockage de céréales", "Formation Classement des grains"],
        contexte: "CFPPA Céréaliers, Organismes de la branche Négoce." 
    },
    ligne: { 
        diplomes: ["Pilote de ligne de production", "Bac Pro PSPA", "CQP Conducteur de ligne"],
        contexte: "CFAI, Lycées Pros Industriels, AFPA." 
    },
    culture: { 
        diplomes: ["BTSA APV (Agronomie)", "BTSA ACSE", "Ingénieur Agri", "Licence Pro Agronomie"],
        contexte: "Lycées Agricoles, CFAA, Écoles d'Ingénieurs." 
    },
    export: { 
        diplomes: ["BTS Commerce International", "BUT TC (Parcours International)", "Master Commerce International"],
        contexte: "Lycées (Sections internationales), IUT, Business Schools, IAE." 
    }
};

// ==================================================================================
// 2. FONCTIONS UTILITAIRES
// ==================================================================================

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

// ==================================================================================
// 3. LOGIQUE SERVEUR (CONSEILLER D'ORIENTATION)
// ==================================================================================
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { metier, ville, niveau } = await req.json();
    if (!metier || !ville) throw new Error("Paramètres manquants");

    const perplexityApiKey = Deno.env.get("PERPLEXITY_API_KEY");
    if (!perplexityApiKey) throw new Error("Clé API manquante");

    // 1. ANCRAGE GPS (On doit savoir d'où on part)
    let userLat = 0, userLon = 0;
    let villeRealName = ville;

    try {
        const geoRep = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(ville)}&limit=1`);
        const geoData = await geoRep.json();
        if (geoData.features?.length > 0) {
            const f = geoData.features[0];
            userLon = f.geometry.coordinates[0];
            userLat = f.geometry.coordinates[1];
            villeRealName = `${f.properties.city} (${f.properties.postcode})`;
        }
    } catch { }

    // 2. CONFIG MÉTIER
    const metierKey = detecterMetier(metier);
    const config = METIERS_CONFIG[metierKey];
    
    // 3. LE PROMPT "CONSEILLER"
    // On ne filtre plus la zone. On dit juste : "Cherche autour de la ville".
    // C'est le rayon de 70km qui fera le tri naturel.
    const zonePrompt = `${villeRealName} et région proche (Rayon 70km)`;

    const systemPrompt = `Tu es un CONSEILLER D'ORIENTATION expert.
    Mission : Trouver les formations (Scolaires, Apprentissage, Adultes) permettant d'accéder au métier demandé.
    
    RÈGLE D'OR : 
    - Ne te limite pas au titre exact du métier. 
    - Cherche les formations SPÉCIFIQUES (Agricoles) ET les formations TRANSVERSALES (Industrie, Transport, Commerce) qui mènent au même poste.
    - Exemple : Pour "Agent de silo", propose aussi "Maintenance Industrielle" ou "Électrotechnique" car les silos recrutent ces profils.
    - Exemple : Pour "Chauffeur", propose "Permis Poids Lourd" (AFTRAL) ET "Conduite Engins" (Agricole).
    
    JSON STRICT: { "formations": [{ "intitule": "", "organisme": "", "ville": "", "rncp": "", "modalite": "", "niveau": "" }] }`;

    const userPrompt = `Liste 15 établissements pour le métier "${metier}" autour de "${zonePrompt}".
    DIPLÔMES CIBLES : ${config.diplomes.join(", ")}.
    CONTEXTE : ${config.contexte}.
    FORMAT : JSON uniquement.`;

    // 4. APPEL IA
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

    if (!perplexityResponse.ok) throw new Error(`Erreur API IA`);
    const data = await perplexityResponse.json();
    
    // 5. PARSING
    let result;
    try {
        const clean = data.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
        const start = clean.indexOf('{');
        const end = clean.lastIndexOf('}');
        result = JSON.parse(clean.substring(start, end + 1));
    } catch { result = { formations: [] }; }

    // 6. VALIDATION & DISTANCE (FILET DE SÉCURITÉ)
    if (result.formations && result.formations.length > 0) {
        
        const verificationPromises = result.formations.map(async (f: any) => {
            try {
                // On cherche l'adresse précise ou la ville
                let query = `${f.organisme} ${f.ville}`;
                let apiRep = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=1`);
                let apiData = await apiRep.json();

                if (!apiData.features?.length) {
                    // Fallback ville
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

            // Anti-flou
            const org = f.organisme.toLowerCase();
            if (org.includes("lycées") || org.includes("réseau")) return false;

            // Dédoublonnage
            const key = `${f.intitule}-${f.organisme}`;
            if (uniqueSet.has(key)) return false;
            uniqueSet.add(key);

            // FILTRE DISTANCE LARGE (On accepte jusqu'à 90km pour ne rien rater, après on trie)
            // C'est ça qui permet d'afficher Beauvais SI c'est pertinent, mais aussi l'AFTRAL Rungis.
            return (f.distance_km || 999) <= 90;
        });

        // Enrichissement
        result.formations.forEach((f: any) => {
            const intituleUpper = f.intitule.toUpperCase();
            
            if (intituleUpper.match(/BAC|BTS|BUT|CAP|LICENCE|TITRE|MASTER|INGÉNIEUR/)) f.categorie = "Diplôme";
            else if (intituleUpper.match(/CQP|CS /)) f.categorie = "Certification";
            else f.categorie = "Habilitation";

            const mode = (f.modalite || "").toLowerCase();
            if (mode.includes("apprenti") || mode.includes("alternance") || mode.includes("pro") || mode.includes("mixte")) {
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

        // Tri : Les plus proches d'abord (Fresnes -> Rungis en 1er, Fresnes -> Beauvais en dernier)
        result.formations.sort((a: any, b: any) => a.distance_km - b.distance_km);
    }

    const finalResponse = {
        metier_normalise: metier,
        ville_reference: villeRealName,
        formations: result.formations || []
    };

    console.log(`✅ V37 COUNSELOR: ${finalResponse.formations.length} résultats.`);

    return new Response(JSON.stringify(finalResponse), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});