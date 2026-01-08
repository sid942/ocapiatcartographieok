// supabase/functions/search-formations/refeaRules.ts

type Rules = {
  mustAny: string[];
  mustAll?: string[];
  forbidAny: string[];
};

export const REFEA_RULES: Record<string, Rules> = {
  
  "technico": { 
    mustAny: ["commerce", "commercial", "vente", "negociation", "technico", "distribution", "agrofourniture", "conseil vente", "business"],
    forbidAny: ["paysagiste", "equitation", "cheval", "poisson", "foret", "animalerie", "fleuriste", "service a la personne", "animaux de compagnie", "jardins"],
  },

  "commercial_export": {
    mustAny: ["export", "international", "commerce international", "douane", "incoterms", "anglais", "negociation"],
    forbidAny: ["equitation", "paysagiste", "foret", "service a la personne", "tourisme", "loisirs"],
  },

  "silo": { 
    // J'ajoute "agricole" tout court et "polyvalent" pour attraper plus large
    mustAny: ["silo", "cereales", "grain", "stockage", "magasinage", "agroalimentaire", "qualite", "polyvalent", "agricole", "industries agroalimentaires", "transformation", "bio industries", "conduite de systemes industriels", "cgea", "grandes cultures", "equipements agricoles"],
    forbidAny: ["eau", "assainissement", "hydraulique", "gemeau", "riviere", "equitation", "paysagiste", "foret", "dechets", "elevage", "soigneur"],
  },

  "responsable_silo": {
    mustAny: ["cereales", "grain", "collecte", "stockage", "qualite", "logistique", "silo", "approvisionnement", "responsable", "industries agroalimentaires", "management agricole", "cgea"],
    forbidAny: ["eau", "assainissement", "hydraulique", "gemeau", "riviere", "aquaculture", "equitation", "paysagiste", "foret"],
  },

  "chauffeur": {
    mustAny: ["agroequipement", "machinisme", "machines agricoles", "pilotage", "tracteur", "recolte", "travaux mecanises", "conduite", "chauffeur", "cgea", "grandes cultures"],
    forbidAny: ["equitation", "equin", "attelage", "paysagiste", "creation", "foret", "bucheronnage", "transport de personnes", "taxi", "bus", "voyageurs", "ambulancier"],
  },

  "responsable_logistique": {
    mustAny: ["logistique", "supply chain", "stocks", "flux", "entrepot", "transport", "methodes logistiques", "exploitation"],
    forbidAny: ["equitation", "paysagiste", "foret", "transport de personnes", "voyageurs", "tourisme", "taxi", "ambulancier"],
  },

  "magasinier_cariste": {
    // J'ajoute "agent de quai" et "entrepot"
    mustAny: ["cariste", "caces", "entrepot", "magasinier", "logistique", "stock", "preparation de commandes", "emballage", "quai", "reception", "expedition"],
    forbidAny: ["equitation", "paysagiste", "foret", "animalerie", "jardinerie", "vente"],
  },

  "maintenance": { 
    mustAny: ["maintenance", "genie industriel", "electromecanique", "mecanique", "automatismes", "energie", "electrique", "industrielle", "robotique"],
    forbidAny: ["paysagiste", "espaces verts", "equitation", "foret", "informatique de gestion", "systemes d'information", "reseaux", "telecom", "automobile", "carrosserie"],
  },

  "controleur_qualite": {
    // J'ai enlevé "mesure" et "instrumentation"
    mustAny: ["qualite", "haccp", "controle", "laboratoire", "agroalimentaire", "tracabilite", "analyse", "securite des aliments", "bioanalyse"],
    forbidAny: ["equitation", "paysagiste", "foret", "eau", "environnement", "pollution", "cosmetique", "pharmaceutique", "mesures physiques"],
  },

  "agreeur": {
    // J'ai enlevé "reception" pour ne pas avoir de logistique, et ajouté "logistique" dans les interdits
    mustAny: ["fruits", "legumes", "produits frais", "qualite", "tri", "calibrage", "agreage", "normalisation", "vegetal"],
    forbidAny: ["equitation", "paysagiste", "foret", "eau", "fleuriste", "logistique", "transport"],
  },

  "conducteur_ligne": {
    mustAny: ["conduite de ligne", "production", "conditionnement", "process", "reglage", "agroalimentaire", "pilote d'installation", "transformation", "operateur"],
    forbidAny: ["equitation", "paysagiste", "foret", "horticole", "horticulture", "elevage", "soigneur", "animal", "vigne", "viticulture"],
  },

  "technicien_culture": {
    mustAny: ["culture", "agronomie", "maraichage", "grandes cultures", "irrigation", "sol", "fertilisation", "vegetale", "conseil", "production vegetale"],
    forbidAny: ["equitation", "cheval", "paysagiste", "creation", "foret", "bucheronnage", "aquaculture", "elevage", "animal", "bovin", "porcin", "ovin"],
  },
};