import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ==================================================================================
// 1. LA LOGIQUE "CONSEILLER D'ORIENTATION" (Tes définitions)
// ==================================================================================

const METIERS_CONFIG: Record<string, { diplomes: string[], keywords: string }> = {
    // CHAUFFEUR : On met tout ce qui permet de conduire (du CAPA au BTSA GDEA)
    chauffeur: { 
        diplomes: [
            "CAP Agricole (CAPA) Métiers de l'agriculture",
            "Bac Pro Conduite et gestion de l'entreprise agricole (CGEA)",
            "Brevet Professionnel Responsable d'Exploitation Agricole (BPREA)",
            "BTSA Génie des Équipements Agricoles (GDEA)",
            "BTS Techniques et Services en Matériels Agricoles (TSMA)",
            "Titre Pro Conducteur Routier (Transport)"
        ],
        keywords: "Lycées Agricoles, CFPPA, MFR, Centres de Formation Transport"
    },
    // SILO : On met l'Agricole (Agroéquipement) ET l'Industriel (Maintenance)
    silo: { 
        diplomes: [
            "CQP Agent de silo",
            "Bac Pro Agroéquipement",
            "Bac Pro Maintenance des Systèmes (MS)",
            "Bac Pro Électrotechnique (MELEC)",
            "CAP Maintenance des matériels",
            "BTSA GDEA"
        ],
        keywords: "Lycées Agricoles, Lycées Professionnels Industriels"
    },
    // RESPONSABLE SILO : Le niveau au-dessus
    responsable_silo: { 
        diplomes: [
            "CS Responsable de silo",
            "BTSA GDEA (Génie des Équipements)",
            "BTSA Agronomie Productions Végétales (APV)",
            "Ingénieur en Agriculture / Agronomie",
            "Master Management de la production"
        ],
        keywords: "Écoles d'Ingénieurs, Universités, Lycées Agricoles (BTS)"
    },
    // TECHNICO : Vente pure + Vente Technique
    technico: { 
        diplomes: [
            "BTSA Technico-commercial (Produits alimentaires, Agrofournitures)",
            "BTS Conseil et Commercialisation de Solutions Techniques (CCST)",
            "BTS Négociation et Digitalisation de la Relation Client (NDRC)",
            "Licence Pro Commerce / Technico-commercial"
        ],
        keywords: "Lycées Agricoles, CFA Commerciaux, Écoles de Commerce"
    },
    // LOGISTIQUE : Du Bac Pro au Master
    logistique: { 
        diplomes: [
            "Bac Pro Logistique",
            "BTS Gestion des Transports et Logistique Associée (GTLA)",
            "BUT Qualité, Logistique Industrielle et Organisation (QLIO)",
            "TSMEL (Technicien Supérieur Méthodes et Exploitation Logistique)",
            "Master Supply Chain / Logistique"
        ],
        keywords: "IUT, Lycées Pros, Aftral, Promotrans, Universités"
    },
    // MAGASINIER : CACES et Titres Pro
    magasinier: { 
        diplomes: [
            "Titre Professionnel Agent Magasinier",
            "Titre Professionnel Préparateur de Commandes",
            "Bac Pro Logistique",
            "CACES R489 (Certificat d'aptitude à la conduite)"
        ],
        keywords: "Centres de formation logistique (AFPA, Aftral...), Lycées Pros"
    },
    // MAINTENANCE : Cœur industriel
    maintenance: { 
        diplomes: [
            "Bac Pro Maintenance des Systèmes de Production Connectés (MSPC)",
            "BTS Maintenance des Systèmes (MS)",
            "BTS Électrotechnique",
            "BUT Génie Industriel et Maintenance (GIM)"
        ],
        keywords: "Lycées Professionnels, CFAI (Industrie), IUT"
    },
    // QUALITÉ : Labo et Agro
    qualite: { 
        diplomes: [
            "BTSA Bioqualité (ex QIA)",
            "BUT Génie Biologique (IAB)",
            "Licence Pro Qualité et Sécurité des Aliments",
            "Master Qualité Agroalimentaire"
        ],
        keywords: "ENIL, Lycées Agricoles, IUT, Universités"
    },
    // AGRÉEUR : Spécialiste grain
    agreeur: { 
        diplomes: [
            "CQP Agréeur",
            "CS Stockage de céréales",
            "Formation Classement des grains",
            "BTSA Agronomie Productions Végétales"
        ],
        keywords: "CFPPA, Organismes de la branche céréalière"
    },
    // LIGNE : Production
    ligne: { 
        diplomes: [
            "Titre Pro Conducteur d'installations et de machines automatisées",
            "Bac Pro Pilote de Ligne de Production (PLP)",
            "BTS Pilotage de Procédés",
            "CQP Conducteur de ligne"
        ],
        keywords: "CFAI, Lycées Pros, AFPA"
    },
    // CULTURE : Agronomie pure
    culture: { 
        diplomes: [
            "BTSA Agronomie Productions Végétales (APV)",
            "BTSA Analyse, Conduite et Stratégie de l'Entreprise (ACSE)",
            "Ingénieur Agronome",
            "Licence Pro Agronomie"
        ],
        keywords: "Lycées Agricoles, Écoles d'Ingénieurs Agri"
    },
    // EXPORT : Commerce Inter
    export: { 
        diplomes: [
            "BTS Commerce International",
            "BUT Techniques de Commercialisation (Parcours International)",
            "Master Commerce International / Affaires Internationales"
        ],
        keywords: "Lycées (Sections Internationales), IUT, Universités, Business Schools"
    }
};

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
    "FIMO": "Habilitation", "CACES": "Habilitation"
};

