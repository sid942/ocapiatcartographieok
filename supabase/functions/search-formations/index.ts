import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// --- CONFIGURATION EXPERT V4 (FILTRAGE MÉTIER STRICT & BLACKLIST) ---
const SYSTEM_PROMPT = `Tu es un expert en ingénierie de formation pour OCAPIAT.
Ton but est d'identifier les lieux RÉELS de formation (Campus, Lycées, CFA) correspondant EXACTEMENT à la technicité du métier.

RÈGLES CRITIQUES :
1. LIEU PHYSIQUE : Trouve le Lycée, le CFA ou l'IUT précis. Pas de sièges sociaux.
2. PERTINENCE MÉTIER (CRITIQUE) : 
   - Ne mélange pas les familles. 
   - Si on cherche "Maintenance", EXCLURE "Logistique" et "Transport routier".
   - Si on cherche "Logistique", EXCLURE "Maintenance".
3. HIÉRARCHIE : Respecte les niveaux (CAP vers Ingénieur).

FORMAT JSON STRICT :
{
  "metier_normalise": "string",
  "ville_reference": "string",
  "formations": [
    {
      "intitule": "Nom complet",
      "organisme": "Nom de l'école",
      "rncp": "Code ou null",
      "categorie": "Diplôme" | "Certification" | "Habilitation (CACES/Permis)",
      "niveau": "3" (CAP) | "4" (Bac) | "5" (Bac+2) | "6" (Bac+3) | "N/A",
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

    console.log(`🔎 Recherche V4 (Expert+Blacklist): ${metier} autour de ${ville}`);

    // --- ENRICHISSEMENT INTELLIGENT & BLACKLISTING ---
    let motsClesTechniques = "";
    let instructionsExclusion = ""; // Nouvelle variable pour bannir les erreurs

    const m = metier.toLowerCase();

    if (m.includes("services techniques") || m.includes("maintenance")) {
        // Cible : Maintenance Industrielle, Électro, Automatisme
        motsClesTechniques = "BTS Maintenance des Systèmes (MS), BUT Génie Industriel et Maintenance (GIM), BTS Électrotechnique, BTS CRSA (Automatisme), Bac Pro MSPC (Systèmes de Production Connectés), Licence Pro Maintenance industrielle, Ingénieur Génie Industriel.";
        // On bannit explicitement la logistique et le transport routier (camions)
        instructionsExclusion = "EXCLURE STRICTEMENT les formations en : Logistique, Magasinage, Transport Routier, Conduite de poids lourds, Maintenance automobile légère.";
    } 
    else if (m.includes("silo")) {
        // Cible : Agricole & Maintenance Silo
        motsClesTechniques = "Bac Pro Agroéquipement, CAP Maintenance des matériels, CQP Agent de silo, CS Maintenance, BTSA GDEA.";
        instructionsExclusion = "EXCLURE : Cuisine, Transformation alimentaire pure (boucher/boulanger), Transport de voyageurs.";
    }
    else if (m.includes("magasinier") || m.includes("cariste") || m.includes("logistique")) {
        // Cible : Logistique pure
        motsClesTechniques = "Titre Pro Agent Magasinier, Bac Pro Logistique, TSMEL, CACES R489, Gestion des stocks, BUT QLIO.";
        instructionsExclusion = "EXCLURE : Maintenance industrielle, Mécanique pure, Électrotechnique.";
    }
    else if (m.includes("conduite") || m.includes("ligne")) {
        // Cible : Production
        motsClesTechniques = "Pilote de ligne de production, CQP Conducteur de ligne, BTS Pilotage de procédés, Bac Pro PSPA.";
        instructionsExclusion = "EXCLURE : Conduite de camion, Permis poids lourd.";
    }
    else if (m.includes("commercial")) {
        motsClesTechniques = "BTS NDRC, Technico-commercial, Bachelor Business Developer, BTS ACSE.";
        instructionsExclusion = "EXCLURE : Comptabilité pure, RH.";
    }
    else {
        motsClesTechniques = "Formations diplômantes, Titres Pro, CQP de branche reconnus.";
        instructionsExclusion = "";
    }

    const userPrompt = `Trouve les centres de formation RÉELS pour devenir "${metier}" autour de "${ville}" (Max 60km).
    
    CONTEXTE TECHNIQUE OBLIGATOIRE (Mots-clés) : ${motsClesTechniques}
    
    ⛔ LISTE NOIRE (A NE PAS PROPOSER) : ${instructionsExclusion}
    
    Filtre Niveau : ${niveau === 'all' ? 'Tout (CAP à Bac+5)' : 'Niveau ' + niveau}.

    INSTRUCTIONS :
    1. Ignore les sièges sociaux. Cherche les Lycées (Pro/Agricole), IUT, CFA, MFR.
    2. Respecte scrupuleusement la LISTE NOIRE ci-dessus. Si une formation correspond à un mot interdit, ne l'affiche pas.
    3. Indique la distance réelle.
    
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