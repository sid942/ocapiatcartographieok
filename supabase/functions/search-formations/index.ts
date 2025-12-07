import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// --- SYSTEM PROMPT V9 (L'INTELLIGENCE HUMAINE) ---
const SYSTEM_PROMPT = `Tu es le meilleur Conseiller en Évolution Professionnelle de France, spécialisé OCAPIAT.
Ta force est de connaître les "PASSERELLES DE COMPÉTENCES".

TA MISSION :
Pour un métier donné, tu ne cherches pas seulement le titre exact. Tu cherches TOUTES les formations qui apportent les compétences nécessaires.

LOGIQUE D'EXPERT (Exemple pour "Agent de Silo") :
- Si tu ne trouves pas de "CQP Agent de Silo", TU DOIS PROPOSER :
  1. La Maintenance (Bac Pro MSPC) -> Car un silo est une usine à entretenir.
  2. L'Agroéquipement (GDEA, Maintenance Matériels) -> Car c'est de la mécanique agricole.
  3. L'Agricole (CGEA) -> Pour la connaissance du grain.

RÈGLES D'OR :
1. DIVERSITÉ DES PARCOURS : Propose un mix de Diplômes d'État (CAP, Bac Pro, BTS) et de Certifications de branche (CQP, Titres Pro).
2. RÉALITÉ GÉOGRAPHIQUE : Pour les métiers agricoles, fuis les centres-villes (Paris, Lyon). Cherche en périphérie rurale.
3. EXHAUSTIVITÉ : Ne t'arrête pas à 3 résultats. Cherche jusqu'à trouver 6 à 10 options pertinentes.

FORMAT JSON STRICT :
{
  "metier_normalise": "string",
  "ville_reference": "string",
  "formations": [
    {
      "intitule": "Nom complet officiel",
      "organisme": "Nom de l'établissement (Lycée, CFA, MFR...)",
      "rncp": "Code RNCP ou 'Non renseigné'",
      "categorie": "Diplôme" | "Certification" | "Habilitation",
      "niveau": "3" | "4" | "5" | "6" | "N/A",
      "ville": "Ville exacte du CAMPUS",
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

    console.log(`🧠 RECHERCHE V9 (INTELLIGENCE MÉTIER): ${metier} autour de ${ville}`);

    // --- 1. GESTION GÉOGRAPHIQUE INTELLIGENTE ---
    // Un expert sait qu'on ne cherche pas "Silo" à Paris Centre.
    let zoneRecherche = ville;
    const grandesVilles = ["paris", "lyon", "marseille", "bordeaux", "lille", "toulouse", "nantes", "strasbourg"];
    const estMetierAgricole = metier.toLowerCase().match(/silo|culture|agri|chauffeur|agréeur/);

    if (estMetierAgricole && grandesVilles.some(v => ville.toLowerCase().includes(v))) {
         if (ville.toLowerCase().includes("paris")) zoneRecherche = "Île-de-France (Seine-et-Marne 77, Yvelines 78, Essonne 91, Val-d'Oise 95)";
         else zoneRecherche = `${ville} et sa région agricole (rayon 50km)`;
         console.log(`📍 Redirection Expert : Recherche étendue à "${zoneRecherche}"`);
    }

    // --- 2. MAPPING DES COMPÉTENCES (Le Cœur du Système) ---
    // C'est ici qu'on définit "Toutes les formations qui mènent au métier"
    let motsCles = "";
    let exclusions = "";
    const m = metier.toLowerCase();

    // === FAMILLE 1 : LE SILO & LE GRAIN ===
    if (m.includes("silo")) {
        // L'expert sait : Silo = Mécanique + Grain + Conduite
        motsCles = `
        PRIORITÉ 1 (Cœur de métier) : CQP Agent de silo, CQP Conducteur de silo, CS Responsable de silo.
        PRIORITÉ 2 (Maintenance - Vital pour le silo) : Bac Pro MSPC (Maintenance des Systèmes), Bac Pro MEI, CAP Maintenance des matériels, BTS Maintenance des Systèmes (MS).
        PRIORITÉ 3 (Agricole) : Bac Pro Agroéquipement, BTSA GDEA (Génie des Équipements Agricoles), Bac Pro CGEA (Conduite et Gestion de l'Entreprise Agricole).
        `;
        exclusions = "EXCLURE : Métiers de bouche, BTP, Logistique de carton (Amazon).";
    }
    
    // === FAMILLE 2 : MAINTENANCE & TECHNIQUE ===
    else if (m.includes("services techniques") || (m.includes("maintenance") && !m.includes("agri"))) {
        // L'expert sait : Responsable Technique = Élec + Méca + Automatisme
        motsCles = `
        PRIORITÉ 1 (Supérieur) : BTS Maintenance des Systèmes (MS), BUT GIM (Génie Industriel et Maintenance), Licence Pro Maintenance, Ingénieur Généraliste.
        PRIORITÉ 2 (Technique pure) : BTS Électrotechnique, BTS CRSA (Automatisme), BTS CIRA (Instrumentation).
        PRIORITÉ 3 (Opérationnel) : Bac Pro MSPC, Bac Pro MELEC (Métiers de l'électricité).
        `;
        exclusions = "EXCLURE : Garage auto VL, Informatique réseau, Bâtiment pur (Peintre/Maçon).";
    }

    // === FAMILLE 3 : LOGISTIQUE (Attention au piège) ===
    else if (m.includes("responsable logistique")) {
        motsCles = "BUT QLIO (Qualité Logistique), Master Supply Chain, TSMEL (Bac+2), BTS GTLA, École d'ingénieur spécialité Logistique.";
        exclusions = "EXCLURE : Simple cariste, Permis camion seul.";
    }
    else if (m.includes("magasinier") || m.includes("cariste") || m.includes("logistique")) {
        // L'expert sait : C'est le CACES qui compte + le Titre Pro
        motsCles = `
        PRIORITÉ 1 : Titre Pro Agent Magasinier, Titre Pro Préparateur de commandes.
        PRIORITÉ 2 : Bac Pro Logistique, CAP Opérateur Logistique.
        PRIORITÉ 3 (Habilitations) : CACES R489 (1, 3, 5) - Indispensable.
        `;
        exclusions = "EXCLURE : Transport routier (Longue distance), Maintenance.";
    }

    // === FAMILLE 4 : COMMERCE ===
    else if (m.includes("technico") || (m.includes("commercial") && !m.includes("export"))) {
        // L'expert sait : Technico = Double compétence (Vente + Technique)
        motsCles = `
        PRIORITÉ 1 (Le Graal) : BTS CCST (Conseil et Commercialisation de Solutions Techniques - ex BTS TC).
        PRIORITÉ 2 (Agro) : BTSA Technico-commercial (Options : Vins, Jardins, Agrofournitures, Animaux).
        PRIORITÉ 3 (Généraliste) : BTS NDRC, BUT Techniques de Commercialisation (TC).
        `;
        exclusions = "EXCLURE : Vendeur magasin (Habillement), Caisse.";
    }
    else if (m.includes("export")) {
        motsCles = "BTS Commerce International (CI), BUT TC (Parcours International), Master Commerce International, Licence Pro Export, Langues Étrangères Appliquées (LEA) avec option commerce.";
        exclusions = "EXCLURE : Vente locale.";
    }

    // === FAMILLE 5 : QUALITÉ ===
    else if (m.includes("agréeur") || m.includes("agréage")) {
        // L'expert sait : C'est très spécifique au grain
        motsCles = "CQP Agréeur, Formation 'Classement des grains', CS Stockage de céréales, BTSA Agronomie (Productions Végétales) avec module qualité.";
        exclusions = "EXCLURE : Assurance, Immobilier.";
    }
    else if (m.includes("contrôleur qualité") || m.includes("qualité")) {
        motsCles = "BTSA Bioqualité (ex QIA), BUT Génie Biologique (IAB), Licence Pro Qualité, BTS QIABI, Titre Pro Technicien Qualité.";
        exclusions = "EXCLURE : Qualité automobile, Qualité aéronautique.";
    }

    // === FAMILLE 6 : PRODUCTION ===
    else if (m.includes("conducteur de ligne") || m.includes("ligne")) {
        // L'expert sait : Il faut savoir piloter la machine
        motsCles = "Pilote de ligne de production (CQP ou Titre Pro), Bac Pro PSPA (Pilotage de systèmes de production), BTS Pilotage de procédés, CQP Conducteur de machines.";
        exclusions = "EXCLURE : Conducteur de bus, Conducteur de travaux (BTP).";
    }

    // === FAMILLE 7 : AGRONOMIE & CONDUITE ===
    else if (m.includes("technicien culture") || m.includes("culture")) {
        motsCles = "BTSA APV (Agronomie et Productions Végétales), BTSA ACSE, Licence Pro Agronomie, Ingénieur Agri, BPREA (Pour les reconversions).";
        exclusions = "EXCLURE : Paysagiste création, Fleuriste.";
    }
    else if (m.includes("chauffeur")) {
        // L'expert sait : Chauffeur Agri != Chauffeur Routier, mais les deux sont utiles
        motsCles = `
        PRIORITÉ 1 (Agri) : CS Conduite de machines agricoles, BPA Conducteur d'engins agricoles.
        PRIORITÉ 2 (Transport) : Titre Pro Conducteur du transport routier de marchandises (Porteur/Super Lourd), Permis CE + FIMO.
        `;
        exclusions = "EXCLURE : VTC, Taxi, Bus.";
    }
    
    else {
        motsCles = "Formations diplômantes du secteur agricole, alimentaire et industriel (OCAPIAT).";
    }

    const userPrompt = `En tant qu'expert carrière, liste TOUTES les formations pertinentes pour devenir "${metier}" dans la zone "${zoneRecherche}".
    
    UTILISE CETTE LOGIQUE DE PASSERELLE (Obligatoire) : 
    ${motsCles}
    
    ⛔ NE PROPOSE PAS : ${exclusions}
    
    Filtre Niveau : ${niveau === 'all' ? 'Tous niveaux' : 'Niveau ' + niveau}.

    INSTRUCTIONS :
    1. Sois EXHAUSTIF : Cherche les diplômes directs (Titre Pro) MAIS AUSSI les diplômes connexes (Maintenance, Logistique, etc.) listés ci-dessus.
    2. LOCALISATION : Cherche les Lycées Agricoles, CFPPA, MFR, CFA, IUT. Précise la ville réelle.
    3. QUANTITÉ : Vise entre 6 et 10 résultats pour offrir le choix.
    
    Renvoie le JSON uniquement.`;

    // --- APPEL API ---
    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${perplexityApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userPrompt }],
        temperature: 0.1, // Rigueur absolue
        max_tokens: 4000
      }),
    });

    if (!perplexityResponse.ok) throw new Error(`Erreur API: ${perplexityResponse.status}`);
    const data = await perplexityResponse.json();
    
    // --- PARSING ---
    let result;
    try {
        const clean = data.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
        result = JSON.parse(clean);
    } catch (e) {
        const match = data.choices[0].message.content.match(/\{[\s\S]*\}/);
        if (match) result = JSON.parse(match[0]);
        else throw new Error("Erreur JSON IA");
    }

    // --- FILTRE FINAL DE SÉCURITÉ (LE FILET DE SAUVETAGE) ---
    if (result.formations) {
        result.formations = result.formations.filter((f: any) => {
            // 1. Règle Anti-Paris pour l'Agricole (Siège social interdit)
            if (estMetierAgricole && f.ville.toLowerCase().includes("paris") && (f.distance_km || 0) < 5) return false;
            
            // 2. Règle Distance (Pas plus de 70km, on est large pour la campagne)
            const dist = f.distance_km;
            if (typeof dist === 'number') return dist <= 70;
            return true; 
        });

        // Tri par distance
        result.formations.sort((a: any, b: any) => (a.distance_km || 999) - (b.distance_km || 999));
        
        // Nettoyage esthétique des niveaux
        result.formations.forEach((f:any) => {
            if(f.niveau && f.niveau.toString().startsWith('Niveau')) f.niveau = f.niveau.replace('Niveau ', '');
        });
    }

    console.log(`✅ ${result.formations?.length || 0} parcours trouvés.`);

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});