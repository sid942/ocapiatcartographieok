import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ==================================================================================
// 1. CONFIGURATION ROME (Codes pour l'API État LBA)
// ==================================================================================
const METIER_TO_ROME: Record<string, string[]> = {
    "technico": ["D1407", "D1402", "D1403"], 
    "silo": ["A1416", "A1101", "I1304", "I1309"], 
    "chauffeur": ["N4101", "N4105", "A1101"], 
    "responsable_silo": ["A1301", "A1303", "I1102", "H1302"], 
    "logistique": ["N1301", "N1302"], 
    "magasinier": ["N1103", "N1105"], 
    "maintenance": ["I1304", "I1309", "I1602"], 
    "qualite": ["H1502", "H1206"], 
    "agreeur": ["H1502", "D1101"], 
    "ligne": ["H2102", "H2903"], 
    "culture": ["A1301", "A1302"], 
    "export": ["D1401", "D1402"] 
};

// ==================================================================================
// 2. RÈGLES MÉTIER & DÉFINITIONS (POUR GUIDER L'IA)
// ==================================================================================
// definition : Sert à expliquer le métier à l'IA pour qu'elle ne confonde pas "Silo" et "Ferme"
const METIERS_RULES: Record<string, { definition: string, priorites: string[], interdits: string[], niveaux: string[] }> = {
    silo: {
        definition: "Travail en SILO CÉRÉALIER : réception, séchage, tri, stockage, expédition des grains. Pas d'élevage ni de gestion de ferme globale.",
        priorites: ["silo", "stockage", "céréale", "grain", "tri", "séchage", "manutention", "coopérative", "cqp", "cs", "gdea", "agroéquipement"],
        interdits: ["nucléaire", "aéronautique", "spatial", "bureautique", "chimie", "informatique", "web", "élevage", "soigneur"],
        niveaux: ["3", "4", "5"] 
    },
    responsable_silo: {
        definition: "Management d'un site de stockage de grains. Gestion de production, qualité, logistique et encadrement d'équipe.",
        priorites: ["silo", "céréale", "grain", "stockage", "logistique agricole", "qualité grain", "cfppa", "gdea", "agronomie", "production"],
        interdits: ["eau", "piscine", "paysage", "forêt", "animal", "nucléaire", "aéro", "informatique"],
        niveaux: ["5", "6"] 
    },
    chauffeur: {
        definition: "Conduite de poids lourds ou d'engins agricoles pour le transport de marchandises.",
        priorites: ["routier", "conduite", "transport", "marchandises", "agricole", "engin", "fimo", "super lourd"],
        interdits: ["ligne","voyageurs", "bus", "commun", "taxi", "ambulance", "vtc"],
        niveaux: ["3", "4"] 
    },
    technico: {
        definition: "Vente de produits techniques auprès de professionnels (B2B).",
        priorites: ["technico", "commercial", "vente", "négociation", "client", "business", "force de vente"],
        interdits: ["coiffure", "esthétique", "immobilier", "tourisme"],
        niveaux: ["5", "6"] 
    },
    logistique: {
        definition: "Organisation des flux de marchandises et gestion d'entrepôt.",
        priorites: ["logistique", "supply", "chaîne", "transport", "flux", "entrepôt"],
        interdits: [],
        niveaux: ["5", "6"]
    },
    magasinier: {
        definition: "Réception, stockage et préparation de commandes.",
        priorites: ["magasinier", "préparateur", "commande", "logistique", "cariste", "caces", "stock"],
        interdits: [],
        niveaux: ["3", "4"]
    },
    maintenance: {
        definition: "Entretien et réparation d'équipements industriels et machines.",
        priorites: ["maintenance", "industrielle", "systèmes", "électrotechnique", "mécanique", "automatisme", "melec", "mspc"],
        interdits: ["informatique", "réseaux", "télécom", "véhicule léger", "automobile", "nucléaire", "aéro"],
        niveaux: ["3", "4", "5"]
    },
    qualite: {
        definition: "Contrôle de la qualité des produits alimentaires et respect des normes.",
        priorites: ["qualité", "laboratoire", "analyse", "contrôle", "alimentaire", "biologie", "bio", "qhse"],
        interdits: ["aéronautique", "médical", "soin"],
        niveaux: ["5", "6"]
    },
    agreeur: {
        definition: "Analyse et classement des grains à la réception (Silo).",
        priorites: ["qualité", "agricole", "céréale", "grain", "laboratoire", "agronomie", "classement"],
        interdits: [],
        niveaux: ["4", "5"]
    },
    ligne: {
        definition: "Surveillance et pilotage de machines de production industrielle.",
        priorites: ["ligne", "pilote", "conducteur", "production", "procédés", "industriel"],
        interdits: ["bus", "routier"],
        niveaux: ["3", "4", "5"]
    },
    culture: {
        definition: "Suivi technique des cultures végétales (Agronomie).",
        priorites: ["agronomie", "végétal", "culture", "agricole", "exploitation", "technicien"],
        interdits: ["animal", "élevage", "cheval", "soigneur"],
        niveaux: ["5", "6"]
    },
    export: {
        definition: "Commerce international et gestion des échanges import-export.",
        priorites: ["international", "export", "anglais", "commerce", "échange", "import"],
        interdits: [],
        niveaux: ["5", "6"]
    }
};

