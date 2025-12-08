import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ==================================================================================
// 1. CONFIGURATION ROME (LBA)
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
// 2. RÈGLES MÉTIER (FILTRAGE & PRIORITÉ)
// ==================================================================================
const METIERS_RULES: Record<string, { priorites: string[], interdits: string[], niveaux: string[] }> = {
    silo: {
        priorites: ["silo", "céréale", "grain", "agricole", "conduite", "agroéquipement", "gdea"],
        interdits: ["nucléaire", "aéronautique", "spatial", "bureautique", "chimie", "informatique", "web"],
        niveaux: ["3", "4", "5"] 
    },
    responsable_silo: {
        priorites: ["silo", "céréale", "grain", "stockage", "logistique agricole", "qualité grain", "cfppa", "gdea", "agronomie"],
        interdits: ["eau", "piscine", "paysage", "forêt", "animal", "nucléaire", "aéro", "informatique"],
        niveaux: ["5", "6"] 
    },
    chauffeur: {
        priorites: ["routier", "conduite", "transport", "marchandises", "agricole", "engin", "fimo", "super lourd"],
        interdits: ["voyageurs", "bus", "commun", "taxi", "ambulance", "vtc"],
        niveaux: ["3", "4"] 
    },
    technico: {
        priorites: ["technico", "commercial", "vente", "négociation", "client", "business"],
        interdits: ["coiffure", "esthétique", "immobilier", "tourisme"],
        niveaux: ["5", "6"] 
    },
    logistique: {
        priorites: ["logistique", "supply", "chaîne", "transport", "flux", "entrepôt"],
        interdits: [],
        niveaux: ["5", "6"]
    },
    magasinier: {
        priorites: ["magasinier", "préparateur", "commande", "logistique", "cariste", "caces", "stock"],
        interdits: [],
        niveaux: ["3", "4"]
    },
    maintenance: {
        priorites: ["maintenance", "industrielle", "systèmes", "électrotechnique", "mécanique", "automatisme", "melec", "mspc"],
        interdits: ["informatique", "réseaux", "télécom", "véhicule léger", "automobile", "nucléaire", "aéro"],
        niveaux: ["3", "4", "5"]
    },
    qualite: {
        priorites: ["qualité", "laboratoire", "analyse", "contrôle", "alimentaire", "biologie", "bio", "qhse"],
        interdits: ["aéronautique", "médical", "soin"],
        niveaux: ["5", "6"]
    },
    agreeur: {
        priorites: ["qualité", "agricole", "céréale", "grain", "laboratoire", "agronomie", "classement"],
        interdits: [],
        niveaux: ["4", "5"]
    },
    ligne: {
        priorites: ["ligne", "pilote", "conducteur", "production", "procédés", "industriel"],
        interdits: ["bus", "routier"],
        niveaux: ["3", "4", "5"]
    },
    culture: {
        priorites: ["agronomie", "végétal", "culture", "agricole", "exploitation", "technicien"],
        interdits: ["animal", "élevage", "cheval", "soigneur"],
        niveaux: ["5", "6"]
    },
    export: {
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
// 3. OUTILS (GPS & FETCH)
// ==================================================================================

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round(R * c);
}

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

async function fetchPerplexity(metierKey: string, promptZone: string, apiKey: string, isRescueMode = false) {
    // Si Rescue Mode, on élargit le contexte à fond
    const contextPrompt = isRescueMode 
        ? "URGENT: Cherche dans TOUTE LA RÉGION et les départements voisins. Ignore la ville précise s'il le faut. Trouve les Lycées Agricoles, CFPPA, MFR."
        : "Cherche autour de la ville indiquée.";

    const rules = METIERS_RULES[metierKey];
    
    const systemPrompt = `Tu es un expert en formation agricole.
    RÈGLES :
    1. Priorité absolue : ${rules.priorites.join(", ")}.
    2. Interdits : ${rules.interdits.join(", ")}.
    3. Niveaux : ${rules.niveaux.join(", ")}.
    4. ${contextPrompt}
    
    JSON STRICT: { "formations": [{ "intitule": "", "organisme": "", "ville": "", "niveau": "3/4/5/6" }] }`;

    const userPrompt = `Trouve 5 établissements pour "${metierKey}" vers "${promptZone}".
    Privilégie les formations spécifiques NON trouvées en alternance (Scolaire, Initiale).
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
            distance_km: 999, // On recalcule plus tard si possible
            source: "IA"
        }));
    } catch { return []; }
}

// ==================================================================================
// 4. HANDLER PRINCIPAL
// ==================================================================================
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { metier, ville } = await req.json();
    if (!metier || !ville) throw new Error("Paramètres manquants");
    const perplexityApiKey = Deno.env.get("PERPLEXITY_API_KEY");

    // 1. GÉOCODAGE + CONTEXTE RÉGIONAL
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
        regionContext = f.properties.context || "France"; // ex: "91, Essonne, Île-de-France"
    } else {
        throw new Error("Ville introuvable.");
    }

    // 2. APPELS STANDARD (LBA + IA Locale)
    const metierKey = detecterMetierKey(metier);
    const romes = METIER_TO_ROME[metierKey];
    const rules = METIERS_RULES[metierKey];
    const isAgriMetier = ["silo", "culture", "agreeur", "responsable_silo", "chauffeur"].includes(metierKey);

    const [lbaResults, iaResults] = await Promise.all([
        fetchLBA(romes, lat, lon),
        perplexityApiKey && isAgriMetier ? fetchPerplexity(metierKey, villeRef, perplexityApiKey, false) : []
    ]);

    let allFormations = [...lbaResults, ...iaResults];

    // 3. CHECK DE SAUVETAGE (Le "Rescue Mode")
    // Est-ce qu'on a trouvé au moins UNE formation prioritaire ?
    const hasAgri = allFormations.some(f => {
        const txt = ((f.intitule || "") + " " + (f.organisme || "")).toLowerCase();
        return rules.priorites.some(p => txt.includes(p));
    });

    // Si on cherche un métier Agri et qu'on a ZERO résultat pertinent -> ON FORCE L'IA EN MODE RÉGIONAL
    if (!hasAgri && isAgriMetier && perplexityApiKey) {
        console.log("🚨 RESCUE MODE ACTIVÉ : Recherche régionale étendue...");
        const rescueResults = await fetchPerplexity(metierKey, regionContext, perplexityApiKey, true);
        
        // On recalcule la distance pour ces résultats de sauvetage (pour ne pas qu'ils restent à 999)
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

    // 4. FILTRAGE FINAL
    const filteredFormations = allFormations.filter(f => {
        let score = 0;
        const txt = ((f.intitule || "") + " " + (f.organisme || "")).toLowerCase();
        
        if (rules.interdits.some(bad => txt.includes(bad))) return false;
        
        if (rules.priorites.some(good => txt.includes(good))) score += 1;
        if (f.niveau === "N/A" || rules.niveaux.includes(f.niveau)) score += 1;
        score += 1; // Bonus de base

        return score >= 2;
    });

    // 5. TRI (BOOST AGRICOLE)
    // On met les "Coeur de métier" devant, même si un peu plus loin
    filteredFormations.sort((a, b) => {
        const txtA = ((a.intitule || "") + " " + (a.organisme || "")).toLowerCase();
        const txtB = ((b.intitule || "") + " " + (b.organisme || "")).toLowerCase();
        
        const aIsPriority = rules.priorites.some(p => txtA.includes(p));
        const bIsPriority = rules.priorites.some(p => txtB.includes(p));

        if (aIsPriority && !bIsPriority) return -1;
        if (!aIsPriority && bIsPriority) return 1;

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