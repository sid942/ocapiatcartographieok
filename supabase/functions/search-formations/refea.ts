// supabase/functions/search-formations/refea.ts

// Interface qui correspond à tes colonnes JSON et aux besoins du moteur
export interface RefEARow {
  formacertif_libusage?: string; // Titre
  uai_libcom?: string; // Nom école (1)
  uai_libadmin?: string; // Nom école (2)
  etablissement_niveau_1?: string; // Nom école (3)
  adresse_ville?: string; // Ville
  latitude?: string | number;
  longitude?: string | number;
  site_internet?: string;
  code_formation_maaf?: string;
  code_formation_en?: string;
  // Ajouts pour compatibilité future si ton JSON évolue
  romes?: string[];
  diplomaLevel?: string;
}

let cachedData: RefEARow[] | null = null;

/**
 * Charge les données depuis "refea.json"
 * UTILISATION DE `import.meta.url` pour garantir le chemin correct sur Supabase.
 */
export function loadRefEA(): RefEARow[] {
  // Si on a déjà chargé les données une fois, on les renvoie direct (cache mémoire)
  if (cachedData) {
    return cachedData;
  }

  try {
    console.log("[RefEA] 📂 Tentative de chargement du fichier refea.json...");
    
    // C'est ICI que la magie opère : on cible le fichier par rapport au script actuel
    const fileUrl = new URL('./refea.json', import.meta.url);
    
    // Lecture du fichier
    const text = Deno.readTextFileSync(fileUrl);
    
    if (!text || text.length === 0) {
      console.error("[RefEA] ❌ ERREUR : Le fichier refea.json est vide !");
      return [];
    }

    // Parsing JSON
    const data = JSON.parse(text);
    
    if (Array.isArray(data)) {
      cachedData = data;
      console.log(`[RefEA] ✅ SUCCÈS : ${cachedData.length} formations chargées en mémoire.`);
      return cachedData;
    } else {
      console.error("[RefEA] ❌ ERREUR : Le fichier refea.json n'est pas un tableau JSON valide.");
      return [];
    }

  } catch (e) {
    console.error("[RefEA] 💥 CRITICAL ERROR : Impossible de lire refea.json.", e);
    // On retourne un tableau vide pour ne pas faire crasher toute l'appli
    return [];
  }
}

/**
 * Convertit une valeur en nombre ou null (Sécurité parsing)
 */
export function toNumberOrNull(val: any): number | null {
  if (val === undefined || val === null || val === "") return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

/**
 * Calcul de distance GPS (Haversine)
 * Indispensable pour le tri par distance
 */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Rayon Terre km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Helper : Récupérer la ville proprement
 */
export function refeaCityOf(r: RefEARow): string {
  return r.adresse_ville ?? "";
}

/**
 * Helper : Récupérer le titre proprement
 */
export function refeaTitleOf(r: RefEARow): string {
  return r.formacertif_libusage ?? "";
}