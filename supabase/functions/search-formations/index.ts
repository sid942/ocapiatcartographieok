import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ==================================================================================
// 1. CONFIGURATION DES REQUETES (STRATÉGIE MIXTE)
// ==================================================================================

// Pour la plupart des métiers, on cherche tout d'un coup
const METIER_TO_ROME_SIMPLE: Record<string, string[]> = {
    "technico": ["D1407", "D1402", "D1403"], 
    "chauffeur": ["N4101", "N4105", "A1101"], 
    "responsable_silo": ["A1301", "A1303", "I1102"], 
    "logistique": ["N1301", "N1302"], 
    "magasinier": ["N1103", "N1105"], 
    "maintenance": ["I1304", "I1309", "I1602"], 
    "qualite": ["H1502", "H1206"], 
    "agreeur": ["H1502", "D1101"], 
    "ligne": ["H2102", "H2903"], 
    "culture": ["A1301", "A1302"], 
    "export": ["D1401", "D1402"] 
};

// Pour "Silo", on sépare pour éviter que l'industrie n'écrase l'agricole
const SILO_STRATEGY = {
    agri: ["A1416", "A1101"], // Conduite engins agri, Silo (On cherchera LOIN)
    tech: ["I1304", "I1309"]  // Maintenance industrielle (On cherchera PRÈS)
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

// Fonction helper pour appeler l'API LBA
async function fetchLBA(romes: string[], lat: number, lon: number, radius: number) {
    const url = `https://labonnealternance.apprentissage.beta.gouv.fr/api/v1/formations?romes=${romes.join(",")}&latitude=${lat}&longitude=${lon}&radius=${radius}&caller=ocapiat_app`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { metier, ville } = await req.json();
    if (!metier || !ville) throw new Error("Paramètres manquants");

    // 1. GÉOCODAGE
    let lat = 0, lon = 0;
    let villeRef = ville;
    const geoRep = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(ville)}&limit=1`);
    const geoData = await geoRep.json();
    
    if (geoData.features && geoData.features.length > 0) {
        const f = geoData.features[0];
        lon = f.geometry.coordinates[0];
        lat = f.geometry.coordinates[1];
        villeRef = `${f.properties.city} (${f.properties.postcode})`;
    } else {
        throw new Error("Ville introuvable.");
    }

    // 2. EXÉCUTION DE LA RECHERCHE (Stratégie Double ou Simple)
    const metierKey = detecterMetierKey(metier);
    let rawResults: any[] = [];

    if (metierKey === "silo") {
        // --- STRATÉGIE "SILO" DOUBLE DÉTENTE ---
        console.log("🚜 Mode Silo activé : Agri étendu + Tech local");
        
        // Requête 1 : Agri (Loin - 150km) pour choper Bougainville, etc.
        const resultsAgri = await fetchLBA(SILO_STRATEGY.agri, lat, lon, 150);
        
        // Requête 2 : Tech (Près - 30km) pour les Lycées Pros du coin
        const resultsTech = await fetchLBA(SILO_STRATEGY.tech, lat, lon, 30);
        
        // Fusion (L'agri en premier dans la liste brute avant le tri final)
        rawResults = [...resultsAgri, ...resultsTech];
    } else {
        // --- STRATÉGIE CLASSIQUE ---
        const romes = METIER_TO_ROME_SIMPLE[metierKey] || METIER_TO_ROME_SIMPLE["technico"];
        rawResults = await fetchLBA(romes, lat, lon, 100);
    }

    // 3. NETTOYAGE & DÉDOUBLONNAGE
    const processedFormations = rawResults.map((item: any) => {
        // Niveau
        let niveau = "N/A";
        const title = (item.title || "").toUpperCase();
        if (title.includes("CAP") || title.includes("TITRE PRO NIVEAU 3")) niveau = "3";
        else if (title.includes("BAC") || title.includes("BP") || title.includes("NIVEAU 4")) niveau = "4";
        else if (title.includes("BTS") || title.includes("DEUST") || title.includes("NIVEAU 5")) niveau = "5";
        else if (title.includes("BUT") || title.includes("LICENCE") || title.includes("BACHELOR") || title.includes("NIVEAU 6")) niveau = "6";
        else if (title.includes("MASTER") || title.includes("INGÉNIEUR")) niveau = "6"; 

        const dist = item.place?.distance ? Math.round(item.place.distance) : 999;
        const rncpCode = item.rncpCode || (item.rncpLabel ? "RNCP Disponible" : "Non renseigné");

        return {
            id: item.id || Math.random().toString(), // Pour dédoublonner
            intitule: item.title || "Formation",
            organisme: item.company?.name || "Organisme de formation",
            ville: item.place?.city || "",
            rncp: rncpCode,
            niveau: niveau,
            modalite: "Alternance",
            alternance: "Oui",
            categorie: title.includes("TITRE") ? "Certification" : "Diplôme",
            distance_km: dist,
            site_web: item.url || item.company?.url || null
        };
    });

    // Dédoublonnage (Important car on fusionne 2 listes pour Silo)
    const uniqueFormations = processedFormations.filter((v, i, a) => 
        a.findIndex(t => (t.intitule === v.intitule && t.organisme === v.organisme)) === i
    );

    // Tri intelligent : On garde le tri par distance, MAIS les Agri (radius 150) seront présents
    // Si on veut forcer l'Agri en haut, on pourrait trier par catégorie, mais la distance reste le plus pertinent pour l'utilisateur.
    // Le fait d'avoir restreint la Tech à 30km évite qu'elle pollue tout l'écran.
    uniqueFormations.sort((a: any, b: any) => a.distance_km - b.distance_km);

    const finalFormations = uniqueFormations.slice(0, 20);

    return new Response(JSON.stringify({
        metier_normalise: metier,
        ville_reference: villeRef,
        formations: finalFormations
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});