function detecterMetierKey(input: string): string {
    const m = input.toLowerCase();
    if (m.match(/silo|grain/)) return m.includes("responsable") ? "responsable_silo" : "silo";
    if (m.match(/culture|végétal|céréale|agronomie/)) return "culture";
    if (m.match(/chauffeur|conducteur|routier/)) return "chauffeur";
    if (m.match(/maintenance|technique/)) return "maintenance";
    if (m.match(/logistique|supply/)) return "logistique";
    if (m.match(/magasinier|cariste/)) return "magasinier";
    if (m.match(/commercial|technico/)) return m.includes("export") ? "export" : "technico";
    if (m.match(/qualité|contrôle/)) return "qualite";
    if (m.match(/agréeur/)) return "agreeur";
    if (m.match(/ligne|production/)) return "ligne";
    return "technico"; 
}

// ==================================================================================
// 3. FONCTIONS API
// ==================================================================================

// LBA : API État (Fiable sur distance et existence, mais biais CGEA)
async function fetchLBA(romes: string[], lat: number, lon: number) {
    const url = `https://labonnealternance.apprentissage.beta.gouv.fr/api/v1/formations?romes=${romes.join(",")}&latitude=${lat}&longitude=${lon}&radius=100&caller=ocapiat_app`;
    try {
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.results || []).map((item: any) => {
            const title = (item.title || "").toUpperCase();
            let niveau = "N/A";
            if (title.includes("CAP") || title.includes("TITRE PRO NIVEAU 3")) niveau = "3";
            else if (title.includes("BAC") || title.includes("BP") || title.includes("NIVEAU 4")) niveau = "4";
            else if (title.includes("BTS") || title.includes("DEUST") || title.includes("NIVEAU 5")) niveau = "5";
            else if (title.includes("BUT") || title.includes("LICENCE") || title.includes("BACHELOR") || title.includes("NIVEAU 6")) niveau = "6";
            else if (title.includes("MASTER") || title.includes("INGÉNIEUR")) niveau = "6"; 

            return {
                id: item.id || Math.random().toString(),
                intitule: item.title || "Formation",
                organisme: item.company?.name || "Organisme de formation",
                ville: item.place?.city || "",
                rncp: item.rncpCode || (item.rncpLabel ? "RNCP Disponible" : "Non renseigné"),
                niveau: niveau,
                modalite: "Alternance",
                alternance: "Oui",
                categorie: title.includes("TITRE") ? "Certification" : "Diplôme",
                distance_km: item.place?.distance ? Math.round(item.place.distance) : 999,
                site_web: item.url || item.company?.url || null,
                source: "LBA"
            };
        });
    } catch { return []; }
}

// IA : Perplexity (Pour trouver les CQP/CS spécifiques que LBA rate)
async function fetchPerplexity(metierKey: string, promptZone: string, apiKey: string, isRescueMode = false) {
    const contextPrompt = isRescueMode 
        ? "URGENT: Cherche dans TOUTE LA RÉGION et départements voisins. Trouve impérativement les CFPPA et MFR."
        : "Cherche autour de la ville indiquée.";

    const rules = METIERS_RULES[metierKey];
    
    // On injecte la définition précise du métier pour guider l'IA
    const systemPrompt = `Tu es un expert en formation agricole.
    MÉTIER CIBLE : ${rules.definition}
    
    RÈGLES DE RECHERCHE :
    1. Priorité absolue aux formations contenant : ${rules.priorites.join(", ")}.
    2. Exclure formellement : ${rules.interdits.join(", ")}.
    3. Niveaux cibles : ${rules.niveaux.join(", ")}.
    4. ${contextPrompt}
    
    JSON STRICT: { "formations": [{ "intitule": "", "organisme": "", "ville": "", "niveau": "3/4/5/6" }] }`;

    const userPrompt = `Trouve 5 établissements spécifiques pour "${metierKey}" vers "${promptZone}".
    Concentre-toi sur les CQP, CS, et Titres Pro spécifiques au métier.
    JSON uniquement.`;

    try {
        const res = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'sonar-pro',
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
                temperature: 0.1,
                max_tokens: 2000
            })
        });
        const data = await res.json();
        const clean = data.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
        const json = JSON.parse(clean.substring(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
        
        return (json.formations || []).map((f: any) => ({
            ...f,
            rncp: "Non renseigné",
            modalite: "Initiale / Continue",
            alternance: "Non",
            categorie: "Diplôme",
            distance_km: 999,
            source: "IA"
        }));
    } catch { return []; }
}

