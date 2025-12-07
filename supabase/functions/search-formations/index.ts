import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// --- 1. LE CERVEAU MÉTIER (MATRICE D'EXPERTISE OCAPIAT) ---
// Cette constante définit l'intelligence humaine pour chaque métier.
// Elle associe un métier à TOUS ses diplômes possibles (Passerelles incluses).
const METIERS_DATA: Record<string, { diplomes: string[], rncp_map: Record<string, string>, contexte: string }> = {
    "silo": {
        diplomes: ["Bac Pro Agroéquipement", "CQP Agent de silo", "CQP Conducteur de silo", "BTSA GDEA", "CAP Maintenance des matériels", "CS Responsable de silo", "Bac Pro CGEA"],
        rncp_map: { "AGROÉQUIPEMENT": "RNCP38234", "AGENT DE SILO": "RNCP28779", "GDEA": "RNCP38243", "MAINTENANCE DES MATÉRIELS": "RNCP37039", "CGEA": "RNCP31670", "CONDUCTEUR DE SILO": "RNCP28779" },
        contexte: "Cible : Lycées Agricoles, CFPPA, MFR. Évite les zones purement urbaines."
    },
    "maintenance": { // Responsable services techniques
        diplomes: ["BTS Maintenance des Systèmes", "BUT Génie Industriel et Maintenance", "Bac Pro MSPC", "BTS Électrotechnique", "BTS CRSA", "Licence Pro Maintenance"],
        rncp_map: { "MAINTENANCE DES SYSTÈMES": "RNCP35323", "GIM": "RNCP35365", "MSPC": "RNCP35475", "ÉLECTROTECHNIQUE": "RNCP35349", "CRSA": "RNCP35342" },
        contexte: "Cible : Lycées Professionnels Industriels, CFAI, IUT."
    },
    "logistique": { // Responsable logistique
        diplomes: ["BUT QLIO", "TSMEL", "BTS GTLA", "Master Logistique", "Responsable de la chaîne logistique"],
        rncp_map: { "QLIO": "RNCP35367", "TSMEL": "RNCP34360", "GTLA": "RNCP35311", "CHAIN LOGISTIQUE": "RNCP31112" },
        contexte: "Cible : IUT, Écoles de Transport (Aftral/Promotrans), Universités."
    },
    "magasinier": { // Magasinier / Cariste
        diplomes: ["Titre Pro Agent Magasinier", "Bac Pro Logistique", "CACES R489", "Titre Pro Préparateur de commandes", "CAP Opérateur Logistique"],
        rncp_map: { "AGENT MAGASINIER": "RNCP38413", "LOGISTIQUE": "RNCP38416", "PRÉPARATEUR DE COMMANDES": "RNCP38417", "OPÉRATEUR LOGISTIQUE": "RNCP38415" },
        contexte: "Cible : AFPA, Aftral, Promotrans, Lycées Pros, GRETA."
    },
    "technico": { // Technico-commercial
        diplomes: ["BTS CCST", "BTSA Technico-commercial", "BTS NDRC", "BUT Techniques de Commercialisation", "Licence Pro Technico-Commercial"],
        rncp_map: { "CCST": "RNCP35801", "TECHNICO-COMMERCIAL": "RNCP38368", "NDRC": "RNCP38368", "TECHNIQUES DE COMMERCIALISATION": "RNCP35366" },
        contexte: "Cible : Lycées Agricoles (Obligatoire pour BTSA), Lycées Publics, CFA CCIP."
    },
    "export": { // Commercial export
        diplomes: ["BTS Commerce International", "BUT Techniques de Commercialisation", "Licence Pro Commerce International", "Master Commerce International"],
        rncp_map: { "COMMERCE INTERNATIONAL": "RNCP38372", "TECHNIQUES DE COMMERCIALISATION": "RNCP35366" },
        contexte: "Cible : Lycées avec section internationale, IUT, Écoles de Commerce."
    },
    "qualite": { // Contrôleur qualité
        diplomes: ["BTSA Bioqualité", "BUT Génie Biologique", "BTS QIABI", "Licence Pro Qualité Agroalimentaire", "Titre Pro Technicien Qualité"],
        rncp_map: { "BIOQUALITÉ": "RNCP38235", "GÉNIE BIOLOGIQUE": "RNCP35364", "QIABI": "RNCP38249", "TECHNICIEN QUALITÉ": "RNCP35860" },
        contexte: "Cible : ENIL (Écoles laitières), IUT, Lycées Agricoles."
    },
    "agreeur": { // Agréeur
        diplomes: ["CQP Agréeur", "Formation Classement des grains", "CS Stockage de céréales", "BTSA Agronomie Productions Végétales"],
        rncp_map: { "AGRÉEUR": "RNCP_BRANCHE", "STOCKAGE": "RNCP28779", "PRODUCTIONS VÉGÉTALES": "RNCP38241" },
        contexte: "Cible : CFPPA Céréaliers, Organismes de branche."
    },
    "ligne": { // Conducteur de ligne
        diplomes: ["Pilote de ligne de production", "Bac Pro PSPA", "CQP Conducteur de ligne", "BTS Pilotage de procédés"],
        rncp_map: { "PILOTE DE LIGNE": "RNCP35602", "PSPA": "RNCP35474", "CONDUCTEUR DE LIGNE": "RNCP_BRANCHE", "PILOTAGE DE PROCÉDÉS": "RNCP35327" },
        contexte: "Cible : CFAI, Lycées Pros Industriels, IMT."
    },
    "culture": { // Technicien culture
        diplomes: ["BTSA Agronomie Productions Végétales", "BTSA ACSE", "Licence Pro Agronomie", "Ingénieur Agronome"],
        rncp_map: { "PRODUCTIONS VÉGÉTALES": "RNCP38241", "ACSE": "RNCP38240", "AGRONOMIE": "RNCP35850" },
        contexte: "Cible : Lycées Agricoles, Écoles d'Ingénieurs Agri."
    },
    "chauffeur": { // Chauffeur agricole
        diplomes: ["CAP Conducteur Routier", "Titre Pro Conducteur du transport routier", "CS Conduite de machines agricoles", "BPA Conducteur"],
        rncp_map: { "CONDUCTEUR ROUTIER": "RNCP35310", "TRANSPORT ROUTIER": "RNCP35293", "CONDUITE DE MACHINES": "RNCP12345" },
        contexte: "Cible : Aftral, Promotrans, Lycées Agricoles (pour le machinisme)."
    },
    "responsable_silo": { // Responsable silo
        diplomes: ["CS Responsable de silo", "Licence Pro Management des organisations agricoles", "BTSA GDEA", "BTSA ACSE"],
        rncp_map: { "RESPONSABLE DE SILO": "RNCP_BRANCHE", "GDEA": "RNCP38243", "ACSE": "RNCP38240" },
        contexte: "Cible : CFPPA, Écoles d'ingénieurs (formation continue)."
    }
};

