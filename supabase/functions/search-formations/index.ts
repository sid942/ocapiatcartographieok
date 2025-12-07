import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ==================================================================================
// 1. BASE RNCP (COMPLETE ET VALIDÉE)
// ==================================================================================
const RNCP_DB: Record<string, string> = {
    // SILO & AGRI
    "AGROÉQUIPEMENT": "RNCP38234", "AGENT DE SILO": "RNCP28779", "GDEA": "RNCP38243",
    "MAINTENANCE DES MATÉRIELS": "RNCP37039", "CGEA": "RNCP31670", "PRODUCTIONS VÉGÉTALES": "RNCP38241",
    "AGRONOMIE": "RNCP35850", "ACSE": "RNCP38240", "RESPONSABLE DE SILO": "RNCP_BRANCHE",
    // LOGISTIQUE
    "GTLA": "RNCP35364", "QLIO": "RNCP35367", "TSMEL": "RNCP34360", "AGENT MAGASINIER": "RNCP38413",
    "LOGISTIQUE": "RNCP38416", "PRÉPARATEUR DE COMMANDES": "RNCP38417", "CHAIN LOGISTIQUE": "RNCP31112",
    // MAINTENANCE
    "MAINTENANCE DES SYSTÈMES": "RNCP35323", "MSPC": "RNCP35475", "GIM": "RNCP35365",
    "ÉLECTROTECHNIQUE": "RNCP35349", "CRSA": "RNCP35342", "PILOTE DE LIGNE": "RNCP35602",
    // COMMERCE & EXPORT
    "CCST": "RNCP35801", "TECHNICO-COMMERCIAL": "RNCP38368", "NDRC": "RNCP38368", "TC": "RNCP35366",
    "COMMERCE INTERNATIONAL": "RNCP38372", "MANAGER INTERNATIONAL": "RNCP34206",
    // AUTRES
    "BIOQUALITÉ": "RNCP38235", "CONDUCTEUR ROUTIER": "RNCP35310", "AGRÉEUR": "RNCP_BRANCHE"
};

// ==================================================================================
// 2. MATRICE PARCOURS (Conforme "Parcours de formation" du cahier des charges)
// ==================================================================================
const METIERS_CONFIG: Record<string, { diplomes: string[], contexte: string }> = {
    "technico": { 
        diplomes: ["BTS CCST (ex-TC)", "BTSA Technico-commercial (Agrofournitures/Vins/Jardins)", "BTS NDRC", "Licence Pro Technico-Commercial"],
        contexte: "Cible : Lycées Agricoles (Vital pour le négoce), CFA CCIP, Écoles de Commerce."
    },
    "silo": {
        diplomes: ["Bac Pro Agroéquipement", "CQP Agent de silo", "BTSA GDEA", "CAP Maintenance des matériels", "Bac Pro CGEA"],
        contexte: "Cible : Lycées Agricoles, CFPPA, MFR. (Focus Formation Continue et Initiale)."
    },
    "chauffeur": { 
        diplomes: ["CAP Conducteur Routier", "Titre Pro Conducteur transport", "CS Conduite machines agricoles"],
        contexte: "Cible : Aftral, Promotrans, Lycées Agricoles (Machinisme)."
    },
    "responsable_silo": { 
        diplomes: ["CS Responsable de silo", "Licence Pro Management organisations agricoles", "BTSA GDEA"],
        contexte: "Cible : CFPPA, Écoles d'ingénieurs Agri (Formation Continue)."
    },
    "logistique": { 
        diplomes: ["BUT QLIO", "TSMEL", "BTS GTLA", "Master Management chaîne logistique"],
        contexte: "Cible : IUT, Aftral, Promotrans, Universités."
    },
    "magasinier": { 
        diplomes: ["Titre Pro Agent Magasinier", "Bac Pro Logistique", "CACES R489", "Titre Pro Préparateur de commandes"],
        contexte: "Cible : AFPA, Aftral, Promotrans, Lycées Pros, GRETA (Formation Continue)."
    },
    "maintenance": { 
        diplomes: ["BTS Maintenance des Systèmes (MS)", "BUT GIM", "Bac Pro MSPC", "BTS Électrotechnique"],
        contexte: "Cible : Lycées Pros Industriels, CFAI, IUT."
    },
    "qualite": { 
        diplomes: ["BTSA Bioqualité", "BUT Génie Biologique", "Licence Pro Qualité Agroalimentaire"],
        contexte: "Cible : ENIL, IUT, Lycées Agricoles."
    },
    "agreeur": { 
        diplomes: ["CQP Agréeur", "Formation Classement des grains", "CS Stockage", "BTSA Agronomie"],
        contexte: "Cible : CFPPA Céréaliers, Organismes de la branche Négoce."
    },
    "ligne": { 
        diplomes: ["Pilote de ligne de production", "Bac Pro PSPA", "CQP Conducteur de ligne"],
        contexte: "Cible : CFAI, Lycées Pros Industriels."
    },
    "culture": { 
        diplomes: ["BTSA Agronomie Productions Végétales (APV)", "BTSA ACSE", "Ingénieur Agri"],
        contexte: "Cible : Lycées Agricoles, CFAA."
    },
    "export": { 
        diplomes: ["BTS Commerce International", "BUT Techniques de Commercialisation (Parcours International)", "Master Commerce International"],
        contexte: "Cible : Lycées (Sections internationales), IUT, Business Schools."
    }
};