// --- UTILS ---
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
// 3. LE MOTEUR
// ==================================================================================
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { metier, ville, niveau } = await req.json();
    if (!metier || !ville) throw new Error("Paramètres manquants");

    const perplexityApiKey = Deno.env.get("PERPLEXITY_API_KEY");
    if (!perplexityApiKey) throw new Error("Clé API manquante");

    // 1. ANCRAGE GÉOGRAPHIQUE SIMPLE (Département / Région)
    let userLat = 0, userLon = 0;
    let villeContext = ville;
    let regionContext = "";

    try {
        const geoRep = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(ville)}&limit=1`);
        const geoData = await geoRep.json();
        if (geoData.features?.length > 0) {
            const f = geoData.features[0];
            userLon = f.geometry.coordinates[0];
            userLat = f.geometry.coordinates[1];
            // On récupère "94, Val-de-Marne, Île-de-France"
            const ctx = f.properties.context || ""; 
            villeContext = `${f.properties.city} (${f.properties.postcode})`;
            regionContext = ctx; // Le contexte complet pour l'IA
        }
    } catch { 
        villeContext = ville; 
        regionContext = "France";
    }

    // 2. PRÉPARATION DU PROMPT
    const metierKey = detecterMetier(metier);
    const config = METIERS_CONFIG[metierKey];

    // C'EST ICI LA CLÉ : On dit à l'IA de chercher DANS LA RÉGION.
    // Plus de "périphérie", plus de "rural". Juste : "Cherche dans le département X et la région Y".
    const zoneRecherche = `${villeContext}, ainsi que dans le département et la région : ${regionContext}`;

    const systemPrompt = `Tu es un CONSEILLER D'ORIENTATION.
    Ton but : Lister 15 établissements de formation pour un utilisateur habitant à ${villeContext}.
    
    IMPORTANT :
    1. Cherche les formations qui correspondent aux diplômes demandés.
    2. Ne te limite pas à la ville même ! Cherche dans tout le département et la région indiquée.
    3. Pour les métiers agricoles, cherche les Lycées Agricoles de la région.
    4. Pour les métiers techniques, cherche les Lycées Pros et CFA de la ville et des alentours.
    
    JSON STRICT UNIQUEMENT : { "formations": [{ "intitule": "", "organisme": "", "ville": "", "rncp": "", "modalite": "", "niveau": "" }] }`;

    const userPrompt = `Trouve les formations pour le métier "${metier}" dans la zone : "${zoneRecherche}".
    
    DIPLÔMES CIBLES (Liste exhaustive) : ${config.diplomes.join(", ")}.
    TYPES D'ÉTABLISSEMENTS : ${config.keywords}.
    
    Donne-moi 15 résultats concrets et existants.
    JSON uniquement.`;

    // 3. APPEL IA
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
    
    // 4. PARSING
    let result;
    try {
        const clean = data.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
        const start = clean.indexOf('{');
        const end = clean.lastIndexOf('}');
        result = JSON.parse(clean.substring(start, end + 1));
    } catch { result = { formations: [] }; }

    // 5. VALIDATION & TRI (SANS FILTRE DE DISTANCE STRICT)
    if (result.formations && result.formations.length > 0) {
        
        const verificationPromises = result.formations.map(async (f: any) => {
            try {
                // On cherche l'adresse pour calculer la distance
                let query = `${f.organisme} ${f.ville}`;
                let apiRep = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=1`);
                let apiData = await apiRep.json();

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

        const uniqueSet = new Set();

        // ON NE FILTRE PLUS PAR DISTANCE < 80km.
        // On garde tout ce que l'IA a trouvé dans la région, tant que ce n'est pas aberrant (> 150km).
        result.formations = result.formations.filter((f: any) => {
            
            const key = `${f.intitule}-${f.organisme}`;
            if (uniqueSet.has(key)) return false;
            uniqueSet.add(key);

            // On rejette seulement si c'est vraiment à l'autre bout de la France (> 200km)
            // Sinon on garde, même si c'est à 80km (ex: Beauvais pour Paris, c'est acceptable si pas d'autre choix).
            return (f.distance_km || 999) <= 200;
        });

        // Enrichissement
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

        // LE TRI EST CRUCIAL : On met les plus proches en premier.
        result.formations.sort((a: any, b: any) => a.distance_km - b.distance_km);
    }

    const finalResponse = {
        metier_normalise: metier,
        ville_reference: villeContext,
        formations: result.formations || []
    };

    console.log(`✅ V39 HUMAN-LOGIC: ${finalResponse.formations.length} résultats.`);

    return new Response(JSON.stringify(finalResponse), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});