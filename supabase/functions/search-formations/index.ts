import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// --- SYSTEM PROMPT V10 (MODE SNIPER / ADRESSE PRÉCISE) ---
const SYSTEM_PROMPT = `Tu es un MOTEUR DE RECHERCHE de formations (type Parcoursup/Onisep).
Ta mission est de fournir des résultats UNITAIRES et PRÉCIS.

RÈGLES D'OR (CRITIQUES) :
1. INTERDICTION DU PLURIEL : Ne réponds jamais "Les lycées agricoles de la région". Tu dois citer "Lycée Agricole de Bougainville", puis une autre ligne pour "Lycée Agricole Sully".
2. UNE LIGNE = UNE ÉCOLE : Si une formation existe dans 3 écoles, tu dois générer 3 objets JSON distincts.
3. ADRESSE RÉELLE : Le champ "ville" doit contenir UNIQUEMENT le nom de la commune (ex: "Brie-Comte-Robert"). Pas de phrases comme "Secteurs ruraux".
4. NOM PROPRE : Le champ "organisme" doit être le nom officiel de l'établissement (ex: "CFA UTEC"). Pas de "Centres habilités".

FORMAT JSON STRICT :
{
  "metier_normalise": "string",
  "ville_reference": "string",
  "formations": [
    {
      "intitule": "Nom exact du diplôme",
      "organisme": "Nom PRÉCIS de l'établissement (Pas de nom générique)",
      "rncp": "Code RNCP ou 'Non renseigné'",
      "categorie": "Diplôme" | "Certification" | "Habilitation",
      "niveau": "3" | "4" | "5" | "6" | "N/A",
      "ville": "Ville exacte (Nom de la commune)",
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

    console.log(`🎯 RECHERCHE V10 (SNIPER): ${metier} autour de ${ville}`);

    // --- 1. GESTION GÉOGRAPHIQUE ---
    let zoneRecherche = ville;
    const grandesVilles = ["paris", "lyon", "marseille", "bordeaux", "lille", "toulouse", "nantes"];
    const estMetierAgricole = metier.toLowerCase().match(/silo|culture|agri|chauffeur|agréeur/);

    if (estMetierAgricole && grandesVilles.some(v => ville.toLowerCase().includes(v))) {
         if (ville.toLowerCase().includes("paris")) zoneRecherche = "Île-de-France (Seine-et-Marne 77, Yvelines 78, Essonne 91, Val-d'Oise 95)";
         else zoneRecherche = `${ville} et sa périphérie (50km)`;
    }

    // --- 2. MAPPING INTELLIGENT (Inchangé car parfait) ---
    let motsCles = "";
    let exclusions = "";
    const m = metier.toLowerCase();

    // SILO
    if (m.includes("silo")) {
        motsCles = `
        Cherche spécifiquement ces établissements :
        - Lycée Agricole Bougainville (Brie-Comte-Robert)
        - Lycée Agricole de Saint-Germain-en-Laye
        - Lycée Agricole La Bretonnière (Chailly-en-Brie)
        - Lycée Le Champ de Claye (Claye-Souilly)
        Cherche les formations : Bac Pro Agroéquipement, CQP Agent de silo, Bac Pro MSPC (Maintenance).
        `;
        exclusions = "EXCLURE : Termes génériques comme 'Lycées agricoles', 'Centres de formation'.";
    }
    // MAINTENANCE
    else if (m.includes("services techniques") || (m.includes("maintenance") && !m.includes("agri"))) {
        motsCles = "Cherche les Lycées Pros et CFA précis proposant : BTS Maintenance des Systèmes (MS), BUT GIM, Bac Pro MSPC, BTS Électrotechnique.";
        exclusions = "EXCLURE : Garages auto.";
    }
    // LOGISTIQUE
    else if (m.includes("responsable logistique")) {
        motsCles = "BUT QLIO, TSMEL (Aftral, Promotrans), BTS GTLA.";
        exclusions = "";
    }
    else if (m.includes("magasinier") || m.includes("cariste") || m.includes("logistique")) {
        motsCles = "Titre Pro Agent Magasinier (AFPA, Promotrans, Aftral, Forget Formation), Bac Pro Logistique, CACES R489.";
        exclusions = "";
    }
    // COMMERCE
    else if (m.includes("technico") || (m.includes("commercial") && !m.includes("export"))) {
        motsCles = "BTS CCST (ex-TC), BTSA Technico-commercial (Lycée Bougainville, Tecomah), BTS NDRC.";
        exclusions = "";
    }
    else if (m.includes("export")) {
        motsCles = "BTS Commerce International (CI), BUT TC.";
        exclusions = "";
    }
    // QUALITÉ
    else if (m.includes("agréeur") || m.includes("contrôleur qualité") || m.includes("qualité")) {
        motsCles = "BTSA Bioqualité, BUT Génie Biologique, CQP Agréeur, Formation grains.";
        exclusions = "";
    }
    // PROD & AGRI
    else if (m.includes("conducteur de ligne") || m.includes("ligne")) {
        motsCles = "Pilote de ligne de production, CQP Conducteur, Bac Pro PSPA.";
        exclusions = "";
    }
    else if (m.includes("technicien culture") || m.includes("culture") || m.includes("chauffeur")) {
        motsCles = "BTSA APV, BTSA ACSE, CAP Conducteur Routier, CS Conduite machines.";
        exclusions = "";
    }
    else {
        motsCles = "Formations diplômantes précises (Nom de l'école obligatoire).";
    }

    const userPrompt = `Liste 8 formations CONCRÈTES pour "${metier}" dans la zone "${zoneRecherche}".
    
    CIBLE : ${motsCles}
    
    ⛔ INTERDIT : ${exclusions}
    ⛔ INTERDIT : Ne réponds JAMAIS par des catégories ("Les lycées..."). Je veux des NOMS PROPRES ("Lycée Jean Moulin").
    
    Pour chaque résultat, donne :
    - Organisme : Le VRAI nom de l'école/CFA.
    - Ville : La VRAIE ville (Code postal si possible).
    - Distance : Estime la distance depuis le centre de la zone demandée.
    
    Renvoie le JSON uniquement.`;

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
        result.formations = result.formations.filter((f: any) => {
            // Filtre de sécurité : On vire les noms génériques détectés
            const org = f.organisme.toLowerCase();
            const ville = f.ville.toLowerCase();
            if (org.includes("lycées agricoles") || org.includes("centres habilités") || ville.includes("secteurs")) return false;
            
            // Règle Distance (Large pour la campagne)
            return (f.distance_km || 0) <= 80;
        });

        result.formations.sort((a: any, b: any) => (a.distance_km || 999) - (b.distance_km || 999));
        
        // Nettoyage esthétique
        result.formations.forEach((f:any) => {
            if(f.niveau && f.niveau.toString().startsWith('Niveau')) f.niveau = f.niveau.replace('Niveau ', '');
        });
    }

    console.log(`✅ ${result.formations?.length || 0} résultats PRÉCIS trouvés.`);

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});