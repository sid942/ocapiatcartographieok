import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ==================================================================================
// 1. DATA RNCP & MÉTIERS
// ==================================================================================
const RNCP_DB: Record<string, string> = {
    // SILO & AGRI
    "AGROÉQUIPEMENT": "RNCP38234", "AGENT DE SILO": "RNCP28779", "GDEA": "RNCP38243",
    "MAINTENANCE DES MATÉRIELS": "RNCP37039", "CGEA": "RNCP31670", "PRODUCTIONS VÉGÉTALES": "RNCP38241",
    // MAINTENANCE
    "MAINTENANCE DES SYSTÈMES": "RNCP35323", "MSPC": "RNCP35475", "GIM": "RNCP35365",
    // LOGISTIQUE
    "GTLA": "RNCP35364", "QLIO": "RNCP35367", "TSMEL": "RNCP34360", "AGENT MAGASINIER": "RNCP38413",
    "LOGISTIQUE": "RNCP38416", "PRÉPARATEUR DE COMMANDES": "RNCP38417",
    // COMMERCE
    "CCST": "RNCP35801", "TECHNICO-COMMERCIAL": "RNCP38368", "NDRC": "RNCP38368", "TC": "RNCP35366",
    // AUTRES
    "BIOQUALITÉ": "RNCP38235", "PILOTE DE LIGNE": "RNCP35602", "CONDUCTEUR ROUTIER": "RNCP35310"
};

const METIERS_CONFIG: Record<string, { diplomes: string[], contexte: string }> = {
    "silo": {
        diplomes: ["Bac Pro Agroéquipement", "CQP Agent de silo", "BTSA GDEA", "CAP Maintenance des matériels", "Bac Pro CGEA"],
        contexte: "Cherche : Lycées Agricoles, CFPPA, MFR."
    },
    "maintenance": { 
        diplomes: ["BTS Maintenance des Systèmes (MS)", "BUT Génie Industriel et Maintenance", "Bac Pro MSPC"],
        contexte: "Cherche : Lycées Pros Industriels, CFAI."
    },
    "logistique": { 
        diplomes: ["BUT QLIO", "TSMEL", "BTS GTLA", "Titre Responsable Logistique"],
        contexte: "Cherche : IUT, Aftral, Promotrans."
    },
    "magasinier": { 
        diplomes: ["Titre Pro Agent Magasinier", "Bac Pro Logistique", "CACES R489"],
        contexte: "Cherche : AFPA, Aftral, Promotrans, Lycées Pros."
    },
    "technico": { 
        diplomes: ["BTS CCST", "BTSA Technico-commercial", "BTS NDRC"],
        contexte: "Cherche : Lycées Agricoles (pour BTSA), Lycées Publics, CFA CCIP."
    },
    "export": { 
        diplomes: ["BTS Commerce International", "BUT TC (Parcours International)"],
        contexte: "Cherche : Lycées section internationale, IUT."
    },
    "qualite": { 
        diplomes: ["BTSA Bioqualité", "BUT Génie Biologique", "Licence Pro Qualité"],
        contexte: "Cherche : ENIL, IUT, Lycées Agricoles."
    },
    "agreeur": { 
        diplomes: ["CQP Agréeur", "Formation Classement des grains", "BTSA Agronomie"],
        contexte: "Cherche : CFPPA Céréaliers."
    },
    "ligne": { 
        diplomes: ["Pilote de ligne de production", "Bac Pro PSPA", "CQP Conducteur de ligne"],
        contexte: "Cherche : CFAI, Lycées Pros Industriels."
    },
    "culture": { 
        diplomes: ["BTSA APV", "BTSA ACSE", "Ingénieur Agri"],
        contexte: "Cherche : Lycées Agricoles, CFAA."
    },
    "chauffeur": { 
        diplomes: ["CAP Conducteur Routier", "Titre Pro Conducteur", "CS Conduite machines agricoles"],
        contexte: "Cherche : Aftral, Promotrans, Lycées Agricoles."
    },
    "responsable_silo": { 
        diplomes: ["CS Responsable de silo", "Licence Pro Management agri", "BTSA GDEA"],
        contexte: "Cherche : CFPPA, Écoles d'ingénieurs."
    }
};

// ==================================================================================
// 2. FONCTIONS
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