// ==================================================================================
// 3. LOGIQUE & DÉTECTION
// ==================================================================================
function detecterMetier(input: string): string {
    const m = input.toLowerCase();
    if (m.match(/silo|grain/)) return m.includes("responsable") ? "responsable_silo" : "silo";
    if (m.match(/culture|végétal|céréale|agronomie/)) return "culture";
    if (m.match(/chauffeur|conducteur|tracteur|routier/)) return m.includes("ligne") ? "ligne" : "chauffeur";
    if (m.match(/maintenance|technique|élec|méca/)) return "maintenance";
    if (m.match(/logistique|supply/)) return m.includes("responsable") ? "logistique" : "magasinier";
    if (m.match(/magasinier|cariste|entrepot/)) return "magasinier";
    if (m.match(/commercial|vente|négoce|technico/)) return m.includes("export") ? "export" : "technico";
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

    // DÉTECTION
    const metierKey = detecterMetier(metier);
    const config = METIERS_CONFIG[metierKey];
    console.log(`🌾 BRANCHE NÉGOCE AGRICOLE: "${metier}" (${metierKey}) à "${ville}"`);

    // GÉOGRAPHIE DU NÉGOCE (Rural vs Urbain)
    let zoneRecherche = `${ville} (rayon 50km)`;
    const isAgri = ["silo", "culture", "agreeur", "chauffeur", "responsable_silo"].includes(metierKey);
    const isBigCity = ville.toLowerCase().match(/paris|lyon|marseille|lille|bordeaux|nantes|fresnes|massy|creteil|toulouse/);
    
    if (isAgri && isBigCity) {
         zoneRecherche = "Départements limitrophes et zones rurales proches (max 60km)";
    }

    // --- PROMPT ALIGNÉ SUR LE CAHIER DES CHARGES ---
    const systemPrompt = `Tu es le MOTEUR DE RECHERCHE DE FORMATIONS de la branche "NÉGOCE AGRICOLE" (Partenariat Entreprises/OF).
    Mission : Identifier les Organismes de Formation (OF) de proximité pour favoriser l'alternance et les partenariats.
    
    RÈGLES DU MARCHÉ :
    1. EXHAUSTIVITÉ : Cherche la Formation Initiale (Lycées, CFA) ET la Formation Continue (GRETA, AFPA, CFPPA pour adultes).
    2. RÉALITÉ TERRAIN : Uniquement des établissements physiques existants. Pas d'enseignement à distance pur.
    3. PRÉCISION : Nom EXACT de l'OF + Ville EXACTE.
    
    JSON STRICT :
    {
      "formations": [
        {
          "intitule": "Intitulé exact",
          "organisme": "Nom de l'OF (Lycée, CFA, MFR...)",
          "rncp": "Code ou null",
          "niveau": "3" | "4" | "5" | "6" | "N/A",
          "ville": "Commune exacte",
          "distance_km": number,
          "site_web": "URL ou null",
          "modalite": "Présentiel" | "Apprentissage"
        }
      ]
    }`;

    const userPrompt = `Cartographie l'offre de formation pour : "${config.diplomes.join(", ")}" DANS LA ZONE : "${zoneRecherche}".
    
    CONTEXTE BRANCHE : ${config.contexte}.
    
    IMPORTANT :
    - Cherche bien les MFR et CFPPA (très importants pour le Négoce Agricole).
    - Vérifie la distance (<80km).
    
    Renvoie le JSON.`;

    // APPEL IA
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
    
    let result;
    try {
        const clean = data.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
        result = JSON.parse(clean);
    } catch (e) {
        const match = data.choices[0].message.content.match(/\{[\s\S]*\}/);
        if (match) result = JSON.parse(match[0]);
        else throw new Error("Erreur JSON IA");
    }

    // --- FILTRAGE DE SÉCURITÉ ---
    if (result.formations) {
        const niveauCible = niveau === 'all' ? null : niveau.toString();

        result.formations = result.formations.filter((f: any) => {
            // A. Nettoyage Niveau
            if(f.niveau && f.niveau.toString().startsWith('Niveau')) f.niveau = f.niveau.replace('Niveau ', '').trim();
            if (niveauCible && f.niveau !== 'N/A' && f.niveau !== niveauCible) return false;

            // B. Anti-Flou (On veut des OF précis pour les partenariats)
            const org = f.organisme.toLowerCase();
            const villeF = f.ville.toLowerCase();
            const badTerms = ["lycées", "réseau", "structures", "organismes", "divers"]; // On tolère "centre" pour AFPA/AFTRAL
            const badCities = ["secteur", "zone", "départements", "alentours", "proximité"];
            
            if (badTerms.some(t => org.includes(t) && !org.startsWith("lycée") && !org.startsWith("cfa") && !org.startsWith("mfr") && !org.startsWith("centre"))) return false;
            if (badCities.some(v => villeF.includes(v))) return false;

            // C. DISTANCE
            const dist = (f.distance_km === null || f.distance_km === undefined) ? 999 : f.distance_km;
            return dist <= 80;
        });

        // D. ENRICHISSEMENT (Pour l'affichage Catalogue)
        result.formations.forEach((f: any) => {
            const intituleUpper = f.intitule.toUpperCase();
            
            // Catégorie
            if (intituleUpper.match(/BAC|BTS|BUT|CAP|LICENCE|TITRE|MASTER|INGÉNIEUR|BACHELOR/)) f.categorie = "Diplôme";
            else if (intituleUpper.match(/CQP|CS /)) f.categorie = "Certification";
            else f.categorie = "Habilitation";

            // Alternance (Demande cahier des charges : "Encourager l'alternance")
            const mode = (f.modalite || "").toLowerCase();
            if (mode.includes("apprenti") || mode.includes("alternance") || mode.includes("pro") || mode.includes("mixte")) {
                f.alternance = "Oui";
                f.modalite = "Alternance";
            } else {
                f.alternance = "Non";
                f.modalite = "Initial";
            }

            // RNCP
            if (!f.rncp || f.rncp.length < 5 || f.rncp === "Non renseigné") {
                for (const [key, code] of Object.entries(RNCP_DB)) {
                    if (intituleUpper.includes(key)) {
                        f.rncp = code;
                        break;
                    }
                }
            }
        });

        result.formations.sort((a: any, b: any) => (a.distance_km || 999) - (b.distance_km || 999));
    }

    const finalResponse = {
        metier_normalise: metier,
        ville_reference: ville,
        formations: result.formations || []
    };

    console.log(`✅ OFFRE FORMATION NÉGOCE: ${finalResponse.formations.length} OFs identifiés.`);

    return new Response(JSON.stringify(finalResponse), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});