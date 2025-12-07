import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// --- CONFIGURATION EXPERT V3 (ANTI-SIÈGE SOCIAL) ---
const SYSTEM_PROMPT = `Tu es un expert en ingénierie de formation pour OCAPIAT.
Ton but est d'identifier les lieux RÉELS de formation (Campus, Lycées, CFA) et non les bureaux administratifs.

RÈGLES CRITIQUES (Ligne Rouge) :
1. LIEU PHYSIQUE OBLIGATOIRE : Tu ne dois jamais donner l'adresse d'un siège social (ex: Paris 8ème pour une formation agricole). Tu dois trouver le Lycée Agricole, la MFR ou le CFPPA qui dispense le cours.
2. ORGANISME FORMATEUR : OCAPIAT et "La Coopération Agricole" sont des financeurs/réseaux, PAS des écoles. Si tu trouves une offre chez eux, cherche quel centre partenaire (CFA, Lycée) assure les cours.
3. LOGIQUE MÉTIER ÉTENDUE : Pense "Compétences transférables". Un agent de silo vient aussi de la Maintenance ou de la Logistique.

FORMAT JSON STRICT :
{
  "metier_normalise": "string",
  "ville_reference": "string",
  "formations": [
    {
      "intitule": "Nom complet",
      "organisme": "Nom de l'école (PAS le réseau)",
      "rncp": "Code ou null",
      "categorie": "Diplôme" | "Certification" | "Habilitation (CACES/Permis)",
      "niveau": "3" (CAP) | "4" (Bac) | "5" (Bac+2) | "6" (Bac+3) | "N/A",
      "ville": "Ville exacte du CAMPUS",
      "distance_km": number (Estimation réelle depuis la ville demandée),
      "site_web": "URL",
      "modalite": "Présentiel" | "Apprentissage"
    }
  ]
}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { metier, ville, niveau } = await req.json();

    if (!metier || !ville || !niveau) throw new Error("Paramètres manquants");

    const perplexityApiKey = Deno.env.get("PERPLEXITY_API_KEY");
    if (!perplexityApiKey) throw new Error("Clé API Perplexity manquante");

    console.log(`🔎 Recherche V3 (Expert): ${metier} autour de ${ville}`);

    // --- ENRICHISSEMENT INTELLIGENT (CORRECTION CHATGPT) ---
    let motsClesTechniques = "";
    
    // Pour Agent de silo, on ajoute la Maintenance et la Logistique (Critique ChatGPT n°3)
    if (metier.toLowerCase().includes("silo")) {
        motsClesTechniques = "Bac Pro Agroéquipement, Bac Pro Logistique, CAP Maintenance des matériels, CQP Agent de silo, CS Maintenance";
    } 
    else if (metier.toLowerCase().includes("magasinier") || metier.toLowerCase().includes("cariste")) {
        motsClesTechniques = "Titre Pro Agent Magasinier, Bac Pro Logistique, TSMEL, CACES R489, Gestion des stocks";
    }
    else if (metier.toLowerCase().includes("conduite") || metier.toLowerCase().includes("ligne")) {
        motsClesTechniques = "Pilote de ligne de production, CQP Conducteur de ligne, BTS Pilotage de procédés, Bac Pro PSPA";
    }
    else if (metier.toLowerCase().includes("commercial")) {
        motsClesTechniques = "BTS NDRC, Technico-commercial, Bachelor Business Developer, BTS ACSE (option commerce)";
    }
    else {
        // Fallback générique
        motsClesTechniques = "Formations diplômantes, Titres Pro, CQP de branche";
    }

    const userPrompt = `Trouve les centres de formation RÉELS (Lieux où on étudie) pour devenir "${metier}" autour de "${ville}" (Max 60km).
    
    Contexte technique élargi (Formations acceptées) : ${motsClesTechniques}
    
    Filtre Niveau : ${niveau === 'all' ? 'Tout (CAP à Bac+5)' : 'Niveau ' + niveau}.

    INSTRUCTIONS DE RECHERCHE :
    1. Ignore les sièges sociaux à Paris pour les métiers agricoles. Cherche les Lycées Agricoles (EPLEFPA), CFAA, MFR ou GRETA situés en périphérie ou en région proche.
    2. Si tu trouves "CQP Agent de Silo", cherche quel CFPPA ou CFA le propose réellement dans le secteur.
    3. Inclus les filières Maintenance et Logistique si elles permettent d'accéder au métier.
    4. Sois précis sur la VILLE du campus.
    
    Retourne uniquement le JSON.`;

    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1, // Très faible pour éviter d'inventer des adresses
        max_tokens: 4000
      }),
    });

    if (!perplexityResponse.ok) throw new Error(`Erreur Perplexity: ${perplexityResponse.status}`);

    const perplexityData = await perplexityResponse.json();
    const content = perplexityData.choices[0].message.content;

    // --- PARSING ---
    let result;
    try {
      const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
      result = JSON.parse(cleanContent);
    } catch (e) {
      console.warn("JSON fail, tentative regex");
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) result = JSON.parse(jsonMatch[0]);
      else throw new Error("Impossible de parser le JSON");
    }

    // --- TRI PAR DISTANCE ---
    if (result.formations) {
      result.formations.sort((a: any, b: any) => (a.distance_km || 999) - (b.distance_km || 999));
    }

    console.log(`✅ ${result.formations?.length || 0} formations trouvées`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});