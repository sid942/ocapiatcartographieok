import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ==================================================================================
// 1. BASE DE DONNÉES RNCP (DICTIONNAIRE COMPLET 12 MÉTIERS)
// ==================================================================================
const RNCP_DB: Record<string, string> = {
    // --- 1. SILO & AGREEUR ---
    "AGROÉQUIPEMENT": "RNCP38234", "AGENT DE SILO": "RNCP28779", "GDEA": "RNCP38243",
    "MAINTENANCE DES MATÉRIELS": "RNCP37039", "CGEA": "RNCP31670", "AGRÉEUR": "RNCP_BRANCHE",
    "STOCKAGE": "RNCP28779", "RESPONSABLE DE SILO": "RNCP_BRANCHE",
    // --- 2. LOGISTIQUE & MAGASINIER ---
    "AGENT MAGASINIER": "RNCP38413", "LOGISTIQUE": "RNCP38416", "PRÉPARATEUR DE COMMANDES": "RNCP38417",
    "CACES": "Habilitation", "GTLA": "RNCP35364", "QLIO": "RNCP35367", "TSMEL": "RNCP34360",
    "RESPONSABLE LOGISTIQUE": "RNCP31112", "SUPPLY CHAIN": "RNCP35914",
    // --- 3. MAINTENANCE & INDUS ---
    "MAINTENANCE DES SYSTÈMES": "RNCP35323", "MSPC": "RNCP35475", "GIM": "RNCP35365",
    "ÉLECTROTECHNIQUE": "RNCP35349", "CRSA": "RNCP35342", "PILOTE DE LIGNE": "RNCP35602",
    "PSPA": "RNCP35474", "CONDUCTEUR DE LIGNE": "RNCP_BRANCHE",
    // --- 4. COMMERCE & EXPORT ---
    "CCST": "RNCP35801", "TECHNICO-COMMERCIAL": "RNCP38368", "NDRC": "RNCP38368", "TC": "RNCP35366",
    "COMMERCE INTERNATIONAL": "RNCP38372", "BACHELOR": "RNCP36367", "MANAGER INTERNATIONAL": "RNCP34206",
    "RESPONSABLE DE ZONE": "RNCP31913",
    // --- 5. QUALITÉ ---
    "BIOQUALITÉ": "RNCP38235", "BIOQUALIM": "RNCP36937", "GÉNIE BIOLOGIQUE": "RNCP35364",
    // --- 6. CULTURE & CONDUITE ---
    "PRODUCTIONS VÉGÉTALES": "RNCP38241", "ACSE": "RNCP38240", "AGRONOMIE": "RNCP35850",
    "CONDUCTEUR ROUTIER": "RNCP35310", "TRANSPORT ROUTIER": "RNCP35293", "CONDUITE DE MACHINES": "RNCP31962"
};

