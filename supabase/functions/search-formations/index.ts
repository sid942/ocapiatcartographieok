import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ==================================================================================
// 1. LA BASE DE CONNAISSANCE STATIQUE (Le Cerveau Ocapiat)
// ==================================================================================

// Dictionnaire RNCP complet pour les 12 métiers (Plus besoin de DB)
const RNCP_DB: Record<string, string> = {
    // COMMERCIAL
    "CCST": "RNCP35801", "CONSEIL ET COMMERCIALISATION": "RNCP35801",
    "TECHNICO-COMMERCIAL": "RNCP38368", "NDRC": "RNCP38368", "NÉGOCIATION": "RNCP38368",
    "TECHNIQUES DE COMMERCIALISATION": "RNCP35366", "BUT TC": "RNCP35366",
    "COMMERCE INTERNATIONAL": "RNCP38372", "EXPORT": "RNCP38372",
    // SILO & AGRI
    "AGROÉQUIPEMENT": "RNCP38234", "AGENT DE SILO": "RNCP28779", "CONDUCTEUR DE SILO": "RNCP28779",
    "GDEA": "RNCP38243", "MAINTENANCE DES MATÉRIELS": "RNCP37039", "CGEA": "RNCP31670",
    "PRODUCTIONS VÉGÉTALES": "RNCP38241", "AGRONOMIE": "RNCP35850", "ACSE": "RNCP38240",
    "RESPONSABLE DE SILO": "RNCP_BRANCHE", "STOCKAGE": "RNCP28779",
    // LOGISTIQUE
    "GTLA": "RNCP35364", "GESTION DES TRANSPORTS": "RNCP35364",
    "QLIO": "RNCP35367", "TSMEL": "RNCP34360", "CHAIN LOGISTIQUE": "RNCP31112",
    "AGENT MAGASINIER": "RNCP38413", "LOGISTIQUE": "RNCP38416", "PRÉPARATEUR DE COMMANDES": "RNCP38417",
    "CACES": "Habilitation",
    // MAINTENANCE & INDUS
    "MAINTENANCE DES SYSTÈMES": "RNCP35323", "MSPC": "RNCP35475", "MEI": "RNCP24498",
    "GIM": "RNCP35365", "ÉLECTROTECHNIQUE": "RNCP35349", "CRSA": "RNCP35342",
    "PILOTE DE LIGNE": "RNCP35602", "PSPA": "RNCP35474", "CONDUCTEUR DE LIGNE": "RNCP_BRANCHE",
    // QUALITÉ
    "BIOQUALITÉ": "RNCP38235", "QIA": "RNCP38235", "BIOQUALIM": "RNCP36937",
    "GÉNIE BIOLOGIQUE": "RNCP35364", "AGRÉEUR": "RNCP_BRANCHE",
    // CONDUITE
    "CONDUCTEUR ROUTIER": "RNCP35310", "TRANSPORT ROUTIER": "RNCP35293", "CONDUITE DE MACHINES": "RNCP31962"
};

