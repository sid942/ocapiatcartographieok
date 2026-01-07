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
  /**
   * Score interne (scoring + distance + contexte)
   * Utilisé pour le "?" (pourquoi cette formation)
   */
  score?: number;

  /**
   * Raisons courtes et humaines (ex: "ROME compatible", "contexte métier OK", "distance élevée")
   */
  reasons?: string[];
}

export interface Formation {
  id?: string;

  intitule: string;
  organisme: string;

  /**
   * ✅ Le backend renvoie toujours une ville (s.city ?? villeRef)
   * Donc pas optionnel côté UI.
   */
  ville: string;

  // Coordonnées (optionnelles si non géolocalisé)
  lat?: number;
  lon?: number;

  /**
   * Toujours présent.
   * Convention backend :
   * - 999 = non géolocalisé / distance inconnue
   */
  distance_km: number;

  // ✅ Niveau normalisé (le backend renvoie "3|4|5|6|N/A")
  niveau: Niveau;

  // Liens
  url?: string | null;       // lien LBA éventuel
  site_web?: string | null;  // utilisé par ton UI (affiche "Voir le site")

  // Affichage (optionnel, futur)
  tags?: string[];

  // Enrichissements (optionnels)
  rncp?: string;
  modalite?: string;
  alternance?: "Oui" | "Non" | string;
  categorie?: string;
  region?: string;

  /**
   * Scoring (pour le "?" + debug UI)
   * En V3 backend, il est renvoyé. On le garde optionnel pour robustesse.
   */
  match?: FormationMatch;
}

// ===============================
// RÉPONSE API (Edge Function)
// ===============================

export type SearchMode =
  | "strict"
  | "relaxed"
  | "fallback_rome"
  | "strict+relaxed"
  | "strict+relaxed+fallback_rome";

export interface SearchWarnings {
  /**
   * true si des résultats dépassent le "soft cap" distance du métier
   * => utile pour afficher une alerte UX (sans faire peur)
   */
  far_results?: boolean;

  /**
   * Qualité du géocodage (API adresse)
   */
  geocode_score?: number;

  /**
   * Type de géocodage choisi (municipality/city/fallback)
   */
  geocode_type?: string;
}

export interface SearchDebugInfo {
  jobKey?: string;

  raw_count_last?: number;
  scored_count_last?: number;
  kept_count_strict_last?: number;

  best_candidates_count?: number;
  last_status?: number;

  strict_count?: number;
  merged_count_before_level_filter?: number;
  final_count_after_level_filter?: number;
}

export interface SearchFormationsResponse {
  metier_detecte: string;
  ville_reference: string;
  rayon_applique: string;

  /**
   * V3 backend: présent (mais on le laisse optionnel côté front pour tolérer les versions)
   */
  mode?: SearchMode;

  /**
   * Total trouvé AVANT filtre niveau (très utile pour UI/UX)
   */
  count_total?: number;

  /**
   * Count affiché (APRÈS filtre niveau)
   */
  count: number;

  niveau_filtre?: NiveauFiltre;
  formations: Formation[];

  /**
   * Infos “anti-honte” (UI peut afficher une petite alerte si far_results=true)
   */
  warnings?: SearchWarnings;

  /**
   * Debug backend (UI peut ignorer)
   */
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