// ==================================================================================
// 2. MATRICE D'INTELLIGENCE MÉTIER (LES 12 CAS)
// ==================================================================================
const METIERS_CONFIG: Record<string, { diplomes: string[], contexte: string }> = {
    // 1. TECHNICO-COMMERCIAL
    "technico": { 
        diplomes: ["BTS CCST (ex-TC)", "BTSA Technico-commercial", "BTS NDRC", "BUT Techniques de Commercialisation", "Licence Pro Technico-Commercial"],
        contexte: "Cherche : Lycées Agricoles (Obligatoire pour BTSA), Lycées Publics, CFA CCIP, Écoles de commerce."
    },
    // 2. AGENT DE SILO
    "silo": {
        diplomes: ["Bac Pro Agroéquipement", "CQP Agent de silo", "BTSA GDEA", "CAP Maintenance des matériels", "Bac Pro CGEA"],
        contexte: "Cherche : Lycées Agricoles, CFPPA, MFR. Évite les zones purement urbaines."
    },
    // 3. CHAUFFEUR AGRICOLE
    "chauffeur": { 
        diplomes: ["CAP Conducteur Routier", "Titre Pro Conducteur du transport routier", "CS Conduite de machines agricoles", "BPA Travaux de la conduite"],
        contexte: "Cherche : Aftral, Promotrans, Lycées Agricoles (pour le machinisme)."
    },
    // 4. RESPONSABLE SILO
    "responsable_silo": { 
        diplomes: ["CS Responsable de silo", "Licence Pro Management des organisations agricoles", "BTSA GDEA", "Ingénieur Agri"],
        contexte: "Cherche : CFPPA, Écoles d'ingénieurs Agri (formation continue)."
    },
    // 5. RESPONSABLE LOGISTIQUE
    "logistique": { 
        diplomes: ["BUT QLIO", "TSMEL", "BTS GTLA", "Master Management de la chaîne logistique", "Titre Responsable Logistique"],
        contexte: "Cherche : IUT, Aftral, Promotrans, Universités, IAE."
    },
    // 6. MAGASINIER / CARISTE
    "magasinier": { 
        diplomes: ["Titre Pro Agent Magasinier", "Bac Pro Logistique", "CACES R489", "Titre Pro Préparateur de commandes"],
        contexte: "Cherche : AFPA, Aftral, Promotrans, Lycées Pros, GRETA."
    },
    // 7. RESPONSABLE SERVICES TECHNIQUES
    "maintenance": { 
        diplomes: ["BTS Maintenance des Systèmes (MS)", "BUT Génie Industriel et Maintenance (GIM)", "Bac Pro MSPC", "BTS Électrotechnique"],
        contexte: "Cherche : Lycées Pros Industriels, CFAI, IUT."
    },
    // 8. CONTRÔLEUR QUALITÉ
    "qualite": { 
        diplomes: ["BTSA Bioqualité (Bioqualim)", "BUT Génie Biologique (IAB)", "Licence Pro Qualité Agroalimentaire"],
        contexte: "Cherche : ENIL (Écoles laitières), IUT, Lycées Agricoles."
    },
    // 9. AGRÉEUR
    "agreeur": { 
        diplomes: ["CQP Agréeur", "Formation Classement des grains", "CS Stockage de céréales", "BTSA Agronomie"],
        contexte: "Cherche : CFPPA Céréaliers, Organismes de la branche."
    },
    // 10. CONDUCTEUR DE LIGNE
    "ligne": { 
        diplomes: ["Pilote de ligne de production", "Bac Pro PSPA", "CQP Conducteur de ligne", "BTS Pilotage de procédés"],
        contexte: "Cherche : CFAI, Lycées Pros Industriels, Instituts des métiers."
    },
    // 11. TECHNICIEN CULTURE
    "culture": { 
        diplomes: ["BTSA Agronomie Productions Végétales (APV)", "BTSA ACSE", "Licence Pro Agronomie", "Ingénieur Agronome"],
        contexte: "Cherche : Lycées Agricoles, CFAA, Écoles d'Ingénieurs Agri."
    },
    // 12. COMMERCIAL EXPORT
    "export": { 
        diplomes: ["BTS Commerce International", "BUT Techniques de Commercialisation (Parcours International)", "Bachelor Business International", "Master Commerce International"],
        contexte: "Cherche : Lycées avec section internationale, IUT, Écoles de Commerce (Business Schools), IAE."
    }
};

// ==================================================================================
// 3. LOGIQUE DE DÉTECTION (FUZZY MATCHING ROBUSTE)
// ==================================================================================
function detecterMetier(input: string): string {
    const m = input.toLowerCase();
    
    // Ordre de priorité : Du plus spécifique au plus générique
    if (m.includes("responsable silo")) return "responsable_silo";
    if (m.includes("silo") || m.includes("grain")) return "silo";
    
    if (m.includes("culture") || m.includes("végétal") || m.includes("céréale") || m.includes("agronomie")) return "culture";
    
    if (m.includes("agréeur") || m.includes("agréage")) return "agreeur";
    
    if (m.includes("export") || m.includes("international")) return "export";
    
    if (m.includes("ligne") || m.includes("pilote") || m.includes("production")) return "ligne";
    
    if (m.includes("chauffeur") || m.includes("conducteur") || m.includes("routier") || m.includes("tracteur")) return "chauffeur";
    
    if (m.includes("responsable logistique") || m.includes("supply")) return "logistique";
    if (m.includes("magasinier") || m.includes("cariste") || m.includes("logistique")) return "magasinier"; // Fallback logistique simple
    
    if (m.includes("maintenance") || m.includes("technique") || m.includes("méca") || m.includes("élec")) return "maintenance";
    
    if (m.includes("qualité") || m.includes("contrôle") || m.includes("bio")) return "qualite";
    
    // Par défaut, commercial (le plus large)
    return "technico";
}

