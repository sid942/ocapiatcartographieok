import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// --- SYSTEM PROMPT EXPERT OCAPIAT ---
const SYSTEM_PROMPT = `Tu es un auditeur expert en formation pour OCAPIAT.
Ta mission est de valider des parcours de formation cohérents, locaux et certifiants.

RÈGLES D'OR (Non négociables) :
1. LIEUX RÉELS : Trouve le CAMPUS exact (Lycée Agricole, CFA, MFR, IUT). INTERDICTION formelle de citer un siège social administratif.
2. DISTINCTION DIPLÔME/HABILITATION :
   - Un "Titre Pro", "CAP", "BTS", "Bac Pro" est un DIPLÔME (ou Certification RNCP).
   - Un "CACES", "Habilitation électrique", "FIMO" est une HABILITATION.
3. LOGIQUE GÉOGRAPHIQUE : Si l'utilisateur demande une ville, cherche DANS ou AUTOUR de cette ville (Rayon max 50-60km).

FORMAT JSON STRICT :
{
  "metier_normalise": "string",
  "ville_reference": "string",
  "formations": [
    {
      "intitule": "Nom complet officiel (ex: BTSA Technico-Commercial)",
      "organisme": "Nom de l'établissement formateur",
      "rncp": "Code RNCP (ex: RNCP35801) ou 'Non renseigné'",
      "categorie": "Diplôme" | "Certification" | "Habilitation",
      "niveau": "3" | "4" | "5" | "6" | "N/A",
      "ville": "Ville exacte du lieu de formation",
      "distance_km": number,
      "site_web": "URL ou null",
      "modalite": "Présentiel" | "Apprentissage" | "Mixte"
    }
  ]
}`;

