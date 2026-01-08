// supabase/functions/search-formations/refea.ts

// ✅ IMPORTATION STATIQUE : Cela oblige le déploiement à inclure le fichier.
// Si le fichier est introuvable ou mal nommé, le déploiement échouera (ce qu'on veut pour savoir !)
import refeaData from './refea.json' with { type: "json" };

export interface RefEARow {
  formacertif_libusage?: string;
  uai_libcom?: string;
  uai_libadmin?: string;
  etablissement_niveau_1?: string;
  adresse_ville?: string;
  latitude?: string | number;
  longitude?: string | number;
  site_internet?: string;
  code_formation_maaf?: string;
  code_formation_en?: string;
  romes?: string[];
  diplomaLevel?: string;
}

let cachedData: RefEARow[] | null = null;

/**
 * Charge les données RefEA.
 * Cette version est INCASSABLE car elle utilise l'import statique.
 */
export function loadRefEA(): RefEARow[] {
  if (cachedData) return cachedData;

  try {
    console.log("[RefEA] Chargement des données statiques...");
    
    // On force le typage car l'import JSON est 'any' par défaut
    const data = refeaData as unknown;

    if (Array.isArray(data)) {
      cachedData = data as RefEARow[];
      console.log(`[RefEA] ✅ SUCCÈS : ${cachedData.length} formations chargées.`);
      return cachedData;
    } else {
      console.error("[RefEA] ❌ ERREUR CRITIQUE : Le fichier refea.json n'est pas un tableau !");
      return [];
    }
  } catch (e) {
    console.error("[RefEA] 💥 ERREUR INCONNUE au chargement :", e);
    return [];
  }
}

/**
 * Convertit une valeur en nombre ou null
 */
export function toNumberOrNull(val: any): number | null {
  if (val === undefined || val === null || val === "") return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

/**
 * Calcul de distance GPS (Haversine)
 */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; 
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

export function refeaCityOf(r: RefEARow): string {
  return r.adresse_ville ?? "";
}

export function refeaTitleOf(r: RefEARow): string {
  return r.formacertif_libusage ?? "";
}