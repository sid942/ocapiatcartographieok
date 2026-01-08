// supabase/functions/search-formations/refeaRules.ts

/**
 * RefEA Rules (filtrage OFFLINE)
 * Objectif : ZÉRO hors-sujet.
 *
 * Stratégie :
 * - Un socle global "NO_SCHOOL" interdit tout ce qui est collège/4e/3e/cycle orientation/seconde, etc.
 * - Un socle global "NO_OFFTOPIC" interdit les gros hors-domaines récurrents (équitation, paysage, forêt…)
 * - Chaque métier ajoute ses mustAny (signaux positifs) + ses forbidAny spécifiques (eau/GEMEAU etc)
 *
 * NOTE : Le moteur RefEA applique :
 * - forbidAny => rejet immédiat
 * - mustAll (optionnel) => tous obligatoires
 * - mustAny => au moins 1 obligatoire
 */

export type Rules = {
  mustAny: string[];
  mustAll?: string[];
  forbidAny: string[];
};

/** Interdits globaux : tout ce qui est niveau collège / orientation / classes */
const NO_SCHOOL: string[] = [
  "cycle orientation",
  "college",
  "collège",
  "classe de 4",
  "classe de 3",
  "4eme",
  "4ème",
  "3eme",
  "3ème",
  "seconde",
  "2nde",
  "troisieme",
  "troisième",
  "quatrieme",
  "quatrième",
  "college agricole",
  "enseignement agricole (4",
  "enseignement agricole (3",
  "cycle d orientation",
  "cycle d'orientation",
  "orientation",
  "prepa apprentissage",
  "prépa apprentissage",
  "dispositif d orientation",
  "dispositif d'orientation",
  "classe de découverte",
  "classe d orientation",
  "classe d'orientation",
];

/** Interdits globaux : gros hors-domaines récurrents */
const NO_OFFTOPIC_COMMON: string[] = [
  // équitation / animaux de compagnie
  "equitation",
  "équitation",
  "equestre",
  "équestre",
  "cheval",
  "chevaux",
  "palefrenier",
  "soigneur",
  "animalerie",
  "animaux de compagnie",
  "canin",
  "felin",
  "félin",

  // paysage / espaces verts / fleuriste
  "paysagiste",
  "amenagement paysager",
  "aménagement paysager",
  "amenagements paysagers",
  "aménagements paysagers",
  "espaces verts",
  "horticulture ornementale",
  "fleuriste",
  "art floral",
  "jardinerie",
  "jardins",

  // forêt / bûcheronnage
  "foret",
  "forêt",
  "sylviculture",
  "bucheronnage",
  "bûcheronnage",
  "debardage",
  "débardage",
  "elagage",
  "élagage",
  "abattage",
  "tronconneuse",
  "tronçonneuse",

  // tourisme / services aux personnes
  "tourisme",
  "loisirs",
  "service a la personne",
  "services a la personne",
  "sap",
  "aide a la personne",
  "aide à la personne",
];

/** Domaine eau / environnement "GEMEAU" : à bannir FORT pour silo/responsable silo */
const NO_WATER_GEMEAU: string[] = [
  "eau",
  "assainissement",
  "hydraulique",
  "gemeau",
  "gém eau",
  "gestion de l eau",
  "gestion de l'eau",
  "milieux aquatiques",
  "riviere",
  "rivière",
  "hydrobiologie",
  "stations d epuration",
  "stations d'épuration",
  "epuration",
  "épuration",
  "reseaux d eau",
  "réseaux d'eau",
];

/** Quelques mots qui indiquent "élevage pur" quand on ne veut pas (silo/culture/ligne) */
const NO_LIVESTOCK: string[] = [
  "elevage",
  "élevage",
  "bovin",
  "porcin",
  "ovin",
  "caprin",
  "avicole",
  "volaille",
  "equin",
  "équins",
];

/** Viticulture / vin (souvent hors sujet pour plusieurs métiers) */
const NO_WINE: string[] = [
  "viticulture",
  "vigne",
  "oenologie",
  "œnologie",
  "vin",
  "vins",
  "spiritueux",
  "bieres",
  "bières",
];

/**
 * Helper : construit un forbidAny robuste sans doublons.
 */