const SYSTEM_PROMPT = `Tu es un MOTEUR DE RECHERCHE D'ÉTABLISSEMENTS SCOLAIRES (Crawler Live).
Ta mission : Scanner le web pour trouver TOUS les établissements réels dispensant les formations demandées dans le rayon indiqué.

RÈGLES D'INTELLIGENCE HUMAINE :
1. ZÉRO INVENTION : Si l'école n'existe pas, tu ne l'inventes pas.
2. ADRESSE RÉELLE : Tu dois être capable de situer l'école (Ville précise). Pas de "Secteur", "Zone".
3. VOLUME MAXIMAL : Ne te limite pas. Trouve tout ce qui existe (Lycées publics, Privés, CFA, MFR, GRETA).
4. NOMMAGE PROPRE : Donne le nom officiel (ex: "Lycée Agricole Bougainville"). Pas de "Réseau truc".

FORMAT JSON STRICT :
{
  "metier_normalise": "string",
  "ville_reference": "string",
  "formations": [
    {
      "intitule": "Intitulé exact",
      "organisme": "Nom ÉTABLISSEMENT",
      "rncp": "Code ou null",
      "categorie": "Diplôme" | "Certification" | "Habilitation",
      "niveau": "3" | "4" | "5" | "6" | "N/A",
      "ville": "Commune exacte",
      "distance_km": number,
      "site_web": "URL ou null",
      "modalite": "Présentiel" | "Apprentissage"
    }
  ]
}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { metier, ville, niveau } = await req.json();
    if (!metier || !ville) throw new Error("Paramètres manquants");

    const perplexityApiKey = Deno.env.get("PERPLEXITY_API_KEY");
    if (!perplexityApiKey) throw new Error("Clé API Perplexity manquante");

    console.log(`🧠 RECHERCHE MASTER V15: ${metier} à ${ville}`);

    // --- 2. DÉTECTION DU MÉTIER ET CHARGEMENT DE L'INTELLIGENCE ---
    const m = metier.toLowerCase();
    let metierKey = "technico"; // Fallback par défaut

    // Logique de détection précise
    if (m.includes("silo") && m.includes("responsable")) metierKey = "responsable_silo";
    else if (m.includes("silo")) metierKey = "silo";
    else if (m.includes("maintenance") || m.includes("services techniques")) metierKey = "maintenance";
    else if (m.includes("responsable logistique")) metierKey = "logistique";
    else if (m.includes("magasinier") || m.includes("cariste") || m.includes("logistique")) metierKey = "magasinier";
    else if (m.includes("export")) metierKey = "export";
    else if (m.includes("technico") || m.includes("commercial")) metierKey = "technico";
    else if (m.includes("agréeur")) metierKey = "agreeur";
    else if (m.includes("qualité") || m.includes("contrôleur")) metierKey = "qualite";
    else if (m.includes("ligne") || m.includes("conducteur de ligne")) metierKey = "ligne";
    else if (m.includes("culture")) metierKey = "culture";
    else if (m.includes("chauffeur")) metierKey = "chauffeur";

    const expertise = METIERS_DATA[metierKey];

    // --- 3. LOGIQUE GÉOGRAPHIQUE ÉLARGIE (AUTOMATIQUE) ---
    // Si c'est un métier rare (Silo, Agréeur), on cherche automatiquement plus loin (50km)
    let rayon = "50km";
    let zoneRecherche = `${ville} et alentours (${rayon})`;

    // Pour l'agricole en zone urbaine, on force la périphérie
    if (["silo", "culture", "agreeur", "chauffeur"].includes(metierKey)) {
         if (ville.toLowerCase().match(/paris|lyon|marseille|lille/)) {
             zoneRecherche = "Grande périphérie rurale (jusqu'à 60km du centre)";
         }
    }

    const userPrompt = `Recherche TOUS les établissements pour ces diplômes : "${expertise.diplomes.join(", ")}" dans la zone "${zoneRecherche}".
    
    CONTEXTE : ${expertise.contexte}
    
    INSTRUCTIONS CRITIQUES :
    1. EXHAUSTIVITÉ : Liste ABSOLUMENT TOUT ce que tu trouves de réel. Vise 15 résultats si possible.
    2. PRÉCISION : Interdiction des généralités ("Les lycées"). Donne le NOM + VILLE pour chaque résultat.
    3. PAS D'INVENTION : Si tu ne trouves rien pour un diplôme précis, passe au suivant.
    
    Renvoie le JSON uniquement.`;

    // --- 4. APPEL PERPLEXITY ---
    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${perplexityApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userPrompt }],
        temperature: 0.1,
        max_tokens: 4000
      }),
    });

    if (!perplexityResponse.ok) throw new Error(`Erreur API Perplexity: ${perplexityResponse.status}`);
    const data = await perplexityResponse.json();
    
    // --- 5. PARSING ---
    let result;
    try {
        const clean = data.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
        result = JSON.parse(clean);
    } catch (e) {
        const match = data.choices[0].message.content.match(/\{[\s\S]*\}/);
        if (match) result = JSON.parse(match[0]);
        else throw new Error("Erreur JSON IA");
    }

    // --- 6. LE FILTRE HUMAIN (JAVASCRIPT) ---
    if (result.formations) {
        
        const niveauCible = niveau === 'all' ? null : niveau.toString();

        result.formations = result.formations.filter((f: any) => {
            // A. Nettoyage Niveau
            if(f.niveau && f.niveau.toString().startsWith('Niveau')) f.niveau = f.niveau.replace('Niveau ', '').trim();
            if (niveauCible && f.niveau !== 'N/A' && f.niveau !== niveauCible) return false;

            // B. Anti-Flou Strict
            const org = f.organisme.toLowerCase();
            const villeF = f.ville.toLowerCase();
            const termesInterdits = ["lycées", "réseau", "structures", "organismes", "plusieurs", "divers", "habilités"];
            const villesInterdites = ["secteur", "zone", "départements", "alentours", "proximité"];
            
            if (termesInterdits.some(t => org.includes(t) && !org.startsWith("lycée") && !org.startsWith("cfa") && !org.startsWith("mfr"))) return false;
            if (villesInterdites.some(v => villeF.includes(v))) return false;

            // C. Distance (On accepte jusqu'à 80km pour les métiers rares)
            return (f.distance_km || 0) <= 80;
        });

        // D. ENRICHISSEMENT INTELLIGENT (RNCP + CATÉGORIE)
        result.formations.forEach((f: any) => {
            // 1. Catégorisation auto
            const intitule = f.intitule.toUpperCase();
            if (intitule.includes("BAC") || intitule.includes("BTS") || intitule.includes("BUT") || intitule.includes("CAP") || intitule.includes("LICENCE") || intitule.includes("TITRE PRO")) {
                f.categorie = "Diplôme";
            } else if (intitule.includes("CQP") || intitule.includes("CS ")) {
                f.categorie = "Certification";
            } else if (intitule.includes("CACES") || intitule.includes("HABI")) {
                f.categorie = "Habilitation";
            }

            // 2. Patch RNCP Intelligent
            if (!f.rncp || f.rncp.length < 5 || f.rncp === "Non renseigné") {
                // On cherche dans la map du métier concerné
                for (const [key, code] of Object.entries(expertise.rncp_map)) {
                    if (intitule.includes(key)) {
                        f.rncp = code;
                        break;
                    }
                }
            }
        });

        // Tri
        result.formations.sort((a: any, b: any) => (a.distance_km || 999) - (b.distance_km || 999));
    }

    if (!result.metier_normalise) result.metier_normalise = metier;
    if (!result.ville_reference) result.ville_reference = ville;

    console.log(`✅ ${result.formations?.length || 0} résultats EXPERTS renvoyés.`);

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});