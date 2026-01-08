// supabase/functions/search-formations/refeaRules.ts

/**
 * RefEA RULES (Filtrage métier sur dataset RefEA)
 * Objectif: ZÉRO hors-sujet.
 *
 * IMPORTANT:
 * - Ce fichier est consommé par refeaSearch.ts via REFEA_RULES[jobLabel] ou REFEA_RULES[jobKey]
 * - On fournit donc:
 *   1) des règles par jobKey stable (technico, silo, etc.)
 *   2) des alias par label (ex: "Technico-commercial") pour compat index.ts actuel
 */

export type RefeaRule = {
  /** au moins UN des mots/expressions doit matcher */
  mustAny: string[];
  /** TOUS les mots/expressions doivent matcher (optionnel) */
  mustAll?: string[];
  /** si UN mot/expression match => rejet immédiat */
  forbidAny: string[];
};

/**
 * Interdictions globales (anti "collège / cycle orientation / 4e / 3e")
 * -> on le met aussi ici car RefEA est souvent la source de ces résultats.
 */
const GLOBAL_FORBID: string[] = [
  "cycle orientation",
  "cycle d orientation",
  "classe de 4eme",
  "classe de 3eme",
  "4eme",
  "3eme",
  "college",
  "collège",
  "enseignement agricole cycle",
  "cycle de l enseignement agricole",
  "4eme de l enseignement agricole",
  "3eme de l enseignement agricole",
  "cycle d insertion",
  "prepa apprentissage",
  "prepa metiers",
  "4e",
  "3e",
];

/**
 * Helpers: petites listes réutilisées
 */
const WORDS_LOGISTIQUE = ["logistique", "supply chain", "entrepot", "entrepôt", "stocks", "flux", "wms", "expedition", "expédition", "reception", "réception"];
const WORDS_QUALITE = ["qualite", "qualité", "controle", "contrôle", "haccp", "tracabilite", "traçabilité", "laboratoire", "audit", "analyse", "plan de controle", "plan de contrôle"];
const WORDS_AGRO = ["agricole", "agriculture", "agroalimentaire", "alimentaire", "cereales", "céréales", "grain", "grains"];

/**
 * RÈGLES PRINCIPALES (par jobKey)
 *
 * Notes:
 * - mustAny doit être assez spécifique pour éviter le bruit.
 * - forbidAny doit virer le bruit fréquent / hors-domaine.
 * - GLOBAL_FORBID est injecté dans chaque règle.
 */
