// supabase/functions/search-formations/trainingWhitelist.ts

export type TrainingWhitelist = Record<
  string,
  {
    allow: string[];
    deny?: string[];
  }
>;

export const TRAINING_WHITELIST: TrainingWhitelist = {
  // =========================
  // 1) TECHNICO
  // =========================
  technico: {
    allow: [
      // BTSA / BTS
      "btsa technico commercial",
      "btsa tc bsa",
      "tc bsa",
      "btsa tc ab",
      "tc ab",
      "btsa tc ujac",
      "tc ujac",
      "bts technico commercial",
      "bts tc",
      "bts ccst",
      "conseil et commercialisation de solutions techniques",
      "commercialisation de solutions techniques",

      "btsa acse",
      "analyse conduite et strategie de l entreprise agricole",
      "btsa acd",
      "agronomie et cultures durables",
      "btsa productions animales",
      "btsa pa",
      "btsa gdea",
      "genie des equipements agricoles",

      // Titres
      "negociateur technico commercial",
      "tp ntc",
      "rncp ntc",

      // BUT / LP
      "but techniques de commercialisation",
      "but tc",
      "dut techniques de commercialisation",
      "dut tc",
      "licence professionnelle technico commercial",
      "lp tc",
      "lp productions vegetales",
      "lp pv",
      "lp commerce et vente en agrofourniture",
      "lp cva",
      "lp gestion des organisations agricoles et alimentaires",
      "lp goaa",
      "lp agronomie",
      "lp agro",
      "metiers du commerce international des produits agricoles et alimentaires",
      "lp mci-paa",
      "mci-paa",

      // Master / RNCP / Ingé
      "rncp rtc",
      "responsable technico commercial",
      "master commerce et vente",
      "master cv",
      "master meaa",
      "management des entreprises agricoles et agroalimentaires",
      "ingenieur agronome",
      "diplome agro",
    ],
    deny: [
      "marketing",
      "digital",
      "e-commerce",
      "e commerce",
      "immobilier",
      "assurance",
      "banque",
      "community manager",
      "ux",
      "ui",
      "growth",
      "business developer",
      "business development",
      "developpement commercial",
      "développement commercial",
      "developpement",
      "développement",
    ],
  },

  // =========================
  // 2) CHAUFFEUR
  // =========================
  chauffeur: {
    allow: [
      "capa metiers de l agriculture",
      "capa ma",
      "capa productions agricoles",
      "capa pa",
      "capa grandes cultures",
      "capa gc",
      "capa agriculture des regions chaudes",
      "capa arc",
      "bpa travaux de la production agricole",
      "bpa tpa",
      "bpa travaux des cultures",
      "bpa tc",
      "bpa tceea",
      "travaux de conduite et entretien des engins agricoles",
      "bpa oagc",
      "bpa ouvrier agricole polyvalent",
      "bpa oap",

      "bac pro cgea",
      "conduite et gestion de l entreprise agricole",
      "bac pro agroequipement",
      "bac pro ae",
      "bac pro productions vegetales",
      "bac pro pv",
      "bac pro mm ma",
      "maintenance des materiels option materiels agricoles",
      "bp rea",
      "responsable d entreprise agricole",
      "bp ae",
      "brevet professionnel agroequipement",
      "cs tcea",
      "tractoriste",
      "conducteur d engins agricoles",

      "btsa gdea",
      "genie des equipements agricoles",
      "btsa acd",
      "agronomie et cultures durables",
      "btsa acse",
      "btsa pv",
      "productions vegetales",
      "btsa gf",
      "gestion forestiere",

      // compléments
      "certiphyto",
      "caces r482",
      "formation conduite engins agricoles",
      "fcea",
      "fsm1",
      "maintenance de premier niveau",
    ],
    deny: [
      "taxi",
      "vtc",
      "transport de voyageurs",
      "bus",
      "autocar",
      "btp",
      "travaux publics",
      "poids lourd",
      "routier",
    ],
  },

  // =========================
  // 3) RESPONSABLE SILO
  // =========================
  responsable_silo: {
    allow: [
      "capa metiers de l agriculture",
      "capa ma",
      "capa productions agricoles",
      "capa pa",
      "bpa tpa",
      "bpa oap",

      "bac pro cgea",
      "bac pro pv",
      "bac pro productions vegetales",
      "bac pro ae",
      "bac pro agroequipement",
      "bac pro mm ma",
      "maintenance des materiels option materiels agricoles",
      "bac pro pcepc",
      "procedes de la chimie de l eau et des papiers cartons",

      "btsa acse",
      "btsa acd",
      "btsa pv",
      "btsa gdea",
      "btsa qaiams",
      "qualite alimentation innovation et maitrise sanitaire",
      "bts ms",
      "maintenance des systemes",
      "bts gtla",
      "gestion des transports et logistique associee",
      "logistique associee",

      "lp pv",
      "lp productions vegetales",
      "lp agro",
      "lp agronomie",
      "lp qhse",
      "qualite hygiene securite sante environnement",
      "lp lpf",
      "logistique et pilotage des flux",
      "lp moaa",
      "management des organisations agricoles et agroalimentaires",

      "certiphyto",
      "atex",
      "caces r482",
      "formation securite silo",
      "atmospheres confinees",
      "tracabilite cereales",
      "qualite cereales",
    ],
    deny: ["eau", "gemeau", "aquaculture", "pisciculture"],
  },

  // =========================
  // 4) AGENT SILO
  // =========================
  silo: {
    allow: [
      "capa metiers de l agriculture",
      "capa ma",
      "capa productions agricoles",
      "capa pa",
      "capa grandes cultures",
      "capa gc",
      "bpa tpa",
      "bpa oap",
      "bpa tc",
      "bpa tceea",

      "bac pro pv",
      "bac pro productions vegetales",
      "bac pro cgea",
      "bac pro ae",
      "bac pro agroequipement",
      "bac pro mm ma",
      "bac pro log",
      "bac pro logistique",
      "bac pro pcepc",

      "btsa acd",
      "btsa acse",
      "btsa pv",
      "btsa gdea",
      "bts ms",
      "maintenance des systemes",
      "bts gtla",
      "logistique associee",

      "certiphyto",
      "atex",
      "caces r482",
      "formation securite silo",
      "espaces confines",
      "tracabilite cereales",
      "qualite cereales",
    ],
    deny: ["eau", "gemeau", "aquaculture", "pisciculture"],
  },

  // =========================
  // 5) RESPONSABLE LOGISTIQUE
  // =========================
  responsable_logistique: {
    allow: [
      "bac pro log",
      "bac pro logistique",
      "bac pro otm",
      "organisation de transport de marchandises",
      "bac pro cgea",
      "bac pro mm",
      "maintenance des materiels",
      "bac pro pv",

      "bts gtla",
      "gestion des transports et logistique associee",
      "bts log",
      "bts logistique",
      "bts sam",
      "support a l action manageriale",

      "btsa acse",
      "btsa acd",
      "btsa gdea",

      "but mlt",
      "management de la logistique et des transports",
      "but tc",
      "licence professionnelle lpf",
      "logistique et pilotage des flux",
      "lp msc",
      "management de la supply chain",
      "lp la",
      "logistique agroalimentaire",
      "lp moaa",

      "master lt",
      "logistique et transport",
      "master scm",
      "supply chain management",
      "master mo",
      "management des organisations",
      "master meaa",
      "ingenieur log",
      "ingenieur gi",
      "ingenieur agro",

      // compléments
      "caces r489",
      "gestion des stocks",
      "tracabilite",
      "reglementation transport",
      "securite transport",
      "management d equipe logistique",
      "erp",
      "wms",
      "systemes d information logistique",
    ],
    deny: ["transport de personnes", "voyageurs", "taxi", "vtc"],
  },

  // =========================
  // 6) MAGASINIER / CARISTE
  // =========================
  magasinier_cariste: {
    allow: [
      "cap operateur logistique",
      "cap ol",
      "capa ma",
      "capa metiers de l agriculture",
      "capa pa",
      "capa productions agricoles",
      "capa maintenance des materiels",
      "capa mm",
      "bpa oap",
      "bpa tpa",

      "bac pro log",
      "bac pro logistique",
      "bac pro cgea",
      "bac pro ae",
      "bac pro agroequipement",
      "bac pro mm",
      "maintenance des materiels",
      "bac pro otm",

      "bts log",
      "bts logistique",
      "bts gtla",
      "btsa gdea",
      "btsa acse",

      // compléments
      "caces r489",
      "caces r482",
      "gestes et postures",
      "formation securite entrepot",
      "zones de stockage",
      "tracabilite",
      "gestion des stocks",
    ],
    deny: ["vendeur", "commerce", "jardinerie", "animalerie"],
  },

  // =========================
  // 7) SERVICES TECHNIQUES (maintenance)
  // =========================
  maintenance: {
    allow: [
      "bac pro mspc",
      "maintenance des systemes de production connectes",
      "bac pro mm ma",
      "maintenance des materiels option materiels agricoles",
      "bac pro melec",
      "metiers de l electricite",
      "bac pro pspa",
      "pilotage de systemes de production automatisee",
      "bac pro ae",
      "agroequipement",

      "bts ms",
      "maintenance des systemes",
      "bts et",
      "electrotechnique",
      "bts crsa",
      "conception et realisation de systemes automatiques",
      "bts fed",
      "fluides energies domotique",
      "bts gim",
      "genie industriel et maintenance",
      "btsa gdea",

      "but gim",
      "licence professionnelle msi",
      "maintenance des systemes industriels",
      "lp mee",
      "metiers de l electricite et de l energie",
      "lp asi",
      "automatismes et systemes industriels",
      "lp mae",
      "maintenance en agroequipements",

      "master mfsi",
      "maintenance et fiabilite des systemes industriels",
      "master gi",
      "genie industriel",
      "master es",
      "energie et systemes",
      "ingenieur gi",
      "ingenieur mi",
      "ingenieur et",
      "ingenieur auto",

      // compléments
      "habilitations electriques",
      "b0",
      "h0v",
      "b2v",
      "br",
      "management d equipe technique",
      "securite des installations industrielles",
      "icpe",
      "gestion de projets techniques",
      "maintenance preventive",
    ],
    deny: ["informatique", "reseaux", "réseaux", "telecom", "télécom", "cyber", "data"],
  },

  // =========================
  // 8) CONTROLEUR QUALITE
  // =========================
  controleur_qualite: {
    allow: [
      "bac pro bit",
      "bio industries de transformation",
      "bac pro lcq",
      "laboratoire controle qualite",
      "bac pro pcepc",
      "bac pro stl",
      "sciences et technologies de laboratoire",
      "bac pro pv",
      "bac pro cgea",

      "btsa qaiams",
      "qualite alimentation innovation et maitrise sanitaire",
      "btsa acd",
      "btsa pv",
      "bts bc",
      "bioanalyses et controles",
      "bts qiabi",
      "qualite dans les industries alimentaires",
      "bts mc",
      "metiers de la chimie",
      "bts abm",
      "analyses de biologie medicale",

      "but gb sa",
      "genie biologique",
      "sciences de l aliment",
      "but qlio",
      "qualite logistique industrielle et organisation",
      "lp qhse",
      "lp cq",
      "controle qualite",
      "lp bib",
      "bio industries et biotechnologies",
      "lp pv",

      "master qse",
      "master qhse",
      "master sta",
      "sciences et technologies des aliments",
      "master qsa",
      "qualite et securite des aliments",
      "ingenieur agroalim",
      "ingenieur agro",

      // compléments
      "haccp",
      "iso 9001",
      "iso 22000",
      "ifs",
      "brc",
      "tracabilite",
      "audit qualite",
      "certiphyto",
    ],
    deny: ["cosmetique", "cosmétique", "pharmaceutique"],
  },

  // =========================
  // 9) AGREEUR
  // =========================
  agreeur: {
    allow: [
      "capa ma",
      "capa metiers de l agriculture",
      "capa pa",
      "bpa tpa",
      "bpa oap",

      "bac pro pv",
      "bac pro cgea",
      "bac pro bit",
      "bac pro lcq",
      "bac pro stl",

      "btsa acd",
      "btsa pv",
      "btsa acse",
      "btsa qaiams",
      "bts bc",
      "bioanalyses et controles",
      "bts qiabi",

      "lp pv",
      "lp agro",
      "lp qhse",
      "lp cq",
      "but gb sa",

      // compléments agréage
      "agreage",
      "agréage",
      "cereales",
      "oleagineux",
      "echantillonnage",
      "classement des grains",
      "metrologie",
      "reglementation commerciale des grains",
      "certiphyto",
    ],
    deny: ["aquaculture", "pisciculture", "gemeau"],
  },

  // =========================
  // 10) CONDUCTEUR DE LIGNE
  // =========================
  conducteur_ligne: {
    allow: [
      "cap cip",
      "conducteur d installations de production",
      "cap of",
      "operateur de fabrication",
      "capa ma",
      "ateliers de transformation",
      "bpa bit",
      "bio industries de transformation",
      "bpa cmt",
      "conducteur de machines de transformation",

      "bac pro pspa",
      "pilotage de systemes de production automatisee",
      "bac pro bit",
      "bac pro pcepc",
      "bac pro mspc",
      "maintenance des systemes de production connectes",
      "bac pro ip",
      "industries de procedes",

      "bts pp",
      "pilotage de procedes",
      "bts ms",
      "maintenance des systemes",
      "bts crsa",
      "conception et realisation de systemes automatiques",
      "bts bc",
      "bioanalyses et controles",
      "btsa gdea",

      "but gim",
      "but gb bi",
      "genie biologique",
      "bio industries",
      "lp cla",
      "conduite de lignes automatisees",
      "lp msi",
      "maintenance des systemes industriels",
      "lp bit",
      "bio industries et transformation",

      // compléments
      "tpm",
      "maintenance de premier niveau",
      "haccp",
      "qualite",
      "tracabilite",
      "habilitations electriques",
      "heb",
      "conduite de lignes automatisees",
    ],
    deny: ["viticulture", "vigne", "vin", "horticulture", "paysage"],
  },

  // =========================
  // 11) TECHNICIEN CULTURE
  // =========================
  technicien_culture: {
    allow: [
      "bac pro pv",
      "bac pro productions vegetales",
      "bac pro cgea",
      "bac techno stav",
      "sciences et technologies de l agronomie et du vivant",

      "btsa acd",
      "btsa pv",
      "btsa acse",
      "btsa datr",
      "developpement animation des territoires ruraux",
      "btsa tc bsa",

      "lp pv",
      "lp agro",
      "lp cpa",
      "conseil en production agricole",
      "lp ada",
      "agriculture durable",
      "agroecologie",
      "lp moaa",

      "master agronomie",
      "master agroecologie",
      "master sciences du vegetal",
      "ingenieur agro",

      // compléments
      "certiphyto",
      "diagnostic agronomique",
      "protection integree des cultures",
      "oad",
      "teledetection",
      "pac",
    ],
    deny: ["viticulture", "vigne", "vin", "aquaculture", "pisciculture"],
  },

  // =========================
  // 12) COMMERCIAL EXPORT
  // =========================
  commercial_export: {
    allow: [
      "bac general",
      "stmg",
      "bac techno stmg",
      "stav",
      "bac techno stav",
      "bac pro mcv",
      "metiers du commerce et de la vente",

      "bts ci",
      "commerce international",
      "bts ndrc",
      "negociation et digitalisation de la relation client",
      "bts mco",
      "management commercial operationnel",
      "bts ccst",
      "conseil et commercialisation de solutions techniques",
      "btsa tc ab",
      "btsa tc bsa",

      "but tc",
      "but gaco",
      "gestion administrative et commerciale des organisations",
      "lp ci",
      "licence professionnelle commerce international",
      "lp mci",
      "metiers du commerce international",
      "lp cva",
      "commerce et vente en agroalimentaire",
      "lp mei",
      "management des echanges internationaux",
      "lp tc",

      "master ci",
      "commerce international",
      "master mi",
      "management international",
      "master mki",
      "marketing international",
      "master cai",
      "commerce et affaires internationales",
      "master meaa",
      "ecole de commerce",
      "ingenieur agro",

      // compléments
      "incoterms",
      "douanes",
      "logistique internationale",
      "reglementation sanitaire",
      "phytosanitaire",
      "negociation interculturelle",
      "langues",
      "anglais",
    ],
    deny: ["tourisme", "hotellerie", "hôtellerie", "restauration"],
  },
};
