/*
  # Cartographie OCAPIAT - Tables métiers et formations

  ## Description
  Ce fichier crée les tables nécessaires pour la cartographie OCAPIAT, permettant de lier les métiers aux formations professionnelles.

  ## 1. Nouvelles Tables
  
  ### Table `metiers`
  - `id` (uuid, primary key) - Identifiant unique du métier
  - `nom` (text, unique, not null) - Nom du métier
  - `description` (text) - Description détaillée du métier
  - `competences` (jsonb) - Liste des compétences requises
  - `formations_autorisees` (jsonb) - Liste des formations recommandées
  - `created_at` (timestamptz) - Date de création
  - `updated_at` (timestamptz) - Date de dernière mise à jour

  ### Table `formations`
  - `id` (uuid, primary key) - Identifiant unique de la formation
  - `intitule` (text, not null) - Intitulé de la formation
  - `niveau` (integer) - Niveau de la formation (4, 5, 6)
  - `type` (text) - Type de formation (initiale, apprentissage, continue, etc.)
  - `domaines` (jsonb) - Domaines couverts par la formation
  - `debouches_principaux` (jsonb) - Débouchés principaux de la formation
  - `debouches_secondaires` (jsonb) - Débouchés secondaires possibles
  - `created_at` (timestamptz) - Date de création
  - `updated_at` (timestamptz) - Date de dernière mise à jour

  ### Table `metiers_formations`
  - `id` (uuid, primary key) - Identifiant unique de la relation
  - `metier_id` (uuid, foreign key) - Référence au métier
  - `formation_id` (uuid, foreign key) - Référence à la formation
  - `pertinence` (text) - Niveau de pertinence (principale, secondaire, passerelle)
  - `created_at` (timestamptz) - Date de création

  ## 2. Sécurité
  - Enable RLS sur toutes les tables
  - Politiques de lecture publique pour consultation
  - Politiques d'écriture restreintes aux utilisateurs authentifiés
*/

-- Table metiers
CREATE TABLE IF NOT EXISTS metiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text UNIQUE NOT NULL,
  description text,
  competences jsonb DEFAULT '[]'::jsonb,
  formations_autorisees jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Table formations
CREATE TABLE IF NOT EXISTS formations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intitule text NOT NULL,
  niveau integer CHECK (niveau IN (4, 5, 6)),
  type text,
  domaines jsonb DEFAULT '[]'::jsonb,
  debouches_principaux jsonb DEFAULT '[]'::jsonb,
  debouches_secondaires jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Table de liaison metiers_formations
CREATE TABLE IF NOT EXISTS metiers_formations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metier_id uuid NOT NULL REFERENCES metiers(id) ON DELETE CASCADE,
  formation_id uuid NOT NULL REFERENCES formations(id) ON DELETE CASCADE,
  pertinence text DEFAULT 'principale' CHECK (pertinence IN ('principale', 'secondaire', 'passerelle')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(metier_id, formation_id)
);

-- Index pour améliorer les performances des requêtes
CREATE INDEX IF NOT EXISTS idx_metiers_nom ON metiers(nom);
CREATE INDEX IF NOT EXISTS idx_formations_niveau ON formations(niveau);
CREATE INDEX IF NOT EXISTS idx_formations_type ON formations(type);
CREATE INDEX IF NOT EXISTS idx_metiers_formations_metier_id ON metiers_formations(metier_id);
CREATE INDEX IF NOT EXISTS idx_metiers_formations_formation_id ON metiers_formations(formation_id);

-- Fonction pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers pour mettre à jour updated_at
DROP TRIGGER IF EXISTS update_metiers_updated_at ON metiers;
CREATE TRIGGER update_metiers_updated_at
  BEFORE UPDATE ON metiers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_formations_updated_at ON formations;
CREATE TRIGGER update_formations_updated_at
  BEFORE UPDATE ON formations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE metiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE formations ENABLE ROW LEVEL SECURITY;
ALTER TABLE metiers_formations ENABLE ROW LEVEL SECURITY;

-- Politiques RLS pour metiers
CREATE POLICY "Anyone can view metiers"
  ON metiers FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert metiers"
  ON metiers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update metiers"
  ON metiers FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete metiers"
  ON metiers FOR DELETE
  TO authenticated
  USING (true);

-- Politiques RLS pour formations
CREATE POLICY "Anyone can view formations"
  ON formations FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert formations"
  ON formations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update formations"
  ON formations FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete formations"
  ON formations FOR DELETE
  TO authenticated
  USING (true);

-- Politiques RLS pour metiers_formations
CREATE POLICY "Anyone can view metiers_formations"
  ON metiers_formations FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert metiers_formations"
  ON metiers_formations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update metiers_formations"
  ON metiers_formations FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete metiers_formations"
  ON metiers_formations FOR DELETE
  TO authenticated
  USING (true);