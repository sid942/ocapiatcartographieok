// supabase/functions/search-formations/trainingWhitelist.ts

export type TrainingWhitelist = Record<
  string,
  {
    allow: string[];
    deny?: string[];
  }
>;

export const TRAINING_WHITELIST: TrainingWhitelist = {
  // =========================================================
  // 1) Technico Commercial
  // jobKey = "technico"
  // =========================================================
  technico: {
    allow: [
      // Bac+2
      "btsa technico commercial",
      "btsa technico-commercial",
      "btsa tc bsa",
      "btsa tc ab",
      "btsa tc ujac",
      "bts technico commercial",
      "bts technico-commercial",
      "bts tc",
      "bts conseil et commercialisation de solutions techniques",
      "bts ccst",
      "btsa analyse conduite et strategie de l entreprise agricole",
      "btsa acse",
      "btsa agronomie et cultures durables",
      "btsa acd",
      "btsa productions animales",
      "btsa pa",
      "btsa genie des equipements agricoles",
      "btsa gdea",
      "titre professionnel negociateur technico commercial",
      "titre professionnel negociateur technico-commercial",
      "tp negociateur technico commercial",
      "tp ntc",
      "rncp ntc",

      // Bac+3
      "but techniques de commercialisation",
      "but tc",
      "dut techniques de commercialisation",
      "dut tc",
      "licence professionnelle technico commercial",
      "licence professionnelle technico-commercial",
      "lp technico commercial",
      "lp tc",
      "licence professionnelle productions vegetales",
      "lp productions vegetales",
      "lp pv",
      "licence professionnelle commerce et vente en agrofourniture",
      "lp commerce et vente en agrofourniture",
      "lp cva",
      "licence professionnelle gestion des organisations agricoles et alimentaires",
      "lp gestion des organisations agricoles et alimentaires",
      "lp goaa",
      "licence professionnelle agronomie",
      "lp agronomie",
      "lp agro",
      "licence professionnelle metiers du commerce international des produits agricoles et alimentaires",
      "lp metiers du commerce international des produits agricoles et alimentaires",
      "lp mci",
      "lp mci-paa",
      "mci-paa",

      // Bac+4/5
      "certification rncp responsable technico commercial",
      "responsable technico commercial",
      "responsable technico-commercial",
      "rncp rtc",
      "master commerce et vente",
      "master cv",
      "master management des entreprises agricoles et agroalimentaires",
      "master meaa",
      "diplome d ingenieur agronome",
      "diplome d’ingénieur agronome",
      "ingenieur agronome",
      "diplome agro",
    ],
    deny: [
      "marketing",
      "digital",
      "numerique",
      "numérique",
      "e-commerce",
      "e commerce",
      "immobilier",
      "assurance",
      "banque",
      "community manager",
      "ux",
      "ui",
      "growth",
      "developpeur",
      "développeur",
      "dev web",
      "developpement web",
      "développement web",
      "informatique",
      "data",
      "cyber",
      "tourisme",
      "hotellerie",
      "hôtellerie",
      "restauration",
      "esthetique",
      "esthétique",
    ],
  },

  // =========================================================
  // 2) Chauffeur agricole
  // jobKey = "chauffeur"
  // =========================================================
  chauffeur: {
    allow: [
      // infra-bac
      "capa metiers de l agriculture",
      "capa métiers de l agriculture",
      "capa ma",
      "capa productions agricoles",
      "capa pa",
      "capa grandes cultures",
      "capa gc",
      "capa agriculture des regions chaudes",
      "capa agriculture des régions chaudes",
      "capa arc",
      "bpa travaux de la production agricole",
      "bpa tpa",
      "bpa travaux des cultures",
      "bpa tc",
      "bpa travaux de conduite et entretien des engins agricoles",
      "bpa tceea",
      "bpa ouvrier agricole en grandes cultures",
      "bpa oagc",
      "bpa ouvrier agricole polyvalent",
      "bpa oap",

      // bac
      "bac professionnel conduite et gestion de l entreprise agricole",
      "bac pro cgea",
      "bac professionnel agroequipement",
      "bac pro agroequipement",
      "bac pro ae",
      "bac professionnel productions vegetales",
      "bac pro productions vegetales",
      "bac pro pv",
      "bac professionnel maintenance des materiels",
      "bac pro maintenance des materiels",
      "bac pro mm ma",
      "brevet professionnel responsable d entreprise agricole",
      "bp rea",
      "brevet professionnel agroequipement",
      "bp agroequipement",
      "bp ae",
      "certificat de specialisation tractoriste",
      "cs tractoriste",
      "certificat de specialisation conducteur d engins agricoles",
      "cs tcea",
      "cs tcea",

      // bac+2
      "btsa genie des equipements agricoles",
      "btsa gdea",
      "btsa agronomie et cultures durables",
      "btsa acd",
      "btsa analyse conduite et strategie de l entreprise agricole",
      "btsa acse",
      "btsa productions vegetales",
      "btsa pv",
      "btsa gestion forestiere",
      "btsa gf",

      // compléments
      "certiphyto",
      "certiphyto operateur",
      "certiphyto opérateur",
      "formation a la conduite des engins agricoles",
      "formation conduite engins agricoles",
      "fcea",
      "caces r482",
      "formation securite et maintenance de premier niveau des materiels agricoles",
      "fsm1",
      "fsm1 ma",
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
      "transport routier",
      "livreur",
      "livraison",
    ],
  },

  // =========================================================
  // 3) Responsable Silo
  // jobKey = "responsable_silo"
  // =========================================================
  responsable_silo: {
    allow: [
      // infra-bac
      "capa metiers de l agriculture",
      "capa ma",
      "capa productions agricoles",
      "capa pa",
      "bpa travaux de la production agricole",
      "bpa tpa",
      "bpa ouvrier agricole polyvalent",
      "bpa oap",

      // bac
      "bac professionnel conduite et gestion de l entreprise agricole",
      "bac pro cgea",
      "bac professionnel productions vegetales",
      "bac pro pv",
      "bac professionnel agroequipement",
      "bac pro ae",
      "bac professionnel maintenance des materiels",
      "bac pro mm ma",
      "bac professionnel procedes de la chimie de l eau et des papiers cartons",
      "bac pro pcepc",
      "bac pro pcepc",

      // bac+2
      "btsa analyse conduite et strategie de l entreprise agricole",
      "btsa acse",
      "btsa agronomie et cultures durables",
      "btsa acd",
      "btsa productions vegetales",
      "btsa pv",
      "btsa genie des equipements agricoles",
      "btsa gdea",
      "btsa qualite alimentation innovation et maitrise sanitaire",
      "btsa qaiams",
      "bts maintenance des systemes",
      "bts ms",
      "bts gestion des transports et logistique associee",
      "bts gtla",

      // bac+3
      "licence professionnelle productions vegetales",
      "lp productions vegetales",
      "lp pv",
      "licence professionnelle agronomie",
      "lp agronomie",
      "lp agro",
      "licence professionnelle qhse",
      "lp qhse",
      "licence professionnelle logistique et pilotage des flux",
      "lp lpf",
      "licence professionnelle management des organisations agricoles et agroalimentaires",
      "lp moaa",

      // compléments
      "certiphyto",
      "formation securite silo",
      "fssa",
      "formation prevention des risques d explosion",
      "atex",
      "caces r482",
      "formation hygiene securite qualite tracabilite des cereales",
      "hsqt cereales",
      "hsqt céréales",
    ],
    deny: ["aquaculture", "pisciculture", "gemeau", "assainissement", "eau", "rivière", "riviere"],
  },

  // =========================================================
  // 4) Agent de Silo
  // jobKey = "silo"
  // =========================================================
  silo: {
    allow: [
      // infra-bac
      "capa metiers de l agriculture",
      "capa ma",
      "capa productions agricoles",
      "capa pa",
      "capa grandes cultures",
      "capa gc",
      "bpa travaux de la production agricole",
      "bpa tpa",
      "bpa ouvrier agricole polyvalent",
      "bpa oap",
      "bpa travaux des cultures",
      "bpa tc",
      "bpa travaux de conduite et entretien des engins agricoles",
      "bpa tceea",

      // bac
      "bac professionnel productions vegetales",
      "bac pro pv",
      "bac professionnel conduite et gestion de l entreprise agricole",
      "bac pro cgea",
      "bac professionnel agroequipement",
      "bac pro ae",
      "bac professionnel maintenance des materiels",
      "bac pro mm ma",
      "bac professionnel logistique",
      "bac pro logistique",
      "bac pro log",
      "bac professionnel procedes de la chimie de l eau et des papiers cartons",
      "bac pro pcepc",

      // bac+2
      "btsa agronomie et cultures durables",
      "btsa acd",
      "btsa analyse conduite et strategie de l entreprise agricole",
      "btsa acse",
      "btsa productions vegetales",
      "btsa pv",
      "btsa genie des equipements agricoles",
      "btsa gdea",
      "bts maintenance des systemes",
      "bts ms",
      "bts gestion des transports et logistique associee",
      "bts gtla",

      // compléments
      "certiphyto",
      "formation securite en silo",
      "formation espaces confines",
      "fsec",
      "atex",
      "caces r482",
      "formation hygiene qualite tracabilite des cereales",
      "hqt cereales",
      "hqt céréales",
    ],
    deny: ["aquaculture", "pisciculture", "gemeau", "assainissement", "eau", "rivière", "riviere"],
  },

  // =========================================================
  // 5) Responsable logistique
  // jobKey = "responsable_logistique"
  // =========================================================
  responsable_logistique: {
    allow: [
      // bac
      "bac professionnel logistique",
      "bac pro logistique",
      "bac pro log",
      "bac professionnel organisation de transport de marchandises",
      "bac pro otm",
      "bac professionnel conduite et gestion de l entreprise agricole",
      "bac pro cgea",
      "bac professionnel maintenance des materiels",
      "bac pro mm",
      "bac professionnel productions vegetales",
      "bac pro pv",

      // bac+2
      "bts gestion des transports et logistique associee",
      "bts gtla",
      "bts logistique",
      "bts log",
      "bts support a l action manageriale",
      "bts sam",
      "btsa analyse conduite et strategie de l entreprise agricole",
      "btsa acse",
      "btsa agronomie et cultures durables",
      "btsa acd",
      "btsa genie des equipements agricoles",
      "btsa gdea",

      // bac+3
      "but management de la logistique et des transports",
      "but mlt",
      "but techniques de commercialisation",
      "but tc",
      "licence professionnelle logistique et pilotage des flux",
      "lp lpf",
      "licence professionnelle management de la supply chain",
      "lp msc",
      "licence professionnelle logistique agroalimentaire",
      "lp la",
      "licence professionnelle management des organisations agricoles et agroalimentaires",
      "lp moaa",

      // bac+4/5
      "master logistique et transport",
      "master lt",
      "master supply chain management",
      "master scm",
      "master management des organisations",
      "master mo",
      "master management des entreprises agricoles et agroalimentaires",
      "master meaa",
      "diplome d ingenieur en logistique",
      "ingenieur log",
      "ingenieur gi",
      "ingenieur agro",
      "genie industriel",
      "génie industriel",

      // compléments
      "caces r489",
      "formation gestion des stocks et tracabilite",
      "gst",
      "formation reglementation transport et securite",
      "rts",
      "formation management d equipe logistique",
      "mel",
      "formation systemes d information logistique",
      "erp",
      "wms",
      "sil erp wms",
    ],
    deny: [
      "chauffeur",
      "taxi",
      "vtc",
      "transport de voyageurs",
      "hotellerie",
      "hôtellerie",
      "restauration",
      "tourisme",
    ],
  },

  // =========================================================
  // 6) Magasinier / Cariste
  // jobKey = "magasinier_cariste"
  // =========================================================
  magasinier_cariste: {
    allow: [
      // infra-bac
      "cap operateur logistique",
      "cap ol",
      "capa metiers de l agriculture",
      "capa ma",
      "capa productions agricoles",
      "capa pa",
      "capa maintenance des materiels",
      "capa mm",
      "bpa ouvrier agricole polyvalent",
      "bpa oap",
      "bpa travaux de la production agricole",
      "bpa tpa",

      // bac
      "bac professionnel logistique",
      "bac pro logistique",
      "bac pro log",
      "bac professionnel conduite et gestion de l entreprise agricole",
      "bac pro cgea",
      "bac professionnel agroequipement",
      "bac pro ae",
      "bac professionnel maintenance des materiels",
      "bac pro mm",
      "bac professionnel organisation de transport de marchandises",
      "bac pro otm",

      // bac+2
      "bts logistique",
      "bts log",
      "bts gestion des transports et logistique associee",
      "bts gtla",
      "btsa genie des equipements agricoles",
      "btsa gdea",
      "btsa analyse conduite et strategie de l entreprise agricole",
      "btsa acse",

      // compléments
      "caces r489",
      "caces r482",
      "formation gestes et postures",
      "gp",
      "formation securite en entrepot",
      "formation securite en entrepôt",
      "fses",
      "formation tracabilite et gestion des stocks",
      "tgs",
    ],
    deny: [
      "vendeur",
      "vente",
      "commerce",
      "commercial",
      "jardinerie",
      "animalerie",
    ],
  },

  // =========================================================
  // 7) Responsable services techniques
  // jobKey = "maintenance"
  // =========================================================
  maintenance: {
    allow: [
      // bac
      "bac professionnel maintenance des systemes de production connectes",
      "bac pro mspc",
      "bac professionnel maintenance des materiels",
      "bac pro mm ma",
      "bac professionnel melec",
      "bac pro melec",
      "bac professionnel pilotage de systemes de production automatisee",
      "bac pro pspa",
      "bac professionnel agroequipement",
      "bac pro ae",

      // bac+2
      "bts maintenance des systemes",
      "bts ms",
      "bts electrotechnique",
      "bts et",
      "bts conception et realisation de systemes automatiques",
      "bts crsa",
      "bts fluides energies domotique",
      "bts fed",
      "bts genie industriel et maintenance",
      "bts gim",
      "btsa genie des equipements agricoles",
      "btsa gdea",

      // bac+3
      "but genie industriel et maintenance",
      "but gim",
      "licence professionnelle maintenance des systemes industriels",
      "lp msi",
      "licence professionnelle metiers de l electricite et de l energie",
      "lp mee",
      "licence professionnelle automatismes et systemes industriels",
      "lp asi",
      "licence professionnelle maintenance en agroequipements",
      "lp mae",

      // bac+4/5
      "master maintenance et fiabilite des systemes industriels",
      "master mfsi",
      "master genie industriel",
      "master gi",
      "master energie et systemes",
      "master es",
      "diplome d ingenieur en genie industriel",
      "ingenieur gi",
      "diplome d ingenieur en maintenance industrielle",
      "ingenieur mi",
      "ingenieur et",
      "ingenieur auto",

      // compléments
      "habilitations electriques",
      "habilitations électriques",
      "b0",
      "h0v",
      "b2v",
      "br",
      "formation management d equipe technique",
      "met",
      "formation securite des installations industrielles",
      "fsii",
      "formation reglementation icpe",
      "icpe",
      "formation gestion de projets techniques",
      "gpt mp",
    ],
    deny: [
      "developpement web",
      "développement web",
      "dev web",
      "informatique",
      "reseaux",
      "réseaux",
      "cyber",
      "data",
      "marketing",
      "commerce",
    ],
  },

  // =========================================================
  // 8) Contrôleur qualité
  // jobKey = "controleur_qualite"
  // =========================================================
  controleur_qualite: {
    allow: [
      // bac
      "bac professionnel bio-industries de transformation",
      "bac pro bit",
      "bac professionnel laboratoire controle qualite",
      "bac pro lcq",
      "bac professionnel procedes de la chimie de l eau et des papiers cartons",
      "bac pro pcepc",
      "bac professionnel stl",
      "bac pro stl",
      "bac professionnel productions vegetales",
      "bac pro pv",
      "bac professionnel conduite et gestion de l entreprise agricole",
      "bac pro cgea",

      // bac+2
      "btsa qualite alimentation innovation et maitrise sanitaire",
      "btsa qaiams",
      "btsa agronomie et cultures durables",
      "btsa acd",
      "btsa productions vegetales",
      "btsa pv",
      "bts bioanalyses et controles",
      "bts bc",
      "bts qualite dans les industries alimentaires et les bio-industries",
      "bts qiabi",
      "bts metiers de la chimie",
      "bts mc",
      "bts analyses de biologie medicale",
      "bts abm",

      // bac+3
      "but genie biologique",
      "but gb sa",
      "but qualite logistique industrielle et organisation",
      "but qlio",
      "licence professionnelle qhse",
      "lp qhse",
      "licence professionnelle controle qualite",
      "lp controle qualite",
      "lp cq",
      "licence professionnelle bio-industries et biotechnologies",
      "lp bib",
      "licence professionnelle productions vegetales",
      "lp pv",

      // bac+4/5
      "master qualite securite environnement",
      "master qse",
      "master qhse",
      "master sciences et technologies des aliments",
      "master sta",
      "master qualite et securite des aliments",
      "master qsa",
      "diplome d ingenieur agroalimentaire",
      "ingenieur agroalim",
      "diplome d ingenieur agronome",
      "ingenieur agro",

      // compléments
      "haccp",
      "iso 9001",
      "iso 22000",
      "ifs",
      "brc",
      "formation tracabilite",
      "tss",
      "formation audit qualite interne",
      "aqi",
      "certiphyto",
    ],
    deny: [
      "eau",
      "gemeau",
      "aquaculture",
      "pisciculture",
      "immobilier",
      "assurance",
      "banque",
      "marketing",
    ],
  },

  // =========================================================
  // 9) Agréeur
  // jobKey = "agreeur"
  // =========================================================
  agreeur: {
    allow: [
      // infra-bac
      "capa metiers de l agriculture",
      "capa ma",
      "capa productions agricoles",
      "capa pa",
      "bpa travaux de la production agricole",
      "bpa tpa",
      "bpa ouvrier agricole polyvalent",
      "bpa oap",

      // bac
      "bac professionnel productions vegetales",
      "bac pro pv",
      "bac professionnel conduite et gestion de l entreprise agricole",
      "bac pro cgea",
      "bac professionnel bio-industries de transformation",
      "bac pro bit",
      "bac professionnel laboratoire controle qualite",
      "bac pro lcq",
      "bac professionnel stl",
      "bac pro stl",

      // bac+2
      "btsa agronomie et cultures durables",
      "btsa acd",
      "btsa productions vegetales",
      "btsa pv",
      "btsa analyse conduite et strategie de l entreprise agricole",
      "btsa acse",
      "btsa qualite alimentation innovation et maitrise sanitaire",
      "btsa qaiams",
      "bts bioanalyses et controles",
      "bts bc",
      "bts qualite dans les industries alimentaires et les bio-industries",
      "bts qiabi",

      // bac+3
      "licence professionnelle productions vegetales",
      "lp pv",
      "licence professionnelle agronomie",
      "lp agro",
      "licence professionnelle qhse",
      "lp qhse",
      "licence professionnelle controle qualite",
      "lp cq",
      "but genie biologique",
      "but gb sa",

      // compléments
      "formation agreage",
      "formation agréage",
      "faco",
      "formation methodes d echantillonnage",
      "formation méthodes d’échantillonnage",
      "fmeg",
      "formation metrologie",
      "fmuaa",
      "formation reglementation commerciale des grains",
      "frcg",
      "certiphyto",
    ],
    deny: ["eau", "gemeau", "aquaculture", "pisciculture", "marketing", "commerce"],
  },

  // =========================================================
  // 10) Conducteur de ligne
  // jobKey = "conducteur_ligne"
  // =========================================================
  conducteur_ligne: {
    allow: [
      // infra-bac
      "cap conducteur d installations de production",
      "cap cip",
      "cap operateur de fabrication",
      "cap of",
      "capa metiers de l agriculture",
      "capa ma",
      "bpa bio-industries de transformation",
      "bpa bit",
      "bpa conducteur de machines de transformation",
      "bpa cmt",

      // bac
      "bac professionnel pilotage de systemes de production automatisee",
      "bac pro pspa",
      "bac professionnel bio-industries de transformation",
      "bac pro bit",
      "bac professionnel procedes de la chimie de l eau et des papiers cartons",
      "bac pro pcepc",
      "bac professionnel maintenance des systemes de production connectes",
      "bac pro mspc",
      "bac professionnel industries de procedes",
      "bac pro ip",

      // bac+2
      "bts pilotage de procedes",
      "bts pp",
      "bts maintenance des systemes",
      "bts ms",
      "bts conception et realisation de systemes automatiques",
      "bts crsa",
      "bts bioanalyses et controles",
      "bts bc",
      "btsa genie des equipements agricoles",
      "btsa gdea",

      // bac+3
      "but genie industriel et maintenance",
      "but gim",
      "but genie biologique",
      "but gb bi",
      "licence professionnelle conduite de lignes automatisees",
      "lp cla",
      "licence professionnelle maintenance des systemes industriels",
      "lp msi",
      "licence professionnelle bio-industries et transformation",
      "lp bit",

      // compléments
      "formation conduite de lignes automatisees",
      "cla",
      "formation maintenance de premier niveau",
      "tpm",
      "haccp",
      "formation qualite et tracabilite",
      "qt",
      "habilitations electriques",
      "heb",
    ],
    deny: ["viticulture", "vigne", "vin", "horticulture", "paysage", "aquaculture", "pisciculture"],
  },

  // =========================================================
  // 11) Technicien culture
  // jobKey = "technicien_culture"
  // =========================================================
  technicien_culture: {
    allow: [
      // bac
      "bac professionnel productions vegetales",
      "bac pro pv",
      "bac professionnel conduite et gestion de l entreprise agricole",
      "bac pro cgea",
      "bac technologique stav",
      "bac techno stav",

      // bac+2
      "btsa agronomie et cultures durables",
      "btsa acd",
      "btsa productions vegetales",
      "btsa pv",
      "btsa analyse conduite et strategie de l entreprise agricole",
      "btsa acse",
      "btsa developpement animation des territoires ruraux",
      "btsa datr",
      "btsa technico commercial",
      "btsa tc bsa",

      // bac+3
      "licence professionnelle productions vegetales",
      "lp pv",
      "licence professionnelle agronomie",
      "lp agro",
      "licence professionnelle conseil en production agricole",
      "lp cpa",
      "licence professionnelle agriculture durable et agroecologie",
      "lp ada",
      "licence professionnelle management des organisations agricoles et agroalimentaires",
      "lp moaa",

      // bac+4/5
      "master agronomie",
      "master agro",
      "master agroecologie",
      "master agroécologie",
      "master ae",
      "master sciences du vegetal",
      "master sciences du végétal",
      "master sv",
      "diplome d ingenieur agronome",
      "ingenieur agro",

      // compléments
      "certiphyto",
      "formation conseil et diagnostic agronomique",
      "cda",
      "formation protection integree des cultures",
      "pic",
      "formation outils d aide a la decision",
      "oad",
      "cartographie",
      "teledetection",
      "télédétection",
      "formation reglementation environnementale et pac",
      "repac",
    ],
    deny: ["elevage", "élevage", "viticulture", "vigne", "vin", "aquaculture", "pisciculture", "marketing"],
  },

  // =========================================================
  // 12) Commercial export
  // jobKey = "commercial_export"
  // =========================================================
  commercial_export: {
    allow: [
      // bac
      "bac general",
      "bac général",
      "bac technologique stmg",
      "bac techno stmg",
      "bac technologique stav",
      "bac techno stav",
      "bac professionnel metiers du commerce et de la vente",
      "bac pro mcv",

      // bac+2
      "bts commerce international",
      "bts ci",
      "bts negociation et digitalisation de la relation client",
      "bts ndrc",
      "bts management commercial operationnel",
      "bts mco",
      "bts conseil et commercialisation de solutions techniques",
      "bts ccst",
      "btsa tc ab",
      "btsa technico commercial",
      "btsa tc bsa",

      // bac+3
      "but techniques de commercialisation",
      "but tc",
      "but gaco",
      "but gestion administrative et commerciale des organisations",
      "licence professionnelle commerce international",
      "lp ci",
      "licence professionnelle metiers du commerce international",
      "lp mci",
      "licence professionnelle commerce et vente en agroalimentaire",
      "lp cva",
      "licence professionnelle management des echanges internationaux",
      "lp mei",
      "licence professionnelle technico-commercial",
      "licence professionnelle technico commercial",
      "lp tc",

      // bac+4/5
      "master commerce international",
      "master ci",
      "master management international",
      "master mi",
      "master marketing international",
      "master mki",
      "master commerce et affaires internationales",
      "master cai",
      "master management des entreprises agricoles et agroalimentaires",
      "master meaa",
      "diplome d ecole de commerce",
      "ecole de commerce",
      "diplome d ingenieur agronome",
      "ingenieur agro",

      // compléments
      "incoterms",
      "douanes",
      "formation logistique internationale",
      "lit",
      "formation reglementation sanitaire et phytosanitaire export",
      "rspe",
      "formation negociation interculturelle",
      "ni",
      "formation langues etrangeres professionnelles",
      "lep",
    ],
    deny: ["tourisme", "hotellerie", "hôtellerie", "restauration", "immobilier", "assurance", "banque"],
  },
};
