export const METIERS = [
  'Technico-commercial',
  'Agent de silo',
  'Chauffeur agricole',
  'Responsable silo',
  'Responsable logistique',
  'Magasinier / cariste',
  'Responsable services techniques',
  'Contrôleur qualité',
  'Agréeur',
  'Conducteur de ligne',
  'Technicien culture',
  'Commercial export'
] as const;

export type Metier = typeof METIERS[number];

export interface Formation {
  intitule: string;
  organisme: string;
  rncp: string | null;
  // J'ai ajouté '3' (CAP) et 'N/A' (CACES/Permis)
  niveau: '3' | '4' | '5' | '6' | 'N/A' | null; 
  ville: string;
  region: string;
  site_web: string | null;
  type: string;
  modalite: string | null;
  // Indispensable pour le tri géographique
  distance_km?: number; 
  // Nouveau champ pour savoir si c'est un diplôme ou une habilitation
  categorie?: 'Diplôme' | 'Certification' | 'Habilitation (CACES/Permis)' | string;
  lat?: number;
  lon?: number;
}

export interface PerplexityResponse {
  metier_normalise: string;
  ville_reference: string;
  niveau_filtre: '4' | '5' | '6' | 'all';
  formations: Formation[];
}

export interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}