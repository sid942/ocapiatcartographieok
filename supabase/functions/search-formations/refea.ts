// supabase/functions/search-formations/refea.ts
import { join } from "https://deno.land/std@0.168.0/path/mod.ts";

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
  // Ajoute d'autres champs si ton CSV en a
}

let cachedData: RefEARow[] | null = null;

/**
 * Charge les données RefEA depuis le fichier JSON local.
 * Assure-toi que le fichier s'appelle bien "refea.json" et est dans le même dossier !
 */
export function loadRefEA(): RefEARow[] {
  if (cachedData) return cachedData;

  try {
    // On essaie de lire le fichier refea.json à la racine de la fonction
    // Note: Si tu utilises un CSV, le code doit être adapté pour parser du CSV.
    // Ici, je suppose que tu as converti ton CSV en JSON comme vu précédemment.
    const text = Deno.readTextFileSync(join(Deno.cwd(), "refea.json"));
    const data = JSON.parse(text);
    
    // Sécurité : on s'assure que c'est un tableau
    cachedData = Array.isArray(data) ? data : [];
    console.log(`[RefEA] Chargé ${cachedData?.length} lignes.`);
    return cachedData || [];
  } catch (e) {
    console.error("[RefEA] Erreur chargement refea.json :", e);
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
 * (Déplacé ici pour être partagé)
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
 * Helpers pour extraire ville / titre proprement
 */
export function refeaCityOf(r: RefEARow): string {
  return r.adresse_ville ?? "";
}

export function refeaTitleOf(r: RefEARow): string {
  return r.formacertif_libusage ?? "";
}