const RULES_BY_KEY: Record<string, RefeaRule> = {
  // ---------------------------
  // SILO
  // ---------------------------
  silo: {
    mustAny: ["silo", "stockage", "collecte", "cereales", "céréales", "grain", "grains", "sechage", "séchage", "tri", "reception", "réception", "expedition", "expédition", "elevateur", "élévateur"],
    forbidAny: [
      ...GLOBAL_FORBID,
      // anti-hors sujet
      "silo ciment",
      "ciment",
      "beton",
      "béton",
      "btp",
      "batiment",
      "bâtiment",
      "assainissement",
      "hydraulique",
    ],
  },

  responsable_silo: {
    mustAny: ["chef de silo", "responsable silo", "gestion des stocks", "stocks", "stockage", "collecte", "cereales", "céréales", "qualite", "qualité", "reception", "réception", "expedition", "expédition", "management", "encadrement"],
    forbidAny: [
      ...GLOBAL_FORBID,
      "silo ciment",
      "ciment",
      "beton",
      "béton",
      "btp",
      "assainissement",
      "hydraulique",
    ],
  },

  // ---------------------------
  // CHAUFFEUR AGRICOLE (engins agricoles)
  // ---------------------------
  chauffeur: {
    mustAny: [
      "tracteur",
      "moissonneuse",
      "ensileuse",
      "pulverisateur",
      "pulvérisateur",
      "remorque",
      "benne",
      "travaux agricoles",
      "conduite de machines agricoles",
      "conducteur de machines agricoles",
      "pilotage de machines agricoles",
      "agro equipement",
      "agroéquipement",
      "agroequipement",
      "machinisme",
      "cima",
      "cgea",
    ],
    forbidAny: [
      ...GLOBAL_FORBID,
      // anti transport de personnes / routier
      "chauffeur de bus",
      "transport de personnes",
      "vtc",
      "taxi",
      "voyageurs",
      "conducteur routier",
      "poids lourd",
      "spl",
      "fimo",
      "fco",
      "messagerie",
      // anti hors-sujet agricole
      "equitation",
      "équit",
      "cheval",
      "attelage",
      "paysage",
      "paysagiste",
      "horticulture",
      "viticulture",
      "oenologie",
      "œnologie",
    ],
  },

  // ---------------------------
  // TECHNICO-COMMERCIAL (agri/agro)
  // IMPORTANT: évite les formations purement techniques (ex: génie équipements agricoles)
  // ---------------------------
  technico: {
    mustAny: [
      // signaux commerciaux
      "technico commercial",
      "technico-commercial",
      "negociation",
      "négociation",
      "vente",
      "commercial",
      "business",
      "relation client",
      "prospection",
      // spécialités agricoles fréquentes
      "agrofourniture",
      "intrants",
      "semences",
      "engrais",
      "phytosanitaire",
      "nutrition animale",
      "cooperative",
      "coopérative",
      "negoce",
      "négoce",
      // intitulés BTSA usuels
      "btsa technico commercial",
      "btsa technico-commercial",
    ],
    forbidAny: [
      ...GLOBAL_FORBID,
      // anti hors domaine
      "immobilier",
      "assurance",
      "banque",
      "cosmetique",
      "cosmétique",
      "mode",
      "textile",
      "informatique",
      "developpeur",
      "développeur",
      "web",
      // anti "tech pur" qui pollue énormément Technico
      "genie des equipements agricoles",
      "génie des équipements agricoles",
      "maintenance des materiels",
      "maintenance des matériels",
      "hydraulique",
      "automatismes",
      "electromecanique",
      "électromécanique",
    ],
  },

  // ---------------------------
  // COMMERCIAL EXPORT
  // ---------------------------
  commercial_export: {
    mustAny: ["export", "international", "commerce international", "import export", "import-export", "douane", "incoterms", "anglais"],
    forbidAny: [...GLOBAL_FORBID, "immobilier", "assurance", "banque"],
  },

  // ---------------------------
  // LOGISTIQUE
  // ---------------------------
  responsable_logistique: {
    mustAny: [...WORDS_LOGISTIQUE, "responsable logistique", "chef de quai", "pilotage des flux", "approvisionnement", "gestion des stocks"],
    forbidAny: [
      ...GLOBAL_FORBID,
      "transport de personnes",
      "chauffeur de bus",
      "vtc",
      "taxi",
    ],
  },

  magasinier_cariste: {
    mustAny: ["cariste", "caces", "chariot", "chariot elevateur", "chariot élévateur", "magasinier", "preparation de commandes", "préparation de commandes", "picking", "manutention", "quai", "entrepot", "entrepôt", "logistique"],
    forbidAny: [...GLOBAL_FORBID, "grue", "btp", "chantier", "transport de personnes"],
  },

  // ---------------------------
  // QUALITE
  // ---------------------------
  controleur_qualite: {
    mustAny: [...WORDS_QUALITE, ...WORDS_AGRO, "controleur qualite", "contrôleur qualité", "assistant qualite", "technicien qualite"],
    forbidAny: [
      ...GLOBAL_FORBID,
      // anti mesures physiques / instrumentations
      "mesures physiques",
      "instrumentation",
      "electronique",
      "électronique",
    ],
  },

  // ---------------------------
  // AGRÉEUR
  // ---------------------------
  agreeur: {
    mustAny: ["agreeur", "agréeur", "agreage", "agréage", "fruits", "legumes", "légumes", "produits frais", "calibrage", "tri", "qualite", "qualité"],
    forbidAny: [
      ...GLOBAL_FORBID,
      // éviter logistique pure
      "logistique",
      "transport",
      "entrepot",
      "entrepôt",
      "magasinier",
    ],
  },

  // ---------------------------
  // CONDUCTEUR DE LIGNE (agro)
  // ---------------------------
  conducteur_ligne: {
    mustAny: ["conducteur de ligne", "conduite de ligne", "conditionnement", "production", "fabrication", "process", "reglage", "réglage", "agroalimentaire", "alimentaire"],
    forbidAny: [...GLOBAL_FORBID, "imprimerie", "textile"],
  },

  // ---------------------------
  // TECHNICIEN CULTURE
  // ---------------------------
  technicien_culture: {
    mustAny: ["technicien culture", "technicien cultural", "agronomie", "grandes cultures", "maraichage", "maraîchage", "itineraire technique", "itinéraire technique", "fertilisation", "phytosanitaire", "production vegetale", "production végétale", "sol"],
    forbidAny: [
      ...GLOBAL_FORBID,
      "amenagements paysagers",
      "aménagements paysagers",
      "paysage",
      "paysagiste",
      "foret",
      "forêt",
      "sylviculture",
    ],
  },

  // ---------------------------
  // MAINTENANCE (indus)
  // ---------------------------
  maintenance: {
    mustAny: ["maintenance", "electromecanique", "électromécanique", "mecanique", "mécanique", "automatismes", "automatisme", "depannage", "dépannage"],
    forbidAny: [...GLOBAL_FORBID, "maintenance informatique", "reseau", "réseau", "web", "developpeur", "développeur"],
  },

  // ---------------------------
  // DEFAULT (si jamais)
  // ---------------------------
  default: {
    mustAny: [], // en pratique refeaSearch refusera si pas de règle
    forbidAny: [...GLOBAL_FORBID],
  },
};

/**
 * Alias par LABEL (pour compat immédiate avec index.ts actuel)
 * -> config.label de JOB_CONFIG (index.ts) passe ici.
 */
const LABEL_ALIASES: Record<string, string> = {
  "Agent de Silo": "silo",
  "Responsable de Silo": "responsable_silo",
  "Chauffeur Agricole": "chauffeur",
  "Technico-commercial": "technico",
  "Commercial export": "commercial_export",
  "Responsable logistique": "responsable_logistique",
  "Magasinier / cariste": "magasinier_cariste",
  "Contrôleur qualité": "controleur_qualite",
  "Agréeur": "agreeur",
  "Conducteur de ligne": "conducteur_ligne",
  "Technicien culture": "technicien_culture",
  "Responsable services techniques": "maintenance",
};

/**
 * Export final: REFEA_RULES contient:
 * - les règles par jobKey
 * - les règles dupliquées par label (alias)
 */
export const REFEA_RULES: Record<string, RefeaRule> = (() => {
  const out: Record<string, RefeaRule> = { ...RULES_BY_KEY };

  for (const [label, key] of Object.entries(LABEL_ALIASES)) {
    const rule = RULES_BY_KEY[key];
    if (rule) out[label] = rule;
  }

  return out;
})();
