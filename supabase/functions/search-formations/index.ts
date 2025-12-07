import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// --- SYSTEM PROMPT V12 (MODE ANNUAIRE STRICT) ---
const SYSTEM_PROMPT = `Tu es un MOTEUR DE RECHERCHE D'ÉTABLISSEMENTS (type ONISEP).
Ta mission : Lister des ÉTABLISSEMENTS PHYSIQUES PRÉCIS (Nom + Ville) pour les métiers demandés.

RÈGLES D'OR ABSOLUES :
1. INTERDICTION DU PLURIEL : Ne réponds JAMAIS "Les lycées agricoles". Une ligne = Un établissement précis (ex: "Lycée Agricole de Bougainville").
2. ADRESSE RÉELLE : Le champ "ville" doit être une COMMUNE existante.
3. NOM PROPRE : Le champ "organisme" doit être le nom officiel.
4. PAS D'INVENTION : Si tu ne trouves pas d'école exacte pour ce diplôme dans cette ville, ne l'invente pas.

FORMAT JSON STRICT :
{
  "metier_normalise": "string",
  "ville_reference": "string",
  "formations": [
    {
      "intitule": "Intitulé exact du diplôme",
      "organisme": "Nom PROPRE de l'établissement",
      "rncp": "Code RNCP ou 'Non renseigné'",
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
  // 1. Gestion CORS
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { metier, ville, niveau } = await req.json();
    
    // 2. Validation Entrées
    if (!metier || !ville) {
        return new Response(JSON.stringify({ error: "Paramètres manquants" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const perplexityApiKey = Deno.env.get("PERPLEXITY_API_KEY");
    if (!perplexityApiKey) throw new Error("Clé API Perplexity manquante");

    console.log(`🛡️ RECHERCHE V12 (BLINDÉE): ${metier} [${niveau}] à ${ville}`);

    // --- 3. LOGIQUE GÉOGRAPHIQUE ---
    let zoneRecherche = ville;
    const grandesVilles = ["paris", "lyon", "marseille", "bordeaux", "lille", "toulouse", "nantes", "strasbourg"];
    const estMetierAgricole = metier.toLowerCase().match(/silo|culture|agri|chauffeur|agréeur|conduite|ligne/);

    if (estMetierAgricole && grandesVilles.some(v => ville.toLowerCase().includes(v))) {
         if (ville.toLowerCase().includes("paris")) zoneRecherche = "Grande Couronne Île-de-France (77, 78, 91, 95)";
         else zoneRecherche = `${ville} et sa périphérie rurale (rayon 50km)`;
    }

    // --- 4. DÉFINITION CIBLES MÉTIERS ---
    let diplomesCibles = "";
    let contexteMetier = "";
    const m = metier.toLowerCase();

    // Mapping Métier (Simplifié pour la lisibilité, mais complet)
    if (m.includes("silo")) {
        diplomesCibles = "Bac Pro Agroéquipement, CQP Agent de silo, BTSA GDEA, CAP Maintenance des matériels.";
        contexteMetier = "Cible : Lycées Agricoles (EPLEFPA), CFA Agricoles, MFR.";
    } else if (m.includes("maintenance") || m.includes("services techniques")) {
        diplomesCibles = "BTS Maintenance des Systèmes (MS), BUT GIM, Bac Pro MSPC.";
        contexteMetier = "Cible : Lycées Pros Industriels, CFAI.";
    } else if (m.includes("logistique") || m.includes("magasinier")) {
        diplomesCibles = "Titre Pro Agent Magasinier, Bac Pro Logistique, CACES R489.";
        contexteMetier = "Cible : AFPA, Aftral, Promotrans, Lycées Pros.";
    } else if (m.includes("commercial") || m.includes("technico")) {
        diplomesCibles = "BTS CCST (ex-TC), BTSA Technico-commercial.";
        contexteMetier = "Cible : Lycées Agricoles (pour le BTSA) et CFA Commerciaux.";
    } else if (m.includes("qualité") || m.includes("agréeur")) {
        diplomesCibles = "BTSA Bioqualité, BUT Génie Biologique, CQP Agréeur.";
        contexteMetier = "Cible : ENIL, IUT, CFPPA.";
    } else if (m.includes("conducteur de ligne")) {
        diplomesCibles = "Pilote de ligne de production, Bac Pro PSPA.";
        contexteMetier = "Cible : CFAI, Lycées Pros.";
    } else if (m.includes("culture") || m.includes("chauffeur")) {
        diplomesCibles = "BTSA APV, BTSA ACSE, CAP Conducteur Routier.";
        contexteMetier = "Cible : Lycées Agricoles, Centres de formation Transport.";
    } else {
        diplomesCibles = "Formations diplômantes RNCP officielles.";
        contexteMetier = "Cible : Établissements reconnus.";
    }

    const userPrompt = `Liste 8 établissements PRÉCIS pour "${diplomesCibles}" dans la zone "${zoneRecherche}".
    
    CONTEXTE : ${contexteMetier}
    
    ⛔ INTERDICTIONS :
    - Pas de noms génériques ("Les lycées...").
    - Pas de villes floues ("Secteur 77").
    - Pas de sièges sociaux.
    
    Donne-moi : Organisme (Nom Propre), Ville (Commune), Distance (Estimée), Niveau (3,4,5,6).
    
    Force les champs "metier_normalise" à "${metier}" et "ville_reference" à "${ville}".
    Renvoie le JSON uniquement.`;

    // --- 5. APPEL PERPLEXITY ---
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
    
    // --- 6. PARSING JSON ---
    let result;
    try {
        const clean = data.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
        result = JSON.parse(clean);
    } catch (e) {
        const match = data.choices[0].message.content.match(/\{[\s\S]*\}/);
        if (match) result = JSON.parse(match[0]);
        else throw new Error("Erreur de parsing JSON IA");
    }

    // --- 7. FILTRAGE STRICT CÔTÉ CODE (Réponse à ChatGPT) ---
    if (result.formations) {
        // Normalisation du niveau demandé par l'utilisateur
        const niveauCible = niveau === 'all' ? null : niveau.toString();

        result.formations = result.formations.filter((f: any) => {
            // A. Nettoyage des niveaux dans le JSON reçu
            let nivFormation = f.niveau ? f.niveau.toString().replace('Niveau ', '').trim() : 'N/A';
            f.niveau = nivFormation; // On met à jour l'objet

            // B. Filtre Niveau Strict (Si l'user veut Niv 4, on vire Niv 5)
            if (niveauCible && nivFormation !== 'N/A' && nivFormation !== niveauCible) {
                // Petite souplesse : Si on veut 4, on accepte pas 5. Mais si niveau est N/A (CQP), on garde.
                return false;
            }

            // C. Filtre Anti-Flou (Nom d'organisme ou ville générique)
            const org = f.organisme.toLowerCase();
            const villeF = f.ville.toLowerCase();
            const termesInterdits = ["lycées", "centres", "réseau", "structures", "organismes", "plusieurs", "divers"];
            const villesInterdites = ["secteur", "zone", "départements", "proximité", "alentours"];

            const estFlou = termesInterdits.some(t => org.includes(t) && !org.startsWith("lycée polyvalent"));
            const estVilleFloue = villesInterdites.some(v => villeF.includes(v));

            if (estFlou || estVilleFloue) return false;

            // D. Filtre Distance de Sécurité (Max 90km)
            return (f.distance_km || 0) <= 90;
        });

        // Tri
        result.formations.sort((a: any, b: any) => (a.distance_km || 999) - (b.distance_km || 999));
    }

    // Sécurisation des champs obligatoires pour le Front
    if (!result.metier_normalise) result.metier_normalise = metier;
    if (!result.ville_reference) result.ville_reference = ville;

    console.log(`✅ ${result.formations?.length || 0} résultats VALIDÉS renvoyés.`);

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});