function F(...lists: string[][]): string[] {
  return Array.from(new Set(lists.flat().filter(Boolean)));
}

/**
 * Helper : mustAny sans doublons.
 */
function M(list: string[]): string[] {
  return Array.from(new Set(list.filter(Boolean)));
}

export const REFEA_RULES: Record<string, Rules> = {
  /**
   * TECHNICO (technico-commercial)
   * On veut éviter le commerce “générique” non-agri.
   * => on oblige des signaux agro/tech + on bannit marketing/digital trop génériques.
   */
  technico: {
  mustAny: F([
    // technico-commercial "vrai"
    "technico",
    "technico commercial",
    "technico-commercial",
    "negociateur technico",
    "négociateur technico",
    "negociateur technico commercial",
    "négociateur technico commercial",
    "conseil et commercialisation",
    "commercialisation de solutions techniques",
    "solutions techniques",
    "conseil vente",
    "conseiller vente",
    "vente conseil",

    // signaux agri / filière (OCAPIAT)
    "agrofourniture",
    "intrants",
    "semences",
    "engrais",
    "phytosanitaire",
    "nutrition animale",
    "cooperative",
    "coopérative",
    "negoce agricole",
    "négoce agricole",
    "distribution agricole",

    // BTSA technico spé (RefEA)
    "biens, services pour l agriculture",
    "biens services pour l agriculture",
    "alimentation et boissons",
  ]),
  forbidAny: F(
    [...NO_SCHOOL],
    [...NO_OFFTOPIC_COMMON],

    // anti “commerce pur / marketing pur” (ce qui te pollue Paris)
    [
      "marketing",
      "acquisition",
      "digital",
      "numerique",
      "numérique",
      "e commerce",
      "e-commerce",
      "communication",
      "community manager",
      "ux",
      "ui",
      "growth",
      "influence",
      "brand",
      "marque",
    ],

    // anti intitulés trop génériques “commerce pur”
    [
      "business developer",
      "business development",
      "developpement commercial",
      "développement commercial",
      "responsable du developpement commercial",
      "responsable du développement commercial",
      "ingenierie d affaires",
      "ingénierie d affaires",
      "charge d affaires",
      "chargé d affaires",
      "conseiller commercial",
      "conseiller clientèle",
      "commercial terrain",
      "commercial b to c",
      "commercial b2c",
    ],

    // anti secteurs hors scope
    [
      "immobilier",
      "assurance",
      "banque",
      "finance",
      "courtier",
    ],
  ),
},


  /**
   * COMMERCIAL EXPORT
   * Ici le commerce "international" est OK, mais on évite tourisme/loisirs etc.
   */
  commercial_export: {
    mustAny: M([
      "export",
      "international",
      "commerce international",
      "import export",
      "import-export",
      "douane",
      "incoterms",
      "anglais",
      "negociation internationale",
      "négociation internationale",
      "logistique internationale",
    ]),
    forbidAny: F(
      [ ...NO_SCHOOL ],
      [ ...NO_OFFTOPIC_COMMON ],
      [
        "tourisme",
        "loisirs",
        "hotellerie",
        "hôtellerie",
        "restauration",
        "cuisine",
      ],
    ),
  },

  /**
   * SILO (Agent de silo)
   * ZÉRO eau/GEMEAU. On garde céréales/grains/stockage/collecte/transfo.
   * On bannit aussi élevage pur (souvent hors-sujet).
   */
  silo: {
    mustAny: M([
      "silo",
      "cereales",
      "céréales",
      "grain",
      "grains",
      "collecte",
      "stockage",
      "reception",
      "réception",
      "expedition",
      "expédition",
      "sechage",
      "séchage",
      "tri",
      "magasinage",
      "cooperative",
      "coopérative",
      "elevateur",
      "élévateur",
      "grandes cultures",
      // ouverture “indus/transfo” (utile pour RefEA)
      "industries agroalimentaires",
      "bio industries",
      "transformation",
      "conduite de systemes industriels",
      "conduite de systèmes industriels",
      "qualite",
      "qualité",
      "cgea",
    ]),
    forbidAny: F(
      [ ...NO_SCHOOL ],
      [ ...NO_OFFTOPIC_COMMON ],
      [ ...NO_WATER_GEMEAU ],
      [ ...NO_LIVESTOCK ],
      // environnement/déchets : souvent détourne vers GEMEAU/écologie
      ["dechets", "déchets", "environnement", "biodiversite", "biodiversité", "nature", "protection"],
    ),
  },

  /**
   * RESPONSABLE SILO
   * Même logique que silo + management/qualité/stocks.
   */
  responsable_silo: {
    mustAny: M([
      "silo",
      "cereales",
      "céréales",
      "grain",
      "collecte",
      "stockage",
      "stocks",
      "qualite",
      "qualité",
      "reception",
      "réception",
      "expedition",
      "expédition",
      "sechage",
      "séchage",
      "management",
      "responsable",
      "chef",
      "approvisionnement",
      "logistique",
      "grandes cultures",
      "cgea",
    ]),
    forbidAny: F(
      [ ...NO_SCHOOL ],
      [ ...NO_OFFTOPIC_COMMON ],
      [ ...NO_WATER_GEMEAU ],
      [ ...NO_LIVESTOCK ],
      ["aquaculture", "pisciculture", "poisson"],
    ),
  },

  /**
   * CHAUFFEUR AGRICOLE
   * On bannit transport de personnes + BTP + routier pur.
   */
  chauffeur: {
    mustAny: M([
      "chauffeur",
      "tracteur",
      "machinisme",
      "agroequipement",
      "agro equipement",
      "machines agricoles",
      "conduite d engins",
      "conduite d'engins",
      "travaux mecanises",
      "travaux mécanisés",
      "recolte",
      "récolte",
      "benne",
      "remorque",
      "moissonneuse",
      "ensileuse",
      "pulverisateur",
      "pulvérisateur",
      "cgea",
      "grandes cultures",
    ]),
    forbidAny: F(
      [ ...NO_SCHOOL ],
      [ ...NO_OFFTOPIC_COMMON ],
      [
        "transport de personnes",
        "voyageurs",
        "taxi",
        "vtc",
        "bus",
        "autocar",
        "scolaire",
        "ambulancier",
        "sanitaire",
        // BTP/TP
        "chantier",
        "btp",
        "travaux publics",
        "tp",
        // routier pur
        "poids lourd",
        "spl",
        "transport routier",
        "routier",
        "fimo",
        "fco",
      ],
      // équins/attelages déjà couverts, mais on insiste
      ["attelage", "attelages"],
    ),
  },

  /**
   * RESPONSABLE LOGISTIQUE
   * On veut logistique entrepôt/flux, pas transport voyageurs.
   */
  responsable_logistique: {
    mustAny: M([
      "logistique",
      "supply chain",
      "stocks",
      "flux",
      "entrepot",
      "entrepôt",
      "wms",
      "expedition",
      "expédition",
      "reception",
      "réception",
      "approvisionnement",
      "planning",
      "transport",
      "exploitation",
      "organisateur",
    ]),
    forbidAny: F(
      [ ...NO_SCHOOL ],
      [ ...NO_OFFTOPIC_COMMON ],
      [
        "transport de personnes",
        "voyageurs",
        "chauffeur de bus",
        "chauffeur",
        "taxi",
        "vtc",
        "ambulancier",
      ],
    ),
  },

  /**
   * MAGASINIER / CARISTE
   * On bannit la vente/jardinerie pour éviter “vendeur jardinerie”.
   */
  magasinier_cariste: {
    mustAny: M([
      "cariste",
      "caces",
      "chariot",
      "chariot elevateur",
      "chariot élévateur",
      "magasinier",
      "entrepot",
      "entrepôt",
      "logistique",
      "stock",
      "preparation de commandes",
      "préparation de commandes",
      "picking",
      "manutention",
      "quai",
      "emballage",
    ]),
    forbidAny: F(
      [ ...NO_SCHOOL ],
      [ ...NO_OFFTOPIC_COMMON ],
      [
        "vente",
        "vendeur",
        "conseil vente",
        "jardinerie",
        "animalerie",
        "boutique",
        "commerce",
      ],
    ),
  },

  /**
   * MAINTENANCE (services techniques)
   * On bannit IT + automobile + motoculture loisir.
   */
  maintenance: {
    mustAny: M([
      "maintenance",
      "electromecanique",
      "électromécanique",
      "mecanique",
      "mécanique",
      "automatismes",
      "automatisme",
      "electrique",
      "électrique",
      "industrie",
      "industrielle",
      "depannage",
      "dépannage",
      "robotique",
      "maintenance industrielle",
    ]),
    forbidAny: F(
      [ ...NO_SCHOOL ],
      [ ...NO_OFFTOPIC_COMMON ],
      [
        "informatique",
        "systemes d information",
        "systèmes d'information",
        "reseaux",
        "réseaux",
        "telecom",
        "télécom",
        "developpement",
        "développement",
        "cyber",
        "data",
        "cloud",
        "devops",
        // automobile
        "automobile",
        "carrosserie",
        "mecanique auto",
        "mécanique auto",
        // motoculture loisir
        "motoculture de plaisance",
      ],
    ),
  },

  /**
   * CONTRÔLEUR QUALITÉ (agro / alimentaire)
   * On bannit pharma/cosméto + eau/environnement.
   */
  controleur_qualite: {
    mustAny: M([
      "qualite",
      "qualité",
      "controle",
      "contrôle",
      "haccp",
      "tracabilite",
      "traçabilité",
      "laboratoire",
      "analyse",
      "audit",
      "bioanalyse",
      "securite des aliments",
      "sécurité des aliments",
      "agroalimentaire",
      "alimentaire",
    ]),
    forbidAny: F(
      [ ...NO_SCHOOL ],
      [ ...NO_OFFTOPIC_COMMON ],
      [ ...NO_WATER_GEMEAU ],
      ["cosmetique", "cosmétique", "pharmaceutique", "pharmacie", "chimie"],
      ["mesures physiques", "instrumentation", "electronique", "électronique"],
    ),
  },

  /**
   * AGRÉEUR (fruits/légumes)
   * On bannit logistique pure + eau.
   */
  agreeur: {
    mustAny: M([
      "agreeur",
      "agréeur",
      "agreage",
      "agréage",
      "fruits",
      "legumes",
      "légumes",
      "produits frais",
      "qualite",
      "qualité",
      "reception",
      "réception",
      "tri",
      "calibrage",
      "normalisation",
      "maturation",
    ]),
    forbidAny: F(
      [ ...NO_SCHOOL ],
      [ ...NO_OFFTOPIC_COMMON ],
      [ ...NO_WATER_GEMEAU ],
      // anti logistique pure
      ["logistique", "transport", "entrepot", "entrepôt", "magasinier", "cariste"],
      // anti floral/horti
      ["horticulture", "fleuriste", "art floral"],
    ),
  },

  /**
   * CONDUCTEUR DE LIGNE (agro/indus)
   * On bannit viticulture/élevage/horticulture.
   */
  conducteur_ligne: {
    mustAny: M([
      "conducteur de ligne",
      "conduite de ligne",
      "production",
      "conditionnement",
      "process",
      "reglage",
      "réglage",
      "transformation",
      "operateur",
      "opérateur",
      "agroalimentaire",
      "alimentaire",
      "industries agroalimentaires",
    ]),
    forbidAny: F(
      [ ...NO_SCHOOL ],
      [ ...NO_OFFTOPIC_COMMON ],
      [ ...NO_LIVESTOCK ],
      [ ...NO_WINE ],
      ["horticulture", "horticole", "paysage", "paysager"],
      // on évite de partir sur laboratoire pur
      ["laboratoire", "bioanalyse"],
    ),
  },

  /**
   * TECHNICIEN CULTURE (production végétale)
   * On bannit forêt/vin/élevage + paysage.
   */
  technicien_culture: {
    mustAny: M([
      "technicien culture",
      "culture",
      "agronomie",
      "maraichage",
      "maraîchage",
      "grandes cultures",
      "production vegetale",
      "production végétale",
      "itineraire technique",
      "itinéraire technique",
      "sol",
      "fertilisation",
      "irrigation",
      "phyto",
      "phytosanitaire",
      "conseil",
      "agroecologie",
      "agroécologie",
    ]),
    forbidAny: F(
      [ ...NO_SCHOOL ],
      [ ...NO_OFFTOPIC_COMMON ],
      [ ...NO_LIVESTOCK ],
      [ ...NO_WINE ],
      ["aquaculture", "pisciculture", "poisson"],
    ),
  },
};
