import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// --- 1. MATRICE D'EXPERTISE (DATA DIPLÔMES & RNCP) ---
const METIERS_DATA: Record<string, { diplomes: string[], rncp_map: Record<string, string>, contexte: string }> = {
    "silo": {
        diplomes: ["Bac Pro Agroéquipement", "CQP Agent de silo", "CQP Conducteur de silo", "BTSA GDEA", "CAP Maintenance des matériels", "CS Responsable de silo", "Bac Pro CGEA"],
        rncp_map: { "AGROÉQUIPEMENT": "RNCP38234", "AGENT DE SILO": "RNCP28779", "GDEA": "RNCP38243", "MAINTENANCE DES MATÉRIELS": "RNCP37039", "CGEA": "RNCP31670" },
        contexte: "Cible : Lycées Agricoles, CFPPA, MFR. Évite les zones purement urbaines."
    },
    "maintenance": { 
        diplomes: ["BTS Maintenance des Systèmes", "BUT Génie Industriel et Maintenance", "Bac Pro MSPC", "BTS Électrotechnique", "BTS CRSA", "Licence Pro Maintenance"],
        rncp_map: { "MAINTENANCE DES SYSTÈMES": "RNCP35323", "GIM": "RNCP35365", "MSPC": "RNCP35475", "ÉLECTROTECHNIQUE": "RNCP35349", "CRSA": "RNCP35342" },
        contexte: "Cible : Lycées Professionnels Industriels, CFAI, IUT."
    },
    "logistique": { 
        diplomes: ["BUT QLIO", "TSMEL", "BTS GTLA", "Master Logistique", "Responsable de la chaîne logistique"],
        rncp_map: { "QLIO": "RNCP35367", "TSMEL": "RNCP34360", "GTLA": "RNCP35311", "CHAIN LOGISTIQUE": "RNCP31112" },
        contexte: "Cible : IUT, Écoles de Transport (Aftral/Promotrans), Universités."
    },
    "magasinier": { 
        diplomes: ["Titre Pro Agent Magasinier", "Bac Pro Logistique", "CACES R489", "Titre Pro Préparateur de commandes", "CAP Opérateur Logistique"],
        rncp_map: { "AGENT MAGASINIER": "RNCP38413", "LOGISTIQUE": "RNCP38416", "PRÉPARATEUR DE COMMANDES": "RNCP38417", "OPÉRATEUR LOGISTIQUE": "RNCP38415" },
        contexte: "Cible : AFPA, Aftral, Promotrans, Lycées Pros, GRETA."
    },
    "technico": { 
        diplomes: ["BTS CCST", "BTSA Technico-commercial", "BTS NDRC", "BUT Techniques de Commercialisation", "Licence Pro Technico-Commercial"],
        rncp_map: { "CCST": "RNCP35801", "TECHNICO-COMMERCIAL": "RNCP38368", "NDRC": "RNCP38368", "TECHNIQUES DE COMMERCIALISATION": "RNCP35366" },
        contexte: "Cible : Lycées Agricoles (Obligatoire pour BTSA), Lycées Publics, CFA CCIP."
    },
    "export": { 
        diplomes: ["BTS Commerce International", "BUT Techniques de Commercialisation", "Licence Pro Commerce International", "Master Commerce International"],
        rncp_map: { "COMMERCE INTERNATIONAL": "RNCP38372", "TECHNIQUES DE COMMERCIALISATION": "RNCP35366" },
        contexte: "Cible : Lycées avec section internationale, IUT, Écoles de Commerce."
    },
    "qualite": { 
        diplomes: ["BTSA Bioqualité", "BUT Génie Biologique", "BTS QIABI", "Licence Pro Qualité Agroalimentaire", "Titre Pro Technicien Qualité"],
        rncp_map: { "BIOQUALITÉ": "RNCP38235", "GÉNIE BIOLOGIQUE": "RNCP35364", "QIABI": "RNCP38249", "TECHNICIEN QUALITÉ": "RNCP35860" },
        contexte: "Cible : ENIL (Écoles laitières), IUT, Lycées Agricoles."
    },
    "agreeur": { 
        diplomes: ["CQP Agréeur", "Formation Classement des grains", "CS Stockage de céréales", "BTSA Agronomie Productions Végétales"],
        rncp_map: { "AGRÉEUR": "RNCP_BRANCHE", "STOCKAGE": "RNCP28779", "PRODUCTIONS VÉGÉTALES": "RNCP38241" },
        contexte: "Cible : CFPPA Céréaliers, Organismes de branche."
    },
    "ligne": { 
        diplomes: ["Pilote de ligne de production", "Bac Pro PSPA", "CQP Conducteur de ligne", "BTS Pilotage de procédés"],
        rncp_map: { "PILOTE DE LIGNE": "RNCP35602", "PSPA": "RNCP35474", "CONDUCTEUR DE LIGNE": "RNCP_BRANCHE", "PILOTAGE DE PROCÉDÉS": "RNCP35327" },
        contexte: "Cible : CFAI, Lycées Pros Industriels, IMT."
    },
    "culture": { 
        diplomes: ["BTSA Agronomie Productions Végétales", "BTSA ACSE", "Licence Pro Agronomie", "Ingénieur Agronome", "BPREA"],
        rncp_map: { "PRODUCTIONS VÉGÉTALES": "RNCP38241", "ACSE": "RNCP38240", "AGRONOMIE": "RNCP35850" },
        contexte: "Cible : Lycées Agricoles, CFAA, Écoles d'Ingénieurs Agri."
    },
    "chauffeur": { 
        diplomes: ["CAP Conducteur Routier", "Titre Pro Conducteur du transport routier", "CS Conduite de machines agricoles", "BPA Travaux de la conduite"],
        rncp_map: { "CONDUCTEUR ROUTIER": "RNCP35310", "TRANSPORT ROUTIER": "RNCP35293", "CONDUITE DE MACHINES": "RNCP31962", "BPA": "RNCP14030" },
        contexte: "Cible : Aftral, Promotrans, Lycées Agricoles (pour le machinisme)."
    },
    "responsable_silo": { 
        diplomes: ["CS Responsable de silo", "Licence Pro Management des organisations agricoles", "BTSA GDEA", "BTSA ACSE"],
        rncp_map: { "RESPONSABLE DE SILO": "RNCP_BRANCHE", "GDEA": "RNCP38243", "ACSE": "RNCP38240" },
        contexte: "Cible : CFPPA, Écoles d'ingénieurs (formation continue)."
    },
    "fallback": {
        diplomes: ["Formations diplômantes du secteur agricole, agroalimentaire et industriel"],
        rncp_map: {},
        contexte: "Cherche les établissements reconnus (Lycées, CFA, IUT)."
    }
};

