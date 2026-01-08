// src/services/refeaRules.ts
type Rules = {
  mustAny: string[];      // au moins 1 mot doit matcher
  mustAll?: string[];     // tous doivent matcher (optionnel)
  forbidAny: string[];    // si un match => rejet direct
};

export const REFEA_RULES: Record<string, Rules> = {
  "technico commercial": {
    mustAny: ["commerce", "commercial", "vente", "negociation", "technico", "distribution", "agrofourniture"],
    forbidAny: ["paysagiste", "equitation", "aquaculture", "amenagements paysagers", "foret"],
  },

  "agent de silo": {
    mustAny: ["cereales", "grain", "collecte", "stockage", "silo", "magasinage", "agroalimentaire", "qualite"],
    forbidAny: ["eau", "assainissement", "hydraulique", "equitation", "paysagiste", "foret"],
  },

  "chauffeur agricole": {
    mustAny: ["agroequipement", "machinisme", "machines agricoles", "pilotage", "tracteur", "recolte", "travaux mecanises"],
    forbidAny: ["equitation", "equin", "paysagiste", "foret", "bûcheronnage", "debardage", "transport de personnes"],
  },

  "responsable de silo": {
    mustAny: ["cereales", "grain", "collecte", "stockage", "qualite", "logistique", "silo"],
    forbidAny: ["eau", "assainissement", "hydraulique", "equitation", "paysagiste", "foret"],
  },

  "responsable logistique": {
    mustAny: ["logistique", "supply chain", "stocks", "flux", "entrepot", "transport", "methodes logistiques"],
    forbidAny: ["equitation", "paysagiste", "foret"],
  },

  "magasinier cariste": {
    mustAny: ["cariste", "caces", "entrepot", "magasinier", "logistique", "stock", "preparation de commandes"],
    forbidAny: ["equitation", "paysagiste", "foret"],
  },

  "responsable services techniques": {
    mustAny: ["maintenance", "genie industriel", "electromecanique", "mecanique", "automatismes", "energie", "electrique"],
    forbidAny: ["paysagiste", "equitation", "amenagements paysagers", "foret"],
  },

  "controleur qualite": {
    mustAny: ["qualite", "haccp", "controle", "laboratoire", "agroalimentaire", "tracabilite", "analyse"],
    forbidAny: ["equitation", "paysagiste", "foret"],
  },

  "agreeur": {
    mustAny: ["fruits", "legumes", "produits frais", "qualite", "reception", "tri", "calibrage"],
    forbidAny: ["equitation", "paysagiste", "foret", "eau"],
  },

  "conducteur de ligne": {
    mustAny: ["conduite de ligne", "production", "conditionnement", "process", "reglage", "agroalimentaire"],
    forbidAny: ["equitation", "paysagiste", "foret"],
  },

  "technicien culture": {
    mustAny: ["culture", "agronomie", "maraichage", "grandes cultures", "irrigation", "sol", "fertilisation"],
    forbidAny: ["equitation", "paysagiste", "foret", "bûcheronnage"],
  },

  "commercial export": {
    mustAny: ["export", "international", "commerce international", "douane", "incoterms", "anglais"],
    forbidAny: ["equitation", "paysagiste", "foret"],
  },
};
