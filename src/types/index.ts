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

  // backend: clé "maintenance" => label "Responsable services techniques"
  { key: "maintenance", label: "Responsable services techniques" },

  { key: "controleur_qualite", label: "Contrôleur qualité" },
  { key: "agreeur", label: "Agréeur" },
  { key: "conducteur_ligne", label: "Conducteur de ligne" },
  { key: "technicien_culture", label: "Technicien culture" },
  { key: "commercial_export", label: "Commercial export" },
] as const;

export type MetierKey = typeof METIERS[number]["key"];
export type MetierLabel = typeof METIERS[number]["label"];

// Compat éventuelle (si certains composants manipulent encore un label)
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
  id?: string;

  intitule: string;
  organisme: string;

  // ✅ IMPORTANT : le backend renvoie toujours une ville (s.city ?? villeRef)
  ville: string;

  // Coordonnées (optionnelles si non géolocalisé)
  lat?: number;
  lon?: number;

  /**
   * Toujours présent.
   * Convention : 999 = non géolocalisé / distance inconnue
   */
  distance_km: number;

  // ✅ Niveau normalisé (le backend renvoie "3|4|5|6|N/A")
  niveau: Niveau;

  // Liens
  url?: string | null;       // lien LBA éventuel
  site_web?: string | null;  // utilisé par ton UI (affiche "Voir le site")

  // Affichage
  tags?: string[];

  // Enrichissements (optionnels)
  rncp?: string;
  modalite?: string;
  alternance?: "Oui" | "Non" | string;
  categorie?: string;
  region?: string;

  // Scoring (futur "?" ou debug)
  match?: FormationMatch;
}

// ===============================
// RÉPONSE API (Edge Function)
// ===============================

// ✅ aligné avec le backend V2.5
export type SearchMode =
  | "strict"
  | "relaxed"
  | "fallback_rome"
  | "strict+relaxed"
  | "strict+relaxed+fallback_rome";

export interface SearchDebugInfo {
  jobKey?: string;
  raw_count_last?: number;
  scored_count_last?: number;
  kept_count_strict_last?: number;
  candidates_last_radius?: number;
}

export interface SearchFormationsResponse {
  metier_detecte: string;
  ville_reference: string;
  rayon_applique: string;

  // ✅ présent dans ton backend
  mode?: SearchMode;

  // ✅ NOUVEAU : total trouvé AVANT filtre niveau (si backend le renvoie)
  count_total?: number;

  count: number;
  niveau_filtre?: NiveauFiltre;
  formations: Formation[];

  // ✅ présent dans ton backend (tu peux l’ignorer côté UI)
  debug?: SearchDebugInfo;
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
