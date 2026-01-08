// supabase/functions/search-formations/refeaRules.ts

type Rules = {
  mustAny: string[];      // Au moins 1 mot doit matcher
  mustAll?: string[];     // Tous doivent matcher (optionnel)
  forbidAny: string[];    // Si un match => POUBELLE DIRECTE
};

/**
 * REFEA RULES - VERSION "BLINDÉE"
 * Ces règles filtrent la base de données brute.
 */
export const REFEA_RULES: Record<string, Rules> = {
  
  "technico": { 
    mustAny: ["commerce", "commercial", "vente", "negociation", "technico", "distribution", "agrofourniture", "conseil vente", "business"],
    forbidAny: ["paysagiste", "amenagements paysagers", "creation", "equitation", "hippique", "cheval", "aquaculture", "poisson", "foret", "bucheronnage", "animalerie", "animaux de compagnie", "jardin", "animal", "canin", "felin", "fleuriste", "service a la personne", "seconde pro", "4eme", "3eme"],
  },

  "commercial_export": {
    mustAny: ["export", "international", "commerce international", "douane", "incoterms", "anglais", "negociation", "echanges"],
    forbidAny: ["equitation", "paysagiste", "foret", "service a la personne", "tourisme", "loisirs", "seconde pro", "4eme", "3eme"],
  },

  "silo": {
    // J'ajoute CGEA, grandes cultures, maintenance, équipements
    mustAny: ["cereales", "grain", "collecte", "stockage", "silo", "magasinage", "agroalimentaire", "qualite", "polyvalent", "agricole", "industries agroalimentaires", "transformation", "bio industries", "conduite de systemes industriels", "grandes cultures", "cgea", "equipements agricoles", "maintenance des materiels"],
    // Je garde les interdits EAU/FORET
    forbidAny: ["eau", "assainissement", "hydraulique", "gemeau", "riviere", "milieux aquatiques", "equitation", "paysagiste", "foret", "dechets", "environnement", "elevage", "soigneur", "seconde pro", "4eme", "3eme"],
  },

  "responsable_silo": {
    mustAny: ["cereales", "grain", "collecte", "stockage", "qualite", "logistique", "silo", "approvisionnement", "responsable", "industries agroalimentaires"],
    forbidAny: ["eau", "assainissement", "hydraulique", "gemeau", "riviere", "aquaculture", "pisciculture", "equitation", "paysagiste", "foret", "nature", "protection", "seconde pro", "4eme", "3eme"],
  },

  "chauffeur": {
    mustAny: ["agroequipement", "machinisme", "machines agricoles", "pilotage", "tracteur", "recolte", "travaux mecanises", "conduite", "chauffeur"],
    forbidAny: ["equitation", "equin", "attelage", "paysagiste", "creation", "foret", "bucheronnage", "debardage", "transport de personnes", "taxi", "bus", "voyageurs", "scolaire", "sanitaire", "chantier", "tp", "travaux publics", "seconde pro", "4eme", "3eme"],
  },

  "responsable_logistique": {
    mustAny: ["logistique", "supply chain", "stocks", "flux", "entrepot", "transport", "methodes logistiques", "exploitation", "organisateur"],
    forbidAny: ["equitation", "paysagiste", "foret", "transport de personnes", "voyageurs", "tourisme", "taxi", "ambulancier", "seconde pro", "4eme", "3eme"],
  },

  "magasinier_cariste": {
    mustAny: ["cariste", "caces", "entrepot", "magasinier", "logistique", "stock", "preparation de commandes", "emballage"],
    forbidAny: ["equitation", "paysagiste", "foret", "animalerie", "jardinerie", "vente", "seconde pro", "4eme", "3eme"],
  },

  "maintenance": { // Responsable services techniques
    mustAny: ["maintenance", "genie industriel", "electromecanique", "mecanique", "automatismes", "energie", "electrique", "industrielle", "robotique", "maint"],
    forbidAny: ["paysagiste", "espaces verts", "motoculture de plaisance", "equitation", "foret", "informatique de gestion", "systemes d'information", "reseaux", "telecom", "automobile", "carrosserie", "seconde pro", "4eme", "3eme"],
  },

  "controleur_qualite": {
    mustAny: ["qualite", "haccp", "controle", "laboratoire", "agroalimentaire", "tracabilite", "analyse", "securite des aliments", "bioanalyse"],
    forbidAny: ["equitation", "paysagiste", "foret", "eau", "environnement", "pollution", "cosmetique", "pharmaceutique", "seconde pro", "4eme", "3eme"],
  },

  "agreeur": {
    mustAny: ["fruits", "legumes", "produits frais", "qualite", "reception", "tri", "calibrage", "agreage", "normalisation"],
    forbidAny: ["equitation", "paysagiste", "foret", "eau", "fleuriste", "art floral", "horticulture", "seconde pro", "4eme", "3eme"],
  },

  "conducteur_ligne": {
    mustAny: ["conduite de ligne", "production", "conditionnement", "process", "reglage", "agroalimentaire", "pilote d'installation", "transformation", "operateur"],
    forbidAny: ["equitation", "paysagiste", "foret", "horticole", "horticulture", "elevage", "soigneur", "animal", "vigne", "viticulture", "laboratoire", "seconde pro", "4eme", "3eme", "seconde generale", "bac general"],
  },

  "technicien_culture": {
    mustAny: ["culture", "agronomie", "maraichage", "grandes cultures", "irrigation", "sol", "fertilisation", "vegetale", "conseil", "production vegetale", "agroecologie"],
    // AJOUTE "vigne", "viticulture", "oenologie" si tu veux exclure le vin
    // AJOUTE "sylviculture", "foret", "bucheronnage" pour virer le bois
    // AJOUTE "bac techno", "stav" pour virer le lycée pur
    forbidAny: ["equitation", "cheval", "paysagiste", "creation", "foret", "bucheronnage", "sylviculture", "aquaculture", "pisciculture", "elevage", "animal", "bovin", "porcin", "ovin", "seconde pro", "4eme", "3eme", "bac techno", "stav", "viticulture", "vigne", "oenologie"],
  },
};