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
  ville: string;
  
  // V34 renvoie toujours une valeur (Code RNCP ou "Non renseigné"), donc plus de null
  rncp: string; 
  
  // V34 nettoie les niveaux : '3', '4', '5', '6' ou 'N/A'
  niveau: string; 
  
  // V34 renvoie "Initial" ou "Alternance"
  modalite: string; 
  
  // NOUVEAU CHAMP V34 : "Oui" ou "Non" (Pour l'affichage demandé par Ocapiat)
  alternance: string; 
  
  // V34 renvoie "Diplôme", "Certification" ou "Habilitation"
  categorie: string; 
  
  // V34 calcule toujours une distance (ou 999), donc c'est un nombre obligatoire
  distance_km: number; 
  
  site_web?: string | null;
  
  // Champs optionnels (au cas où, pour compatibilité future)
  region?: string;
  lat?: number;
  lon?: number;
}

export interface PerplexityResponse {
  metier_normalise: string;
  // V34 renvoie le nom officiel de la ville ancrée (ex: "Fresnes (94260)")
  ville_reference: string; 
  formations: Formation[];
  // Optionnel car le backend ne le renvoie plus forcément dans le JSON final
  niveau_filtre?: '4' | '5' | '6' | 'all'; 
}

export interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}