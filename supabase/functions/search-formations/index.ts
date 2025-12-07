import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// --- SYSTEM PROMPT (Inchangé car il est très bon) ---
const SYSTEM_PROMPT = `Tu es un expert en orientation scolaire pour OCAPIAT.
Ton objectif est de fournir une liste DENSE et EXHAUSTIVE de lieux de formation.

RÈGLES D'OR :
1. QUANTITÉ & QUALITÉ : Trouve au moins 5 à 10 établissements pertinents.
2. LIEU PHYSIQUE : Cherche les Lycées, CFA, IUT, Écoles. Pas de sièges sociaux.
3. PRÉCISION MÉTIER : Respecte strictement les mots-clés techniques fournis.

FORMAT JSON STRICT :
{
  "metier_normalise": "string",
  "ville_reference": "string",
  "formations": [
    {
      "intitule": "Nom complet",
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

    console.log(`🔎 Recherche V6 (Ultimate): ${metier} à ${ville}`);

    // --- MAPPING DES 12 MÉTIERS OCAPIAT (VISION 360°) ---
    let motsClesTechniques = "";
    let instructionsExclusion = ""; 

    const m = metier.toLowerCase();

    // 1. FAMILLE SILO (Agent, Responsable, Conducteur silo)
    if (m.includes("silo")) {
        motsClesTechniques = "Bac Pro Agroéquipement, CQP Agent de silo, CS Maintenance des matériels, BTSA GDEA (Génie des Équipements Agricoles), CAP Agricole, Certificat de Spécialisation (CS) Stockage.";
        instructionsExclusion = "EXCLURE : Cuisine, Métiers de bouche, BTP (Maçonnerie).";
    }
    // 2. FAMILLE LOGISTIQUE (Magasinier, Cariste, Resp Logistique)
    else if (m.includes("magasinier") || m.includes("cariste") || (m.includes("logistique") && !m.includes("responsable"))) {
        // Niveau opérationnel
        motsClesTechniques = "Titre Pro Agent Magasinier, Bac Pro Logistique, CACES R489 (1, 3, 5), CAP Opérateur Logistique.";
        instructionsExclusion = "EXCLURE : Transport Routier (Conduite camion), Maintenance mécanique.";
    }
    else if (m.includes("responsable logistique")) {
        // Niveau encadrement
        motsClesTechniques = "BUT QLIO (Qualité Logistique), TSMEL (Technicien Supérieur en Méthodes et Exploitation Logistique), Master Logistique, BTS GTLA.";
        instructionsExclusion = "EXCLURE : CACES seul (ce n'est pas suffisant pour un responsable).";
    }
    // 3. FAMILLE MAINTENANCE (Responsable services techniques)
    else if (m.includes("services techniques") || m.includes("maintenance")) {
        motsClesTechniques = "BTS Maintenance des Systèmes (MS), BUT Génie Industriel et Maintenance (GIM), BTS Électrotechnique, BTS CRSA, Bac Pro MSPC.";
        instructionsExclusion = "EXCLURE : Logistique, Transport, Garage auto (VL).";
    }
    // 4. FAMILLE COMMERCE (Technico-co, Commercial Export)
    else if (m.includes("technico") || (m.includes("commercial") && !m.includes("export"))) {
        motsClesTechniques = "BTS CCST (Conseil et Commercialisation de Solutions Techniques), BTSA Technico-commercial (Agrofournitures), BTS NDRC, BUT TC.";
        instructionsExclusion = "EXCLURE : Caisse, Vente en magasin de mode.";
    }
    else if (m.includes("export")) {
        motsClesTechniques = "BTS Commerce International (CI), BUT TC (Parcours International), Master Commerce International, Licence Pro Export.";
        instructionsExclusion = "EXCLURE : Vente locale, Immobilier.";
    }
    // 5. FAMILLE QUALITÉ (Contrôleur qualité, Agréeur)
    else if (m.includes("contrôleur qualité") || m.includes("qualité")) {
        motsClesTechniques = "BTSA Bioqualité (ex QIA), BUT Génie Biologique (IAB), Licence Pro Qualité Agroalimentaire, BTS QIABI.";
        instructionsExclusion = "EXCLURE : Qualité aéronautique, Qualité automobile.";
    }
    else if (m.includes("agréeur") || m.includes("agréage")) {
        // Métier très spécifique (grain)
        motsClesTechniques = "CQP Agréeur, Formation classement des grains, BTSA Agronomie (Productions Végétales), CS Responsable de silo.";
        instructionsExclusion = "EXCLURE : Agrément assurance, Immobilier.";
    }
    // 6. FAMILLE PRODUCTION (Conducteur de ligne)
    else if (m.includes("conducteur de ligne") || m.includes("ligne")) {
        motsClesTechniques = "Pilote de ligne de production (PLP), CQP Conducteur de ligne, Bac Pro PSPA (Pilotage de systèmes), BTS Pilotage de procédés.";
        instructionsExclusion = "EXCLURE : Conducteur de bus, Conducteur de train, Ligne électrique.";
    }
    // 7. FAMILLE AGRONOMIE (Technicien culture, Chauffeur agricole)
    else if (m.includes("technicien culture") || m.includes("culture")) {
        motsClesTechniques = "BTSA Agronomie et Productions Végétales (APV), BTSA ACSE, Licence Pro Agronomie, Ingénieur Agri.";
        instructionsExclusion = "EXCLURE : Jardinerie, Paysagiste (Espaces verts), Culture (Art).";
    }
    else if (m.includes("chauffeur")) {
        // Cas délicat : Chauffeur agricole vs Routier
        motsClesTechniques = "CAP Conducteur Routier Marchandises, Titre Pro Conducteur du transport routier (Porteur/Super Lourd), FIMO, CS Conduite de machines agricoles.";
        instructionsExclusion = "EXCLURE : Chauffeur VTC, Taxi, Bus.";
    }
    // FALLBACK (Sécurité)
    else {
        motsClesTechniques = "Formations diplômantes du secteur agricole et alimentaire (OCAPIAT).";
        instructionsExclusion = "";
    }

    const userPrompt = `Trouve une liste complète (minimum 6-8 résultats) des formations pour "${metier}" à "${ville}" (Max 60km).
    
    DIPLÔMES CIBLES (Mots-clés prioritaires) : ${motsClesTechniques}
    
    ⛔ EXCLUSIONS STRICTES : ${instructionsExclusion}
    
    Filtre Niveau : ${niveau === 'all' ? 'Tout (CAP à Bac+5)' : 'Niveau ' + niveau}.

    INSTRUCTIONS :
    1. Diversifie les organismes (Lycées, CFA, IUT, Écoles).
    2. Vérifie la cohérence du métier (ex: Pas de logistique pour un poste de maintenance).
    3. Indique la distance réelle et le RNCP.
    
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