Deno.serve(async (req: Request) => {
  // GESTION CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { metier, ville, niveau } = await req.json();

    // Validation des entrées
    if (!metier || !ville) throw new Error("Paramètres manquants: metier, ville");
    
    const perplexityApiKey = Deno.env.get("PERPLEXITY_API_KEY");
    if (!perplexityApiKey) throw new Error("Clé API Perplexity manquante");

    console.log(`🚀 RECHERCHE OCAPIAT V7 (GOLD): ${metier} à ${ville} [Niv: ${niveau}]`);

    // --- MAPPING INTELLIGENT DES 12 MÉTIERS (Logique Inclusive & Exclusive) ---
    let motsClesTechniques = "";
    let instructionsExclusion = ""; 

    const m = metier.toLowerCase();

    // 1. FAMILLE SILO (Cœur de métier Ocapiat)
    if (m.includes("silo")) {
        motsClesTechniques = "Bac Pro Agroéquipement, CQP Agent de silo, CQP Conducteur de silo, CS Maintenance des matériels, BTSA GDEA, CAP Agricole (Métiers de l'agriculture), CS Responsable de silo.";
        instructionsExclusion = "EXCLURE STRICTEMENT : Cuisine, Boulangerie, Maçonnerie, BTP, Architecture.";
    }
    // 2. FAMILLE LOGISTIQUE (Ops vs Manager)
    else if (m.includes("responsable logistique")) {
        motsClesTechniques = "BUT QLIO (Qualité Logistique), TSMEL (Technicien Supérieur Méthodes Exploitation Logistique), BTS GTLA, Master Supply Chain.";
        instructionsExclusion = "EXCLURE : CACES seul, Simple magasinier, Chauffeur livreur.";
    }
    else if (m.includes("magasinier") || m.includes("cariste") || m.includes("logistique")) {
        motsClesTechniques = "Titre Pro Agent Magasinier, Bac Pro Logistique, CACES R489 (Cat 1, 3, 5), CAP Opérateur Logistique, Titre Pro Préparateur de commandes.";
        instructionsExclusion = "EXCLURE : Transport Routier (Conduite camion), Mécanique pure, Maintenance industrielle.";
    }
    // 3. FAMILLE MAINTENANCE (Services Techniques)
    else if (m.includes("services techniques") || m.includes("maintenance")) {
        motsClesTechniques = "BTS Maintenance des Systèmes (MS - Option A/B), BUT GIM (Génie Industriel et Maintenance), BTS Électrotechnique, BTS CRSA (Automatisme), Bac Pro MSPC.";
        instructionsExclusion = "EXCLURE : Logistique, Magasinage, Transport de marchandises, Garage automobile (Mécanique VL).";
    }
    // 4. FAMILLE COMMERCE (Technico vs Export)
    else if (m.includes("export")) {
        motsClesTechniques = "BTS Commerce International (CI), BUT TC (Parcours Business International), Licence Pro Commerce International, Master Export.";
        instructionsExclusion = "EXCLURE : Vente en boulangerie, Immobilier, Coiffure.";
    }
    else if (m.includes("technico") || m.includes("commercial")) {
        // Le Graal : BTS CCST (ex BTS TC)
        motsClesTechniques = "BTS CCST (Conseil et Commercialisation de Solutions Techniques), BTSA Technico-commercial (Vins/Jardins/Agrofournitures), BTS NDRC, BUT Techniques de Commercialisation.";
        instructionsExclusion = "EXCLURE : Hôte de caisse, Vendeur prêt-à-porter, Esthétique.";
    }
    // 5. FAMILLE QUALITÉ & AGRÉAGE
    else if (m.includes("agréeur") || m.includes("agréage")) {
        // Très spécifique Céréales
        motsClesTechniques = "CQP Agréeur, Formation Classement des grains, BTSA Agronomie (Productions Végétales), CS Stockage de céréales.";
        instructionsExclusion = "EXCLURE : Agrément assurance, Expert immobilier, Qualité aéronautique.";
    }
    else if (m.includes("qualité")) {
        motsClesTechniques = "BTSA Bioqualité (ex QIA), BUT Génie Biologique (Parcours IAB), Licence Pro Qualité Agroalimentaire, BTS QIABI.";
        instructionsExclusion = "EXCLURE : Qualité automobile, Qualité web, Développement informatique.";
    }
    // 6. FAMILLE PRODUCTION
    else if (m.includes("conducteur de ligne") || m.includes("ligne")) {
        motsClesTechniques = "Pilote de ligne de production (PLP), CQP Conducteur de ligne, Bac Pro PSPA, BTS Pilotage de procédés.";
        instructionsExclusion = "EXCLURE : Conducteur de bus, Conducteur de train (SNCF), Ligne haute tension.";
    }
    // 7. FAMILLE AGRONOMIE & CONDUITE
    else if (m.includes("technicien culture") || m.includes("culture")) {
        motsClesTechniques = "BTSA Agronomie et Productions Végétales (APV), BTSA ACSE, Licence Pro Agronomie, Ingénieur Agri/Agro.";
        instructionsExclusion = "EXCLURE : Paysagiste (Espaces verts - Aménagements), Culture artistique, Médiateur culturel.";
    }
    else if (m.includes("chauffeur")) {
        motsClesTechniques = "CAP Conducteur Routier Marchandises, Titre Pro Conducteur du transport routier (Super Lourd), CS Conduite de machines agricoles, BPA Conducteur de machines.";
        instructionsExclusion = "EXCLURE : Chauffeur VTC, Taxi, Ambulancier, Transport de voyageurs.";
    }
    // FALLBACK
    else {
        motsClesTechniques = "Formations diplômantes reconnues par l'État (RNCP) dans le secteur agricole ou alimentaire.";
        instructionsExclusion = "";
    }

    const userPrompt = `Recherche EXPERTE : Liste les formations pour devenir "${metier}" autour de "${ville}" (Rayon 50km).
    
    CIBLE TECHNIQUE (Mots-clés prioritaires) : ${motsClesTechniques}
    
    ⛔ LISTE NOIRE (A NE PAS AFFICHER) : ${instructionsExclusion}
    
    Filtre Niveau : ${niveau === 'all' ? 'Tout (du CAP au Bac+5)' : 'Niveau ' + niveau}.

    INSTRUCTIONS POUR L'EXTRACTION :
    1. Diversité : Cherche des Lycées Publics, des CFA, des MFR et des IUT.
    2. Géographie : Sois précis sur la ville du campus. Indique la distance réelle.
    3. Volume : Essaie de trouver entre 5 et 10 résultats pertinents.
    
    Renvoie UNIQUEMENT le JSON validé.`;

    // --- APPEL API PERPLEXITY (Mode Recherche Profonde) ---
    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro', // Le meilleur modèle pour la recherche
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1, // Zéro créativité, 100% factualité
        max_tokens: 4000
      }),
    });

    if (!perplexityResponse.ok) throw new Error(`Erreur API Perplexity: ${perplexityResponse.status}`);

    const perplexityData = await perplexityResponse.json();
    const content = perplexityData.choices[0].message.content;

    // --- PARSING ROBUSTE ---
    let result;
    try {
      // Nettoyage des balises markdown éventuelles
      const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
      result = JSON.parse(cleanContent);
    } catch (e) {
      console.warn("Parsing JSON direct échoué, tentative d'extraction Regex...");
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        console.error("Contenu brut reçu:", content);
        throw new Error("L'IA n'a pas renvoyé de JSON valide.");
      }
    }

    // --- POST-TRAITEMENT DE SÉCURITÉ (LE "NIQUEL" FACTOR) ---
    if (result.formations && Array.isArray(result.formations)) {
      
      const MAX_DISTANCE_KM = 65; // On laisse une petite marge (60km + 5km)

      // 1. FILTRE DE SÉCURITÉ GÉOGRAPHIQUE
      // On supprime impitoyablement tout ce qui est trop loin (Adieu Annemasse !)
      result.formations = result.formations.filter((f: any) => {
        const dist = f.distance_km;
        // On garde si la distance est connue et inférieure à la limite
        // Si distance est null/undefined, on garde par prudence (au cas où l'IA n'a pas su calculer)
        if (typeof dist === 'number') {
           return dist <= MAX_DISTANCE_KM;
        }
        return true; 
      });

      // 2. TRI PAR DISTANCE CROISSANTE
      result.formations.sort((a: any, b: any) => {
        const distA = a.distance_km || 999; // Les nulls vont à la fin
        const distB = b.distance_km || 999;
        return distA - distB;
      });

      // 3. NETTOYAGE DES NIVEAUX (Optionnel : Harmonisation)
      // Parfois l'IA renvoie "Niveau 4", on veut juste "4"
      result.formations.forEach((f: any) => {
         if (f.niveau && typeof f.niveau === 'string' && f.niveau.includes('Niveau')) {
             f.niveau = f.niveau.replace('Niveau ', '').trim();
         }
      });
    }

    console.log(`✅ SUCCÈS : ${result.formations?.length || 0} formations qualifiées renvoyées.`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error('❌ ERREUR CRITIQUE:', error);
    return new Response(JSON.stringify({ error: error.message || "Erreur interne" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});