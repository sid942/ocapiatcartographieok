// ===============================
// MÉTIERS (affichage + clé stable)
// ===============================
// IMPORTANT : les keys DOIVENT correspondre aux clés JOB_CONFIG backend
export const METIERS = [
  { key: "technico", label: "Technico-commercial" },
  { key: "silo", label: "Agent de silo" },
  { key: "chauffeur", label: "Chauffeur agricole" },
  { key: "responsable_silo", label: "Responsable silo" },

  { key: "responsable_logistique", label: "Responsable logistique" },
  { key: "magasinier_cariste", label: "Magasinier / cariste" },

  // Dans le backend refait : la clé "maintenance" a le label "Responsable services techniques"
  { key: "maintenance", label: "Responsable services techniques" },

  { key: "controleur_qualite", label: "Contrôleur qualité" },
  { key: "agreeur", label: "Agréeur" },
  { key: "conducteur_ligne", label: "Conducteur de ligne" },
  { key: "technicien_culture", label: "Technicien culture" },
  { key: "commercial_export", label: "Commercial export" },
] as const;

export type MetierKey = typeof METIERS[number]["key"];
export type MetierLabel = typeof METIERS[number]["label"];

// Compat éventuelle si des composants manipulent encore un label
export type Metier = MetierLabel;

// ===============================
// FORMATIONS
// ===============================

export type Niveau = "3" | "4" | "5" | "6" | "N/A";
export type NiveauFiltre = "3" | "4" | "5" | "6" | "all";

export interface FormationMatch {
  score?: number;
  reasons?: string[];
}

export interface Formation {
  // Back renvoie un id stable (uuid / id LBA)
  id?: string;

  intitule: string;
  organisme: string;
  ville: string | null;

  // Coordonnées (optionnelles si non géolocalisé)
  lat?: number;
  lon?: number;

  /**
   * Toujours présent.
   * Convention : 999 = non géolocalisé / distance inconnue
   */
  distance_km: number;

  // Niveau normalisé
  niveau: Niveau | string;

  // Liens
  url?: string | null;       // lien LBA éventuel
  site_web?: string | null;  // utilisé par ton UI (affiche "Voir le site")

  // Affichage
  tags?: string[];

  // Enrichissements (optionnels, car LBA ne les fournit pas toujours)
  rncp?: string;             // "Non renseigné" par défaut côté backend
  modalite?: string;         // "Non renseigné" par défaut
  alternance?: "Oui" | "Non" | string; // "Non" par défaut
  categorie?: string;        // "Diplôme / Titre" par défaut
  region?: string;

  // Futur "?" explicatif (scoring)
  match?: FormationMatch;
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
  niveau_filtre?: NiveauFiltre;
}

// Ancien nom (compat si ton code importe encore PerplexityResponse)
export type PerplexityResponse = SearchFormationsResponse;

// ===============================
// Géocodage (si utilisé)
// ===============================

export interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}
