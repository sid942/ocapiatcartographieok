import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// --- CONFIGURATION EXPERT V5 (DENSITÉ & PRÉCISION) ---
const SYSTEM_PROMPT = `Tu es un expert en orientation scolaire pour OCAPIAT.
Ton objectif est de fournir une liste DENSE et EXHAUSTIVE de lieux de formation.

RÈGLES D'OR :
1. QUANTITÉ & QUALITÉ : Pour une grande ville comme Paris, tu dois trouver au moins 5 à 10 établissements pertinents. Ne t'arrête pas au premier résultat.
2. LIEU PHYSIQUE : Cherche les Lycées, CFA, IUT, Écoles de Commerce. Pas de sièges sociaux.
3. FAMILLES MÉTIERS : Respecte strictement les mots-clés techniques fournis ci-dessous.

FORMAT JSON STRICT :
{
  "metier_normalise": "string",
  "ville_reference": "string",
  "formations": [
    {
      "intitule": "Nom complet (ex: BTS CCST)",
      "organisme": "Nom de l'école",
      "rncp": "Code ou null",
      "categorie": "Diplôme" | "Certification" | "Habilitation",
      "niveau": "3" | "4" | "5" | "6" | "N/A",
      "ville": "Ville exacte du CAMPUS",
      "distance_km": number,
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

    console.log(`🔎 Recherche V5 (Densité): ${metier} à ${ville}`);

    // --- ENRICHISSEMENT INTELLIGENT (AJOUT BTS CCST & AGRI) ---
    let motsClesTechniques = "";
    let instructionsExclusion = ""; 

    const m = metier.toLowerCase();

    if (m.includes("services techniques") || m.includes("maintenance")) {
        motsClesTechniques = "BTS Maintenance des Systèmes (MS), BUT Génie Industriel et Maintenance (GIM), BTS Électrotechnique, BTS CRSA (Automatisme), Bac Pro MSPC.";
        instructionsExclusion = "EXCLURE : Logistique, Transport Routier, Maintenance auto.";
    } 
    else if (m.includes("silo")) {
        motsClesTechniques = "Bac Pro Agroéquipement, CAP Maintenance des matériels, CQP Agent de silo, CS Maintenance, BTSA GDEA.";
        instructionsExclusion = "EXCLURE : Boulangerie, Cuisine.";
    }
    else if (m.includes("magasinier") || m.includes("cariste") || m.includes("logistique")) {
        motsClesTechniques = "Titre Pro Agent Magasinier, Bac Pro Logistique, TSMEL, CACES R489, BUT QLIO (Qualité Logistique).";
        instructionsExclusion = "EXCLURE : Maintenance industrielle, Mécanique.";
    }
    else if (m.includes("conduite") || m.includes("ligne")) {
        motsClesTechniques = "Pilote de ligne de production, CQP Conducteur de ligne, BTS Pilotage de procédés, Bac Pro PSPA (Pilotage de systèmes).";
        instructionsExclusion = "EXCLURE : Poids lourds, Transport.";
    }
    // --- C'EST ICI QUE J'AI CORRIGÉ POUR TECHNICO-COMMERCIAL ---
    else if (m.includes("commercial")) {
        // Ajout massif des diplômes clés (CCST, TC, BTSA)
        motsClesTechniques = "BTS CCST (Conseil et Commercialisation de Solutions Techniques - ex BTS TC), BTSA Technico-commercial (Agrofournitures / Vins / Jardins), BTS NDRC, BUT Techniques de Commercialisation (TC), Licence Pro Technico-Commercial, Bachelor Business Developer.";
        instructionsExclusion = "EXCLURE : Comptabilité, Gestion pure, RH, Secrétariat.";
    }
    else {
        motsClesTechniques = "Formations diplômantes, Titres Pro RNCP, CQP de branche.";
        instructionsExclusion = "";
    }

    const userPrompt = `Trouve une liste complète (minimum 6-8 résultats si possible) des formations pour "${metier}" à "${ville}" (Max 60km).
    
    DIPLÔMES CIBLES (Mots-clés prioritaires) : ${motsClesTechniques}
    
    ⛔ EXCLUSIONS : ${instructionsExclusion}
    
    Filtre Niveau : ${niveau === 'all' ? 'Tout (CAP à Bac+5)' : 'Niveau ' + niveau}.

    INSTRUCTIONS :
    1. Diversifie les organismes : Cherche à la fois les Lycées Publics, les CFA, les Écoles de Commerce et les IUT.
    2. Pour Technico-Commercial, privilégie le BTS CCST et le BTSA Technico-commercial.
    3. Indique la distance réelle et le code RNCP.
    
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
        temperature: 0.1, 
        max_tokens: 4000
      }),
    });

    if (!perplexityResponse.ok) throw new Error(`Erreur Perplexity: ${perplexityResponse.status}`);

    const perplexityData = await perplexityResponse.json();
    const content = perplexityData.choices[0].message.content;

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