// ==================================================================================
// 4. LOGIQUE PRINCIPALE
// ==================================================================================
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { metier, ville } = await req.json();
    if (!metier || !ville) throw new Error("Paramètres manquants");
    const perplexityApiKey = Deno.env.get("PERPLEXITY_API_KEY");

    // 1. GÉOCODAGE
    let lat = 0, lon = 0;
    let villeRef = ville;
    let regionContext = "";
    
    const geoRep = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(ville)}&limit=1`);
    const geoData = await geoRep.json();
    if (geoData.features?.length > 0) {
        const f = geoData.features[0];
        lon = f.geometry.coordinates[0];
        lat = f.geometry.coordinates[1];
        villeRef = `${f.properties.city} (${f.properties.postcode})`;
        regionContext = f.properties.context || "France";
    } else {
        throw new Error("Ville introuvable.");
    }

    // 2. RECHERCHE HYBRIDE INITIALE
    const metierKey = detecterMetierKey(metier);
    const romes = METIER_TO_ROME[metierKey];
    const rules = METIERS_RULES[metierKey];
    const isAgriMetier = ["silo", "culture", "agreeur", "responsable_silo", "chauffeur"].includes(metierKey);

    const [lbaResults, iaResults] = await Promise.all([
        fetchLBA(romes, lat, lon),
        perplexityApiKey && isAgriMetier ? fetchPerplexity(metierKey, villeRef, perplexityApiKey, false) : []
    ]);

    let allFormations = [...lbaResults, ...iaResults];

    // 3. CHECK QUALITÉ ("Rescue Mode")
    // On vérifie si on a trouvé des formations vraiment spécifiques (CQP, CS, Stockage...)
    // Sinon on est probablement noyé dans le CGEA ou la Maintenance générique.
    const hasSpecificAgri = allFormations.some(f => {
        const txt = ((f.intitule || "") + " " + (f.organisme || "")).toLowerCase();
        // On cherche les mots clés FORTS (stockage, silo, grain, cqp, cs)
        const strongKeywords = ["stockage", "silo", "grain", "cqp", "cs ", "gdea"];
        return strongKeywords.some(k => txt.includes(k));
    });

    if (!hasSpecificAgri && isAgriMetier && perplexityApiKey) {
        console.log("🚨 RESCUE MODE : Pas de CQP/CS trouvé, on relance l'IA large...");
        const rescueResults = await fetchPerplexity(metierKey, regionContext, perplexityApiKey, true);
        
        // On tente de géocoder les résultats IA pour avoir une distance
        for (const f of rescueResults) {
            try {
                const rGeo = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(f.organisme + " " + f.ville)}&limit=1`);
                const dGeo = await rGeo.json();
                if (dGeo.features?.length) {
                    const c = dGeo.features[0].geometry.coordinates;
                    f.distance_km = haversineDistance(lat, lon, c[1], c[0]);
                }
            } catch {}
        }
        allFormations = [...allFormations, ...rescueResults];
    }

    // 4. FILTRAGE & SCORING FINAL
    const filteredFormations = allFormations.filter(f => {
        let score = 0;
        const txt = ((f.intitule || "") + " " + (f.organisme || "")).toLowerCase();
        
        if (rules.interdits.some(bad => txt.includes(bad))) return false;
        
        // Bonus si mot-clé prioritaire
        if (rules.priorites.some(good => txt.includes(good))) score += 1;
        // Bonus si niveau OK
        if (f.niveau === "N/A" || rules.niveaux.includes(f.niveau)) score += 1;
        
        score += 1; // Bonus présence

        return score >= 2;
    });

    // 5. TRI FINAL (Les "Vrais" Agricoles d'abord, la technique ensuite)
    filteredFormations.sort((a, b) => {
        const txtA = ((a.intitule || "") + " " + (a.organisme || "")).toLowerCase();
        const txtB = ((b.intitule || "") + " " + (b.organisme || "")).toLowerCase();
        
        // On donne un poids énorme aux mots clés "Silo", "Stockage", "CQP"
        const strongKeywords = ["silo", "stockage", "grain", "cqp", "cs ", "gdea"];
        const aIsCore = strongKeywords.some(k => txtA.includes(k));
        const bIsCore = strongKeywords.some(k => txtB.includes(k));

        if (aIsCore && !bIsCore) return -1;
        if (!aIsCore && bIsCore) return 1;

        // Sinon tri par priorité générale
        const aIsPriority = rules.priorites.some(p => txtA.includes(p));
        const bIsPriority = rules.priorites.some(p => txtB.includes(p));
        if (aIsPriority && !bIsPriority) return -1;
        if (!aIsPriority && bIsPriority) return 1;

        // Enfin tri par distance
        return a.distance_km - b.distance_km;
    });

    const finalFormations = filteredFormations.slice(0, 20);

    return new Response(JSON.stringify({
        metier_normalise: metier,
        ville_reference: villeRef,
        formations: finalFormations
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

// Helper distance
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round(R * c);
}