// Matrice des 12 Métiers : Définition exacte des diplômes cibles
const METIERS_CONFIG: Record<string, { diplomes: string[], contexte: string }> = {
    "silo": {
        diplomes: ["Bac Pro Agroéquipement", "CQP Agent de silo", "BTSA GDEA", "CAP Maintenance des matériels", "Bac Pro CGEA"],
        contexte: "Cherche : Lycées Agricoles, CFPPA, MFR."
    },
    "maintenance": { // Resp services techniques
        diplomes: ["BTS Maintenance des Systèmes (MS)", "BUT Génie Industriel et Maintenance (GIM)", "Bac Pro MSPC", "BTS Électrotechnique"],
        contexte: "Cherche : Lycées Pros Industriels, CFAI, IUT."
    },
    "logistique": { // Resp logistique
        diplomes: ["BUT QLIO", "TSMEL", "BTS GTLA", "Master Management de la chaîne logistique", "Titre Responsable Logistique"],
        contexte: "Cherche : IUT, Écoles de Transport (Aftral/Promotrans), Universités."
    },
    "magasinier": { 
        diplomes: ["Titre Pro Agent Magasinier", "Bac Pro Logistique", "CACES R489", "Titre Pro Préparateur de commandes"],
        contexte: "Cherche : AFPA, Aftral, Promotrans, Lycées Pros, GRETA."
    },
    "technico": { 
        diplomes: ["BTS CCST (ex-TC)", "BTSA Technico-commercial", "BTS NDRC", "BUT Techniques de Commercialisation"],
        contexte: "Cherche : Lycées Agricoles (Obligatoire pour BTSA), Lycées Publics, CFA CCIP."
    },
    "export": { 
        diplomes: ["BTS Commerce International", "BUT Techniques de Commercialisation (Parcours International)", "Master Commerce International"],
        contexte: "Cherche : Lycées avec section internationale, IUT, Écoles de Commerce."
    },
    "qualite": { 
        diplomes: ["BTSA Bioqualité (Bioqualim)", "BUT Génie Biologique", "Licence Pro Qualité Agroalimentaire"],
        contexte: "Cherche : ENIL, IUT, Lycées Agricoles."
    },
    "agreeur": { 
        diplomes: ["CQP Agréeur", "Formation Classement des grains", "CS Stockage de céréales", "BTSA Agronomie"],
        contexte: "Cherche : CFPPA Céréaliers, Organismes de la branche (Vérifie les adresses physiques)."
    },
    "ligne": { 
        diplomes: ["Pilote de ligne de production", "Bac Pro PSPA", "CQP Conducteur de ligne", "BTS Pilotage de procédés"],
        contexte: "Cherche : CFAI, Lycées Pros Industriels."
    },
    "culture": { 
        diplomes: ["BTSA Agronomie Productions Végétales (APV)", "BTSA ACSE", "Licence Pro Agronomie", "Ingénieur Agri"],
        contexte: "Cherche : Lycées Agricoles, CFAA, Écoles d'Ingénieurs."
    },
    "chauffeur": { 
        diplomes: ["CAP Conducteur Routier", "Titre Pro Conducteur du transport routier", "CS Conduite de machines agricoles"],
        contexte: "Cherche : Aftral, Promotrans, Lycées Agricoles (Machinisme)."
    },
    "responsable_silo": { 
        diplomes: ["CS Responsable de silo", "Licence Pro Management des organisations agricoles", "BTSA GDEA"],
        contexte: "Cherche : CFPPA, Écoles d'ingénieurs (formation continue)."
    }
};

// ==================================================================================
// 2. FONCTIONS UTILITAIRES (L'intelligence embarquée)
// ==================================================================================

// Routeur Sémantique : Transforme le texte utilisateur en clé système (1 parmi 12)
function detecterMetier(input: string): string {
    const m = input.toLowerCase();
    if (m.match(/silo|grain|stockage/)) return m.includes("responsable") ? "responsable_silo" : "silo";
    if (m.match(/culture|végétal|céréale|agronomie|plante|maraichage/)) return "culture";
    if (m.match(/chauffeur|conducteur|tracteur|routier|transport|engin/)) return m.includes("ligne") ? "ligne" : "chauffeur";
    if (m.match(/maintenance|technique|élec|méca|automatisme/)) return "maintenance";
    if (m.match(/logistique|supply/)) return m.includes("responsable") ? "logistique" : "magasinier";
    if (m.match(/magasinier|cariste|chariot|entrepot/)) return "magasinier";
    if (m.match(/commercial|vente|négoce|business|technico/)) return m.match(/export|inter/) ? "export" : "technico";
    if (m.match(/qualité|contrôle|qhse/)) return "qualite";
    if (m.match(/agréeur|agréage/)) return "agreeur";
    if (m.match(/ligne|production|pilote/)) return "ligne";
    return "technico"; // Fallback safe
}

