import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ==================================================================================
// 1. DATA RNCP (PROPRE ET VALIDÉE)
// ==================================================================================
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

const METIERS_CONFIG: Record<string, { diplomes: string[], contexte: string }> = {
    "technico": { 
        diplomes: ["BTS CCST (ex-TC)", "BTSA Technico-commercial", "BTS NDRC", "Licence Pro Technico-Commercial"],
        contexte: "Cible : Lycées Agricoles, CFA CCIP, Écoles de Commerce."
    },
    "silo": {
        diplomes: ["Bac Pro Agroéquipement", "CQP Agent de silo", "BTSA GDEA", "CAP Maintenance des matériels", "Bac Pro CGEA"],
        contexte: "Cible : Lycées Agricoles, CFPPA, MFR."
    },
    "chauffeur": { 
        diplomes: ["CAP Conducteur Routier", "Titre Pro Conducteur transport", "CS Conduite machines agricoles"],
        contexte: "Cible : Aftral, Promotrans, Lycées Agricoles."
    },
    "responsable_silo": { 
        diplomes: ["CS Responsable de silo", "Licence Pro Management organisations agricoles", "BTSA GDEA"],
        contexte: "Cible : CFPPA, Écoles d'ingénieurs Agri."
    },
    "logistique": { 
        diplomes: ["BUT QLIO", "TSMEL", "BTS GTLA", "Master Management chaîne logistique"],
        contexte: "Cible : IUT, Aftral, Promotrans, Universités."
    },
    "magasinier": { 
        diplomes: ["Titre Pro Agent Magasinier", "Bac Pro Logistique", "CACES R489"],
        contexte: "Cible : AFPA, Aftral, Promotrans, Lycées Pros."
    },
    "maintenance": { 
        diplomes: ["BTS Maintenance des Systèmes (MS)", "BUT GIM", "Bac Pro MSPC"],
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
        diplomes: ["BTS Commerce International", "BUT Techniques de Commercialisation", "Master Commerce International"],
        contexte: "Cible : Lycées (Sections internationales), IUT, Business Schools."
    }
};

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

function normalizeStr(str: string) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { metier, ville, niveau } = await req.json();
    if (!metier || !ville) throw new Error("Paramètres manquants");

    const perplexityApiKey = Deno.env.get("PERPLEXITY_API_KEY");
    if (!perplexityApiKey) throw new Error("Clé API Perplexity manquante");

    const metierKey = detecterMetier(metier);
    const config = METIERS_CONFIG[metierKey];
    console.log(`🛡️ V24 NO-DISTANCE: "${metier}" (${metierKey}) à "${ville}"`);

    // GÉOGRAPHIE : On demande à l'IA de chercher "Dans la région de"
    let zoneRecherche = `${ville} et sa région`;
    const isAgri = ["silo", "culture", "agreeur", "chauffeur", "responsable_silo"].includes(metierKey);
    const isBigCity = ville.toLowerCase().match(/paris|lyon|marseille|lille|bordeaux|nantes|fresnes|massy|creteil|toulouse|rennes/);
    
    if (isAgri && isBigCity) {
         if (ville.toLowerCase().match(/paris|fresnes|massy|creteil|ile-de-france/)) {
             zoneRecherche = "Île-de-France (Seine-et-Marne, Yvelines, Essonne, Val-d'Oise)";
         } else {
             zoneRecherche = "Département et départements limitrophes";
         }
    }

    const systemPrompt = `Tu es le MOTEUR DE RECHERCHE DE FORMATIONS OCAPIAT.
    Mission : Identifier les Organismes de Formation (OF) réels.
    
    RÈGLES STRICTES :
    1. PAS DE DOUBLONS : Un seul résultat par école/diplôme.
    2. PRÉCISION : Nom EXACT de l'OF + Ville EXACTE.
    3. PAS D'INVENTION : Si l'école n'existe pas, ne la mets pas.
    
    JSON STRICT (Pas de champ distance) :
    {
      "formations": [
        {
          "intitule": "Intitulé exact",
          "organisme": "Nom de l'OF",
          "rncp": "Code ou null",
          "niveau": "3" | "4" | "5" | "6" | "N/A",
          "ville": "Commune exacte",
          "site_web": "URL ou null",
          "modalite": "Présentiel" | "Apprentissage"
        }
      ]
    }`;

    const userPrompt = `Trouve les 15 meilleures formations pour : "${config.diplomes.join(", ")}" DANS LA ZONE : "${zoneRecherche}".
    CONTEXTE : ${config.contexte}.
    Renvoie le JSON.`;

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

    if (result.formations) {
        const niveauCible = niveau === 'all' ? null : niveau.toString();
        const uniqueSet = new Set(); 

        result.formations = result.formations.filter((f: any) => {
            // A. Nettoyage Niveau
            if(f.niveau && f.niveau.toString().startsWith('Niveau')) f.niveau = f.niveau.replace('Niveau ', '').trim();
            if (niveauCible && f.niveau !== 'N/A' && f.niveau !== niveauCible) return false;

            // B. Anti-Flou
            const org = f.organisme.toLowerCase();
            const villeF = f.ville.toLowerCase();
            if (org.includes("lycées") || org.includes("réseau") || villeF.includes("secteur")) return false;

            // C. DÉDOUBLONNAGE
            const uniqueKey = `${f.intitule}-${f.organisme}`;
            if (uniqueSet.has(uniqueKey)) return false;
            uniqueSet.add(uniqueKey);

            return true;
        });

        // D. ENRICHISSEMENT & SCORE DE PERTINENCE
        result.formations.forEach((f: any) => {
            const intituleUpper = f.intitule.toUpperCase();
            
            // Catégorie
            if (intituleUpper.match(/BAC|BTS|BUT|CAP|LICENCE|TITRE|MASTER|INGÉNIEUR|BACHELOR/)) f.categorie = "Diplôme";
            else if (intituleUpper.match(/CQP|CS /)) f.categorie = "Certification";
            else f.categorie = "Habilitation";

            // Alternance
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

            // CALCUL DE PERTINENCE GÉOGRAPHIQUE (Pour le tri)
            // Score 0 = Ville Exacte / Score 1 = Ville différente
            f.pertinence_score = 1;
            const targetCity = normalizeStr(ville);
            const resultCity = normalizeStr(f.ville);
            if (resultCity.includes(targetCity) || targetCity.includes(resultCity)) {
                f.pertinence_score = 0;
            }
        });

        // Tri : D'abord ceux de la ville même (Score 0), puis les autres (Score 1)
        result.formations.sort((a: any, b: any) => a.pertinence_score - b.pertinence_score);
    }

    const finalResponse = {
        metier_normalise: metier,
        ville_reference: ville,
        formations: result.formations || []
    };

    console.log(`✅ V24 CLEAN: ${finalResponse.formations.length} résultats.`);

    return new Response(JSON.stringify(finalResponse), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});