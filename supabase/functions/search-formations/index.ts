import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ==================================================================================
// 1. MAPPING MÉTIER -> CODES ROME (TRADUCTEUR OCAPIAT -> FRANCE TRAVAIL)
// ==================================================================================
const METIER_TO_ROME: Record<string, string[]> = {
    // TECHNICO : Vente technique et commerciale
    "technico": ["D1407", "D1402", "D1403"], 
    // SILO : Conduite engins agri + Stockage
    "silo": ["A1416", "A1101", "I1102"], 
    // CHAUFFEUR : Transport routier + Conduite agri
    "chauffeur": ["N4101", "N4105", "A1101"], 
    // RESPONSABLE SILO : Encadrement agri + Logistique
    "responsable_silo": ["A1301", "A1303", "N1301"], 
    // LOGISTIQUE : Responsable logistique
    "logistique": ["N1301", "N1302"], 
    // MAGASINIER : Magasinage + Manutention
    "magasinier": ["N1103", "N1105"], 
    // MAINTENANCE : Maintenance industrielle et engins
    "maintenance": ["I1304", "I1309", "I1602"], 
    // QUALITÉ : Qualité alimentaire
    "qualite": ["H1502", "H1206"], 
    // AGRÉEUR : Contrôle qualité matières premières
    "agreeur": ["H1502", "D1101"], 
    // LIGNE : Conduite équipement industriel
    "ligne": ["H2102", "H2903"], 
    // CULTURE : Conseil et ingénierie agri
    "culture": ["A1301", "A1302"], 
    // EXPORT : Commerce international
    "export": ["D1401", "D1402"] 
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { metier, ville } = await req.json();
    if (!metier || !ville) throw new Error("Paramètres manquants");

    // 1. GÉOCODAGE (API Gouv - Gratuit)
    // On trouve les coordonnées GPS exactes de la ville demandée
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
        throw new Error("Ville introuvable. Vérifiez l'orthographe.");
    }

    // 2. APPEL FRANCE TRAVAIL (API La Bonne Alternance - Gratuit)
    const metierKey = detecterMetierKey(metier);
    const romes = METIER_TO_ROME[metierKey];
    // On cherche large (100km) pour être sûr de trouver les formations rares (Agri)
    const radius = 100; 
    
    // Cette URL interroge directement le catalogue national des formations
    const lbaUrl = `https://labonnealternance.apprentissage.beta.gouv.fr/api/v1/formations?romes=${romes.join(",")}&latitude=${lat}&longitude=${lon}&radius=${radius}&caller=ocapiat_app`;

    const lbaRep = await fetch(lbaUrl);
    if (!lbaRep.ok) throw new Error("Service formation indisponible momentanément (API LBA)");
    
    const lbaData = await lbaRep.json();
    const rawResults = lbaData.results || [];

    // 3. NETTOYAGE & STANDARDISATION
    const formations = rawResults.map((item: any) => {
        // Déduction du niveau depuis le titre officiel
        let niveau = "N/A";
        const title = (item.title || "").toUpperCase();
        
        if (title.includes("CAP") || title.includes("TITRE PRO NIVEAU 3")) niveau = "3";
        else if (title.includes("BAC") || title.includes("BP") || title.includes("NIVEAU 4")) niveau = "4";
        else if (title.includes("BTS") || title.includes("DEUST") || title.includes("NIVEAU 5")) niveau = "5";
        else if (title.includes("BUT") || title.includes("LICENCE") || title.includes("BACHELOR") || title.includes("NIVEAU 6")) niveau = "6";
        else if (title.includes("MASTER") || title.includes("INGÉNIEUR")) niveau = "6"; 

        // L'API nous donne la distance réelle en km
        const dist = item.place?.distance ? Math.round(item.place.distance) : 999;

        // On récupère le code RNCP s'il existe
        const rncpCode = item.rncpCode || (item.rncpLabel ? "RNCP Disponible" : "Non renseigné");

        return {
            intitule: item.title || "Formation",
            organisme: item.company?.name || "Organisme de formation",
            ville: item.place?.city || "",
            rncp: rncpCode,
            niveau: niveau,
            modalite: "Alternance", // LBA est spécialisé Alternance
            alternance: "Oui",
            categorie: title.includes("TITRE") ? "Certification" : "Diplôme",
            distance_km: dist,
            site_web: item.url || item.company?.url || null
        };
    });

    // Tri par distance (du plus proche au plus loin)
    formations.sort((a: any, b: any) => a.distance_km - b.distance_km);

    // On garde les 20 plus proches
    const finalFormations = formations.slice(0, 20);

    return new Response(JSON.stringify({
        metier_normalise: metier,
        ville_reference: villeRef,
        formations: finalFormations
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});