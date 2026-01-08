// supabase/functions/search-formations/refeaRules.ts

type Rules = {
  mustAny: string[];      // au moins 1 mot doit matcher
  mustAll?: string[];     // tous doivent matcher (optionnel)
  forbidAny: string[];    // si un match => rejet direct
};

// ATTENTION : Les clés ici doivent correspondre EXACTEMENT aux retours de la fonction ruleKey() dans refeaSearch.ts
export const REFEA_RULES: Record<string, Rules> = {
  
  // Clé simplifiée par ruleKey()
  "technico": { 
    mustAny: ["commerce", "commercial", "vente", "negociation", "technico", "distribution", "agrofourniture", "conseil"],
    forbidAny: ["paysagiste", "equitation", "aquaculture", "amenagements paysagers", "foret", "animalerie"],
  },

  "silo": { // Pour "Agent de silo"
    mustAny: ["cereales", "grain", "collecte", "stockage", "silo", "magasinage", "agroalimentaire", "qualite", "polyvalent"],
    forbidAny: ["eau", "assainissement", "hydraulique", "equitation", "paysagiste", "foret", "gemeau", "riviere", "milieux aquatiques"],
  },

  "chauffeur": {
    mustAny: ["agroequipement", "machinisme", "machines agricoles", "pilotage", "tracteur", "recolte", "travaux mecanises", "conduite"],
    forbidAny: ["equitation", "equin", "paysagiste", "foret", "bucheronnage", "debardage", "transport de personnes", "taxi", "bus", "voyageurs"],
  },

  "responsable_silo": {
    mustAny: ["cereales", "grain", "collecte", "stockage", "qualite", "logistique", "silo", "approvisionnement"],
    // GEMEAU est le tueur de bug pour Brest !
    forbidAny: ["eau", "assainissement", "hydraulique", "equitation", "paysagiste", "foret", "gemeau", "riviere", "aquaculture", "pisciculture"],
  },

  "responsable_logistique": {
    mustAny: ["logistique", "supply chain", "stocks", "flux", "entrepot", "transport", "methodes logistiques", "exploitation"],
    forbidAny: ["equitation", "paysagiste", "foret", "transport de personnes"],
  },

  "magasinier_cariste": {
    mustAny: ["cariste", "caces", "entrepot", "magasinier", "logistique", "stock", "preparation de commandes"],
    forbidAny: ["equitation", "paysagiste", "foret", "animalerie"],
  },

  "maintenance": { // Pour "Responsable services techniques"
    mustAny: ["maintenance", "genie industriel", "electromecanique", "mecanique", "automatismes", "energie", "electrique", "industrielle"],
    forbidAny: ["paysagiste", "equitation", "amenagements paysagers", "foret", "informatique de gestion", "systemes d'information"],
  },

  "controleur_qualite": {
    mustAny: ["qualite", "haccp", "controle", "laboratoire", "agroalimentaire", "tracabilite", "analyse", "securite des aliments"],
    forbidAny: ["equitation", "paysagiste", "foret", "eau", "environnement"],
  },

  "agreeur": {
    mustAny: ["fruits", "legumes", "produits frais", "qualite", "reception", "tri", "calibrage", "agreage"],
    forbidAny: ["equitation", "paysagiste", "foret", "eau", "fleuriste"],
  },

  "conducteur_ligne": {
    mustAny: ["conduite de ligne", "production", "conditionnement", "process", "reglage", "agroalimentaire", "pilote d'installation"],
    forbidAny: ["equitation", "paysagiste", "foret"],
  },

  "technicien_culture": {
    mustAny: ["culture", "agronomie", "maraichage", "grandes cultures", "irrigation", "sol", "fertilisation", "vegetale", "conseil"],
    forbidAny: ["equitation", "paysagiste", "foret", "bucheronnage", "aquaculture", "animal"],
  },

  "commercial_export": {
    mustAny: ["export", "international", "commerce international", "douane", "incoterms", "anglais", "negociation"],
    forbidAny: ["equitation", "paysagiste", "foret"],
  },
};