const SYSTEM_PROMPT = `Tu es un MOTEUR DE RECHERCHE D'ÉTABLISSEMENTS SCOLAIRES.
Mission : Scanner le web pour trouver TOUS les établissements réels dispensant les formations demandées.

RÈGLES D'OR :
1. ZÉRO INVENTION : Si l'école n'existe pas, tu ne l'inventes pas.
2. ADRESSE RÉELLE : Ville précise obligatoire. Pas de "Secteur", "Zone".
3. VOLUME MAXIMAL : Vise 15 résultats. Trouve tout ce qui existe (Public, Privé, CFA, MFR).
4. NOMMAGE PROPRE : Donne le nom officiel (ex: "Lycée Agricole Bougainville").

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

    // --- 2. DÉTECTION DU MÉTIER (LOGIQUE ÉLARGIE "FUZZY MATCHING") ---
    const m = metier.toLowerCase();
    let metierKey = "fallback"; 

    // C'est ici que j'ai corrigé : On cherche des mots-clés larges, pas juste le titre exact.
    
    // FAMILLE SILO
    if (m.match(/silo|grain|stockage|céréalier/)) {
        if (m.includes("responsable")) metierKey = "responsable_silo";
        else metierKey = "silo";
    }
    // FAMILLE AGRONOMIE / CULTURES (Correction pour "Productions végétales")
    else if (m.match(/culture|végétal|céréale|agronomie|plante|maraichage|vigne|champs/)) {
        metierKey = "culture";
    }
    // FAMILLE CONDUITE
    else if (m.match(/chauffeur|conducteur|tracteur|routier|transport|engin/)) {
        if (m.includes("ligne")) metierKey = "ligne";
        else metierKey = "chauffeur";
    }
    // FAMILLE MAINTENANCE
    else if (m.match(/maintenance|technique|élec|méca|automatisme|industriel/)) {
        metierKey = "maintenance";
    }
    // FAMILLE LOGISTIQUE
    else if (m.match(/logistique|supply/)) {
        if (m.includes("responsable")) metierKey = "logistique";
        else metierKey = "magasinier";
    }
    // FAMILLE MAGASINIER (Si pas capté par logistique)
    else if (m.match(/magasinier|cariste|chariot|entrepot|préparateur/)) {
        metierKey = "magasinier";
    }
    // FAMILLE COMMERCE
    else if (m.match(/commercial|vente|négoce|business/)) {
        if (m.includes("export") || m.includes("international")) metierKey = "export";
        else metierKey = "technico"; // Par défaut si commercial
    }
    else if (m.includes("technico")) {
        metierKey = "technico";
    }
    // FAMILLE QUALITÉ
    else if (m.match(/qualité|contrôle|qhse|laboratoire/)) {
        metierKey = "qualite";
    }
    else if (m.match(/agréeur|agréage|classification/)) {
        metierKey = "agreeur";
    }
    // FAMILLE LIGNE (Production)
    else if (m.match(/ligne|production|pilote|procédé/)) {
        metierKey = "ligne";
    }

    console.log(`🧠 LOGIQUE DÉTECTÉE : "${metier}" -> Clé : "${metierKey}"`);

    const expertise = METIERS_DATA[metierKey];

    // --- 3. LOGIQUE GÉOGRAPHIQUE ÉLARGIE ---
    let rayon = "50km";
    let zoneRecherche = `${ville} et alentours (${rayon})`;

    // Si le métier est agricole/rare et qu'on est en grande ville, on force l'élargissement
    const isAgri = ["silo", "culture", "agreeur", "chauffeur", "responsable_silo"].includes(metierKey);
    if (isAgri && ville.toLowerCase().match(/paris|lyon|marseille|lille|bordeaux|nantes|massy|fresnes/)) {
         zoneRecherche = "Grande périphérie rurale (jusqu'à 60km du centre, ex: 77, 78, 91, 95)";
    }

    // Si on est en fallback, on cherche large
    if (metierKey === "fallback") {
         zoneRecherche = `${ville} (recherche large établissements formation)`;
    }

    const userPrompt = `Trouve TOUS les établissements pour ces diplômes : "${expertise.diplomes.join(", ")}" dans la zone "${zoneRecherche}".
    
    CONTEXTE : ${expertise.contexte}
    
    INSTRUCTIONS CRITIQUES :
    1. EXHAUSTIVITÉ : Liste tout ce que tu trouves (Lycées, CFA, MFR). Vise 15 résultats.
    2. PRÉCISION : NOM + VILLE exacts obligatoires.
    3. PAS D'INVENTION.
    
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

    // --- 6. LE FILTRE FINAL ---
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
            
            if (termesInterdits.some(t => org.includes(t) && !org.startsWith("lycée") && !org.startsWith("cfa") && !org.startsWith("mfr") && !org.startsWith("cfppa"))) return false;
            if (villesInterdites.some(v => villeF.includes(v))) return false;

            // C. Distance
            return (f.distance_km || 0) <= 80;
        });

        // D. ENRICHISSEMENT RNCP + CATÉGORIE
        result.formations.forEach((f: any) => {
            const intitule = f.intitule.toUpperCase();
            // Catégorie
            if (intitule.match(/BAC|BTS|BUT|CAP|LICENCE|TITRE|MASTER|INGÉNIEUR/)) f.categorie = "Diplôme";
            else if (intitule.match(/CQP|CS /)) f.categorie = "Certification";
            else f.categorie = "Habilitation";

            // RNCP
            if (!f.rncp || f.rncp.length < 5 || f.rncp === "Non renseigné") {
                for (const [key, code] of Object.entries(expertise.rncp_map)) {
                    if (intitule.includes(key)) {
                        f.rncp = code;
                        break;
                    }
                }
            }
        });

        result.formations.sort((a: any, b: any) => (a.distance_km || 999) - (b.distance_km || 999));
    }

    if (!result.metier_normalise) result.metier_normalise = metier;
    if (!result.ville_reference) result.ville_reference = ville;

    console.log(`✅ ${result.formations?.length || 0} résultats renvoyés.`);

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});