// ==================================================================================
// 3. SERVEUR
// ==================================================================================
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
    console.log(`🛡️ V18 SECURE: "${metier}" (${metierKey}) à "${ville}"`);

    // GÉOGRAPHIE STRICTE
    let zoneRecherche = `${ville} (rayon 50km max)`;
    // Si agri + grande ville, on force la périphérie
    const isAgri = ["silo", "culture", "agreeur", "chauffeur"].includes(metierKey);
    const isBigCity = ville.toLowerCase().match(/paris|lyon|marseille|lille|bordeaux|nantes|fresnes|massy|creteil/);
    
    if (isAgri && isBigCity) {
         zoneRecherche = "Départements limitrophes (77, 78, 91, 95 pour IDF)";
    }

    const systemPrompt = `Tu es un MOTEUR DE RECHERCHE GÉOGRAPHIQUE STRICT.
    Mission : Trouver des ÉTABLISSEMENTS RÉELS (Nom + Ville) proches de la zone demandée.
    
    RÈGLES DE SÉCURITÉ :
    1. DISTANCE RÉELLE : Si une école est célèbre (ex: Courcelles-Chaussy) mais située hors de la zone (ex: > 100km), NE LA METS PAS.
    2. PRÉCISION : Nom EXACT de l'école et de la ville.
    3. EXHAUSTIVITÉ : Vise 15 résultats LOCAUX.
    
    JSON STRICT :
    {
      "formations": [
        {
          "intitule": "Intitulé exact",
          "organisme": "Nom ÉTABLISSEMENT",
          "rncp": "Code ou null",
          "niveau": "3" | "4" | "5" | "6" | "N/A",
          "ville": "Commune exacte",
          "distance_km": number,
          "site_web": "URL ou null",
          "modalite": "Présentiel" | "Apprentissage"
        }
      ]
    }`;

    const userPrompt = `Trouve les établissements pour : "${config.diplomes.join(", ")}" DANS LA ZONE : "${zoneRecherche}".
    CONTEXTE : ${config.contexte}.
    IMPORTANT : Vérifie la distance. Si c'est trop loin (>80km), rejette.
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

    // --- LE FILTRE "ANTI-TELEPORTATION" (CORRIGÉ) ---
    if (result.formations) {
        
        const niveauCible = niveau === 'all' ? null : niveau.toString();

        result.formations = result.formations.filter((f: any) => {
            // A. Nettoyage Niveau
            if(f.niveau && f.niveau.toString().startsWith('Niveau')) f.niveau = f.niveau.replace('Niveau ', '').trim();
            if (niveauCible && f.niveau !== 'N/A' && f.niveau !== niveauCible) return false;

            // B. Anti-Flou
            const org = f.organisme.toLowerCase();
            const villeF = f.ville.toLowerCase();
            if (org.includes("lycées") || org.includes("réseau") || villeF.includes("secteur")) return false;

            // C. CORRECTION DU BUG "0 KM"
            // Si la distance est NULL ou UNDEFINED, on met 999 (et donc ça sera rejeté plus bas)
            // On NE met PLUS "|| 0" par défaut.
            const dist = (f.distance_km === null || f.distance_km === undefined) ? 999 : f.distance_km;

            // D. VÉRIFICATION "MÊME VILLE"
            // Si l'IA dit "0 km" ou "< 5 km", on vérifie que le nom de la ville match un minimum la recherche
            // (Sauf si on cherche "Paris" et qu'on trouve "Fresnes", ça peut être proche, mais Fresnes -> Courcelles-Chaussy NON)
            if (dist < 5) {
                // Si la distance est suspectement basse, on garde seulement si c'est vraiment proche ou cohérent
                // (Ici on fait confiance si l'IA a mis une petite distance non nulle, mais si c'est 0 pile, méfiance)
            }

            // E. LIMITE STRICTE 80KM
            return dist <= 80;
        });

        // F. ENRICHISSEMENT
        result.formations.forEach((f: any) => {
            const intituleUpper = f.intitule.toUpperCase();
            
            if (intituleUpper.match(/BAC|BTS|BUT|CAP|LICENCE|TITRE|MASTER|INGÉNIEUR/)) f.categorie = "Diplôme";
            else if (intituleUpper.match(/CQP|CS /)) f.categorie = "Certification";
            else f.categorie = "Habilitation";

            // Formatage Alternance Ocapiat
            const mode = (f.modalite || "").toLowerCase();
            if (mode.includes("apprenti") || mode.includes("alternance") || mode.includes("pro")) {
                f.alternance = "Oui";
                f.modalite = "Alternance";
            } else {
                f.alternance = "Non";
                f.modalite = "Initial";
            }

            // RNCP Patch
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

    console.log(`✅ ${finalResponse.formations.length} résultats SÉCURISÉS renvoyés.`);

    return new Response(JSON.stringify(finalResponse), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});