// ==================================================================================
// 3. LE SERVEUR
// ==================================================================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { metier, ville, niveau } = await req.json();
    if (!metier || !ville) throw new Error("Paramètres manquants");

    const perplexityApiKey = Deno.env.get("PERPLEXITY_API_KEY");
    if (!perplexityApiKey) throw new Error("Clé API Perplexity manquante");

    // 1. DÉTECTION INTELLIGENTE
    const metierKey = detecterMetier(metier);
    const config = METIERS_CONFIG[metierKey];
    console.log(`🧠 SYSTÈME EXPERT: Entrée="${metier}" -> Clé="${metierKey}"`);

    // 2. STRATÉGIE GÉOGRAPHIQUE
    // Si métier Agri + Grande Ville => On force la périphérie
    let zoneRecherche = `${ville} (et environs 50km)`;
    const isAgri = ["silo", "culture", "agreeur", "chauffeur", "responsable_silo"].includes(metierKey);
    if (isAgri && ville.toLowerCase().match(/paris|lyon|marseille|lille|bordeaux|nantes|massy|fresnes|montpellier/)) {
         zoneRecherche = "Périphérie rurale et départements limitrophes (max 60km)";
    }

    // 3. CONSTRUCTION DU PROMPT
    const systemPrompt = `Tu es un MOTEUR DE RECHERCHE D'ÉTABLISSEMENTS SCOLAIRES.
    Mission : Trouver des ÉTABLISSEMENTS RÉELS (Nom + Ville) pour les diplômes demandés.
    
    RÈGLES ABSOLUES :
    1. PRÉCISION : Interdiction des généralités ("Les lycées"). Donne le NOM EXACT.
    2. VÉRITÉ : Si tu ne trouves pas d'école pour un diplôme précis, ne l'invente pas.
    3. VOLUME : Cherche large (Public, Privé, CFA, MFR). Vise 10-15 résultats.
    
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

    const userPrompt = `Trouve les établissements pour : "${config.diplomes.join(", ")}" dans la zone "${zoneRecherche}".
    CONTEXTE : ${config.contexte}.
    Renvoie le JSON.`;

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

    if (!perplexityResponse.ok) throw new Error(`Erreur API: ${perplexityResponse.status}`);
    const data = await perplexityResponse.json();
    
    // 5. PARSING
    let result;
    try {
        const clean = data.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
        result = JSON.parse(clean);
    } catch (e) {
        const match = data.choices[0].message.content.match(/\{[\s\S]*\}/);
        if (match) result = JSON.parse(match[0]);
        else throw new Error("Erreur JSON IA");
    }

    // 6. LE FILTRE SYSTÉMIQUE (Nettoyage + Enrichissement)
    if (result.formations) {
        
        const niveauCible = niveau === 'all' ? null : niveau.toString();

        result.formations = result.formations.filter((f: any) => {
            // A. Nettoyage Niveau
            if(f.niveau && f.niveau.toString().startsWith('Niveau')) f.niveau = f.niveau.replace('Niveau ', '').trim();
            if (niveauCible && f.niveau !== 'N/A' && f.niveau !== niveauCible) return false;

            // B. Anti-Flou (Noms génériques)
            const org = f.organisme.toLowerCase();
            const villeF = f.ville.toLowerCase();
            const badTerms = ["lycées", "réseau", "structures", "organismes", "divers", "habilités"];
            const badCities = ["secteur", "zone", "départements", "alentours", "proximité"];
            
            if (badTerms.some(t => org.includes(t) && !org.startsWith("lycée") && !org.startsWith("cfa") && !org.startsWith("mfr") && !org.startsWith("cfppa"))) return false;
            if (badCities.some(v => villeF.includes(v))) return false;

            // C. DISTANCE STRICTE (60km MAX)
            // C'est ça qui élimine Perpignan quand on cherche à Montpellier
            return (f.distance_km || 0) <= 60;
        });

        // D. ENRICHISSEMENT AUTOMATIQUE (RNCP + CAT)
        result.formations.forEach((f: any) => {
            const intituleUpper = f.intitule.toUpperCase();
            
            // Catégorie
            if (intituleUpper.match(/BAC|BTS|BUT|CAP|LICENCE|TITRE|MASTER|INGÉNIEUR/)) f.categorie = "Diplôme";
            else if (intituleUpper.match(/CQP|CS /)) f.categorie = "Certification";
            else f.categorie = "Habilitation";

            // RNCP Automatique (Le Patch)
            if (!f.rncp || f.rncp.length < 5 || f.rncp === "Non renseigné") {
                for (const [key, code] of Object.entries(RNCP_DB)) {
                    if (intituleUpper.includes(key)) {
                        f.rncp = code;
                        break;
                    }
                }
            }
        });

        // Tri
        result.formations.sort((a: any, b: any) => (a.distance_km || 999) - (b.distance_km || 999));
    }

    // Reconstruction de la réponse pour le Front
    const finalResponse = {
        metier_normalise: metier,
        ville_reference: ville,
        formations: result.formations || []
    };

    console.log(`✅ SUCCÈS: ${finalResponse.formations.length} résultats renvoyés.`);

    return new Response(JSON.stringify(finalResponse), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});