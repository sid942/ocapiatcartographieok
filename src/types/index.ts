// ===============================
// MÉTIERS (affichage + clé stable)
// ===============================

export const METIERS = [
  { key: "technico", label: "Technico-commercial" },
  { key: "silo", label: "Agent de silo" },
  { key: "chauffeur", label: "Chauffeur agricole" },
  { key: "responsable_silo", label: "Responsable silo" },
  { key: "logistique", label: "Responsable logistique" },
  { key: "magasinier", label: "Magasinier / cariste" },
  { key: "services_tech", label: "Responsable services techniques" },
  { key: "qualite", label: "Contrôleur qualité" },
  { key: "agreeur", label: "Agréeur" },
  { key: "conducteur_ligne", label: "Conducteur de ligne" },
  { key: "technicien_culture", label: "Technicien culture" },
  { key: "commercial_export", label: "Commercial export" },
] as const;

export type MetierKey = typeof METIERS[number]["key"];
export type MetierLabel = typeof METIERS[number]["label"];

// Pour compat si ton UI manipule encore un simple string
export type Metier = MetierLabel;

// ===============================
// FORMATIONS
// ===============================

export interface Formation {
  id?: string;

  intitule: string;
  organisme: string;
  ville: string;

  // Coordonnées (optionnelles si non géolocalisé)
  lat?: number;
  lon?: number;

  // Toujours présent : si non géolocalisé, le backend peut mettre 999
  distance_km: number;

  // Lien vers la formation (LBA ou autre)
  url?: string | null;

  // Niveau normalisé : '3' | '4' | '5' | '6' | 'N/A'
  niveau: string;

  // Tags affichage (métier + distance + etc.)
  tags?: string[];

  // ===============================
  // Champs d’enrichissement (optionnels)
  // ===============================
  rncp?: string;            // si dispo plus tard
  modalite?: string;        // "Initial" | "Alternance" | etc.
  alternance?: string;      // "Oui" | "Non"
  categorie?: string;       // "Diplôme" | "Certification" | etc.
  site_web?: string | null;
  region?: string;

  // Prévu pour ton futur "?" explicatif
  match?: {
    score?: number;
    reasons?: string[];
  };
}

// ===============================
// RÉPONSE API (Edge Function)
// ===============================

export interface SearchFormationsResponse {
  metier_detecte: string;
  ville_reference: string;
  rayon_applique: string;
  count: number;
  formations: Formation[];

  // Optionnel : si tu veux l'afficher ou le logger
  niveau_filtre?: "3" | "4" | "5" | "6" | "all";
}

// ===============================
// Ancien nom (compat si ton code importe encore PerplexityResponse)
// ===============================
export type PerplexityResponse = SearchFormationsResponse;

// ===============================
// Géocodage (si tu l'utilises)
// ===============================

export interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}