// ==================================================================================
// 4. LE SERVEUR
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
    console.log(`🛡️ V20 SYSTEMIC: "${metier}" -> Detected: "${metierKey}"`);

    // 2. STRATÉGIE GÉOGRAPHIQUE DYNAMIQUE
    let zoneRecherche = `${ville} (rayon 50km max)`;
    const isAgri = ["silo", "culture", "agreeur", "chauffeur", "responsable_silo"].includes(metierKey);
    const isExport = metierKey === "export";
    const isBigCity = ville.toLowerCase().match(/paris|lyon|marseille|lille|bordeaux|nantes|fresnes|massy|creteil|toulouse|nice/);
    
    if (isAgri && isBigCity) {
         // Si Agri en ville -> On force la campagne
         zoneRecherche = "Périphérie rurale et départements limitrophes (max 60km)";
    } else if (isExport && isBigCity) {
         // Si Export en ville -> On précise l'agglo pour choper les Business Schools
         zoneRecherche = `${ville} et agglomération (Business Schools, IUT, Universités)`;
    }

    const systemPrompt = `Tu es un MOTEUR DE RECHERCHE D'ÉTABLISSEMENTS SCOLAIRES.
    Mission : Trouver des ÉTABLISSEMENTS RÉELS (Nom + Ville) proches de la zone demandée.
    
    RÈGLES D'OR :
    1. EXHAUSTIVITÉ : Ne t'arrête pas à 3 résultats. Vise 15 résultats (Public, Privé, CFA, MFR).
    2. PRÉCISION : Donne le NOM EXACT de l'école. Pas de "Réseau GRETA" ou "Les lycées".
    3. LOCALISATION : Vérifie que l'école est bien dans la zone. Pas d'école à 300km.
    
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
    Renvoie le JSON.`;

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

    // --- 4. LE GRAND FILTRE (SECURITE + FORMATAGE) ---
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
            
            if (badTerms.some(t => org.includes(t) && !org.startsWith("lycée") && !org.startsWith("cfa") && !org.startsWith("mfr"))) return false;
            if (badCities.some(v => villeF.includes(v))) return false;

            // C. DISTANCE STRICTE (80km MAX)
            // Si null/undefined -> On met 999 pour rejeter. On ne met JAMAIS 0 par défaut.
            const dist = (f.distance_km === null || f.distance_km === undefined) ? 999 : f.distance_km;
            return dist <= 80;
        });

        // D. ENRICHISSEMENT (RNCP + ALTERNANCE + CATEGORIE)
        result.formations.forEach((f: any) => {
            const intituleUpper = f.intitule.toUpperCase();
            
            // Catégorie
            if (intituleUpper.match(/BAC|BTS|BUT|CAP|LICENCE|TITRE|MASTER|INGÉNIEUR|BACHELOR/)) f.categorie = "Diplôme";
            else if (intituleUpper.match(/CQP|CS /)) f.categorie = "Certification";
            else f.categorie = "Habilitation";

            // Formatage Alternance (Oui/Non) pour Email Ocapiat
            const mode = (f.modalite || "").toLowerCase();
            if (mode.includes("apprenti") || mode.includes("alternance") || mode.includes("pro") || mode.includes("mixte")) {
                f.alternance = "Oui";
                f.modalite = "Alternance";
            } else {
                f.alternance = "Non";
                f.modalite = "Initial";
            }

            // RNCP Automatique
            if (!f.rncp || f.rncp.length < 5 || f.rncp === "Non renseigné") {
                for (const [key, code] of Object.entries(RNCP_DB)) {
                    if (intituleUpper.includes(key)) {
                        f.rncp = code;
                        break;
                    }
                }
            }
        });

        // Tri par distance
        result.formations.sort((a: any, b: any) => (a.distance_km || 999) - (b.distance_km || 999));
    }

    const finalResponse = {
        metier_normalise: metier,
        ville_reference: ville,
        formations: result.formations || []
    };

    console.log(`✅ SUCCÈS: ${finalResponse.formations.length} résultats SÉCURISÉS renvoyés.`);

    return new Response(JSON.stringify(finalResponse), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});