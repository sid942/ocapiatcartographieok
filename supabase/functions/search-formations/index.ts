import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ==================================================================================
// 1. SOURCING (Codes ROME) - CORRIGÉ SELON AUDIT
// ==================================================================================
const METIER_TO_ROME: Record<string, string[]> = {
    "technico": ["D1407", "D1402", "D1403"], 
    
    // SILO : On ne garde QUE la Conduite d'engins et le Silo pur.
    // On retire I1304 (Maintenance Méca) pour éviter toute pollution industrielle.
    "silo": ["A1416", "A1101"], 
    
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
// 2. MATRICE DE FILTRAGE (DOMAINES AUTORISÉS)
// ==================================================================================
const METIERS_DOMAINES: Record<string, string[]> = {
    // SILO : Verrouillage total sur l'Agricole.
    silo: ["AGRI_COEUR", "AGRI_TECH", "AGRI_CONDUITE"], 
    
    responsable_silo: ["AGRI_COEUR", "AGRI_ENCADREMENT", "AGRI_TECH", "INDUS_MANAGEMENT"],
    chauffeur: ["TRANSPORT_MARCHANDISE", "AGRI_CONDUITE"],
    technico: ["COMMERCE_TECH", "COMMERCE_AGRI", "AGRI_TECH"], 
    logistique: ["LOGISTIQUE_ENCADREMENT", "LOGISTIQUE_OPS"],
    magasinier: ["LOGISTIQUE_OPS", "AGRI_COEUR"], 
    maintenance: ["MAINTENANCE_INDUS", "MAINTENANCE_AGRI", "ELEC_INDUS"], 
    qualite: ["QUALITE_BIO", "AGRI_COEUR", "AGRI_ENCADREMENT"],
    agreeur: ["AGRI_COEUR", "QUALITE_BIO"],
    ligne: ["PRODUCTION_INDUS", "AGRI_TECH"],
    culture: ["AGRI_COEUR", "AGRI_ENCADREMENT"],
    export: ["COMMERCE_INT", "COMMERCE_AGRI"]
};

// ==================================================================================
// 3. CLASSIFICATEUR DE DOMAINE (LE CERVEAU)
// ==================================================================================
function detecterDomaine(intitule: string, organisme: string): string {
    const txt = (intitule + " " + organisme).toLowerCase();

    // --- 1. DOMAINES AGRICOLES (Prioritaires) ---
    if (txt.match(/agent de silo|stockage des grains|manutention des grains|réception.*grain|céréalier/)) return "AGRI_COEUR";
    if (txt.match(/cqp|cs /) && txt.match(/silo|agri|grain|coopérative/)) return "AGRI_COEUR";
    
    // Conduite et Gestion
    if (txt.match(/cgea|acse|conduite.*entreprise agricole|responsable.*entreprise agricole|bprea/)) return "AGRI_ENCADREMENT";
    if (txt.match(/productions végétales|agronomie|grande culture|semence/)) return "AGRI_COEUR";

    // Technique Agricole
    if (txt.match(/gdea|agroéquipement|matériel agricole|machinisme|conducteur.*engin agricole/)) return "AGRI_TECH";
    if (txt.match(/conduite.*machine.*agricole|tractoriste/)) return "AGRI_CONDUITE";

    // --- 2. DOMAINES INTERDITS / DANGEREUX ---
    
    // Électricité Bâtiment (L'ennemi n°1 à Niort)
    if (txt.match(/bâtiment|domotique|habitat|communicant|installateur|équipement.*électrique/)) return "ELEC_BATIMENT";
    if (txt.match(/bp électricien|cap électricien|métiers de l'électricité/)) return "ELEC_BATIMENT";

    // Maintenance Industrielle Générique
    if (txt.match(/mspc|maintenance des systèmes|mi |mei |maintenance industrielle/)) return "MAINTENANCE_INDUS";
    if (txt.match(/électrotechnique|melec|cira|automatisme/)) return "ELEC_INDUS";

    // --- 3. AUTRES DOMAINES ---
    if (txt.match(/transport routier|super lourd|fimo|fco|conducteur routier/)) return "TRANSPORT_MARCHANDISE";
    if (txt.match(/technico|négociation|force de vente/)) return "COMMERCE_TECH";
    if (txt.match(/commerce|vente|b2b/)) return "COMMERCE_GEN";
    if (txt.match(/logistique|supply|flux/)) {
        if (txt.match(/responsable|master|but|manager/)) return "LOGISTIQUE_ENCADREMENT";
        return "LOGISTIQUE_OPS";
    }
    if (txt.match(/magasinier|cariste|caces|préparateur/)) return "LOGISTIQUE_OPS";
    if (txt.match(/qualité|laboratoire|bio|analyse/)) return "QUALITE_BIO";
    if (txt.match(/pilote|ligne|procédés|production/)) return "PRODUCTION_INDUS";
    if (txt.match(/international|export|import/)) return "COMMERCE_INT";

    return "AUTRE";
}

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
// 4. API FETCHING
// ==================================================================================

async function fetchLBA(romes: string[], lat: number, lon: number) {
    // On garde un rayon large (150km) pour trouver l'agricole, le filtre fera le tri
    const url = `https://labonnealternance.apprentissage.beta.gouv.fr/api/v1/formations?romes=${romes.join(",")}&latitude=${lat}&longitude=${lon}&radius=150&caller=ocapiat_app`;
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
    const contextPrompt = isRescueMode 
        ? "URGENT: Cherche dans TOUTE LA RÉGION. Trouve impérativement les CFPPA, MFR et Lycées Agricoles."
        : "Cherche autour de la ville indiquée.";

    // On passe les domaines autorisés à l'IA pour qu'elle s'auto-censure
    const authDomains = METIERS_DOMAINES[metierKey];
    
    const systemPrompt = `Tu es un expert en formation agricole.
    MÉTIER CIBLE : ${metierKey.toUpperCase()}
    DOMAINES STRICTEMENT AUTORISÉS : ${authDomains.join(", ")}.
    ${contextPrompt}
    
    RÈGLE D'OR : Ne propose QUE des formations qui correspondent à ces domaines.
    Refuse tout ce qui est Bâtiment, Électricité générale, Nucléaire ou Aéronautique.
    
    JSON STRICT: { "formations": [{ "intitule": "", "organisme": "", "ville": "", "niveau": "3/4/5/6" }] }`;

    const userPrompt = `Trouve 5 établissements pour "${metierKey}" vers "${promptZone}".
    Privilégie le Scolaire et le Continue (hors apprentissage).
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
// 5. HANDLER PRINCIPAL
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

    // 2. SOURCING HYBRIDE
    const metierKey = detecterMetierKey(metier);
    const romes = METIER_TO_ROME[metierKey];
    
    const [lbaResults, iaResults] = await Promise.all([
        fetchLBA(romes, lat, lon),
        perplexityApiKey ? fetchPerplexity(metierKey, villeRef, perplexityApiKey, false) : []
    ]);

    let allFormations = [...lbaResults, ...iaResults];

    // 3. FILTRAGE PAR DOMAINE (Le Verrou de Sécurité)
    const domainesAutorises = METIERS_DOMAINES[metierKey] || [];
    
    let filteredFormations = allFormations.filter(f => {
        const domaine = detecterDomaine(f.intitule, f.organisme);
        // Si le domaine détecté n'est pas dans la liste autorisée pour ce métier -> POUBELLE
        return domainesAutorises.includes(domaine);
    });

    // 4. RESCUE MODE (Si le filtre a tout tué)
    // Utile si on est dans un désert agricole : on force l'IA à chercher plus loin avec les bons critères
    if (filteredFormations.length === 0 && perplexityApiKey) {
        console.log("🚨 RESCUE MODE : Aucun résultat valide, relance régionale...");
        const rescueResults = await fetchPerplexity(metierKey, regionContext, perplexityApiKey, true);
        
        const validRescue = rescueResults.filter(f => {
            const d = detecterDomaine(f.intitule, f.organisme);
            return domainesAutorises.includes(d);
        });
        
        // Recalcul distance
        for (const f of validRescue) {
            try {
                const rGeo = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(f.organisme + " " + f.ville)}&limit=1`);
                const dGeo = await rGeo.json();
                if (dGeo.features?.length) {
                    const c = dGeo.features[0].geometry.coordinates;
                    f.distance_km = haversineDistance(lat, lon, c[1], c[0]);
                }
            } catch {}
        }
        filteredFormations = [...filteredFormations, ...validRescue];
    }

    // 5. TRI FINAL
    filteredFormations.sort((a, b) => a.distance_km - b.distance_km);
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

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round(R * c);
}