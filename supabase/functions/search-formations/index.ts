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
    "silo": ["A1416", "A1101", "I1304", "I1309"], // Conduite + Maintenance
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
// 2. RÈGLES MÉTIER (SCORING & FILTRAGE)
// ==================================================================================
const METIERS_RULES: Record<string, { priorites: string[], interdits: string[], niveaux: string[] }> = {
    silo: {
        priorites: ["silo", "céréale", "grain", "agricole", "maintenance", "électro", "systèmes", "conduite", "agroéquipement", "gdea"],
        interdits: ["nucléaire", "aéronautique", "spatial", "bureautique", "chimie", "informatique"],
        niveaux: ["3", "4", "5"] 
    },
    responsable_silo: {
        // Liste resserrée pour éviter le management généraliste
        priorites: ["silo", "céréale", "grain", "stockage", "logistique agricole", "qualité grain", "cfppa", "gdea", "agronomie", "productions végétales"],
        interdits: ["eau", "piscine", "paysage", "forêt", "animal", "nucléaire", "aéro", "informatique", "bancaire", "assurance"],
        niveaux: ["5", "6"] 
    },
    chauffeur: {
        priorites: ["routier", "conduite", "transport", "marchandises", "agricole", "engin", "fimo", "super lourd"],
        interdits: ["voyageurs", "bus", "commun", "taxi", "ambulance", "vtc"],
        niveaux: ["3", "4"] 
    },
    technico: {
        priorites: ["technico", "commercial", "vente", "négociation", "client", "business", "force de vente"],
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
// 3. FONCTIONS DE RÉCUPÉRATION (HYBRIDE)
// ==================================================================================

// Source 1 : La Bonne Alternance (API État)
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

// Source 2 : Perplexity (IA) - Avec Injection des règles pour cadrage
async function fetchPerplexity(metierKey: string, villePrompt: string, apiKey: string) {
    if (!["silo", "culture", "agreeur", "responsable_silo", "chauffeur"].includes(metierKey)) return [];

    const rules = METIERS_RULES[metierKey];
    
    const systemPrompt = `Tu es un expert en formation agricole.
    RÈGLES STRICTES :
    1. Formations prioritaires : ${rules.priorites.join(", ")}.
    2. Formations INTERDITES : ${rules.interdits.join(", ")}.
    3. Niveaux autorisés uniquement : ${rules.niveaux.join(", ")}.
    
    JSON STRICT: { "formations": [{ "intitule": "", "organisme": "", "ville": "", "niveau": "3/4/5/