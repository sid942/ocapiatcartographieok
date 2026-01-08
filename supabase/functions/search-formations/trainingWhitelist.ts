// supabase/functions/search-formations/trainingWhitelist.ts

export type TrainingWhitelist = Record<
  string, // jobKey ex: "technico"
  {
    // on accepte si le texte contient AU MOINS un de ces patterns
    allow: string[];
    // on refuse si le texte contient un de ces patterns
    deny?: string[];
  }
>;

/**
 * IMPORTANT :
 * - Mets ici TOUT ton Excel.
 * - allow = intitulés / sigles / variantes qui doivent matcher dans LBA / Perplexity
 * - deny = mots qui doivent sortir même si allow match (ex: "marketing", "immobilier"…)
 */
export const TRAINING_WHITELIST: TrainingWhitelist = {
  technico: {
    allow: [
      // Bac+2
      "btsa technico commercial",
      "btsa technico-commercial",
      "btsa tc bsa",
      "btsa tc ab",
      "btsa tc ujac",
      "bts technico commercial",
      "bts tc",
      "bts conseil et commercialisation de solutions techniques",
      "bts ccst",
      "btsa acse",
      "btsa analyse conduite et strategie de l entreprise agricole",
      "btsa acd",
      "btsa agronomie et cultures durables",
      "btsa productions animales",
      "btsa pa",
      "btsa gdea",
      "btsa genie des equipements agricoles",
      "titre professionnel negociateur technico commercial",
      "tp negociateur technico commercial",
      "tp ntc",
      "rncp ntc",

      // Bac+3
      "but techniques de commercialisation",
      "but tc",
      "dut techniques de commercialisation",
      "dut tc",
      "licence professionnelle technico commercial",
      "lp technico commercial",
      "lp tc",
      "lp productions vegetales",
      "lp pv",
      "lp commerce et vente en agrofourniture",
      "lp cva",
      "lp gestion des organisations agricoles et alimentaires",
      "lp goaa",
      "lp agronomie",
      "lp agro",
      "lp metiers du commerce international des produits agricoles et alimentaires",
      "lp mci",

      // Bac+4/5
      "rncp responsable technico commercial",
      "rncp rtc",
      "master commerce et vente",
      "master cv",
      "master management des entreprises agricoles et agroalimentaires",
      "master meaa",
      "ingenieur agronome",
      "diplome agro",
    ],
    deny: [
      // anti commerce pur / digital
      "marketing",
      "digital",
      "e-commerce",
      "immobilier",
      "assurance",
      "banque",
      "community manager",
      "ux",
      "ui",
      "growth",
      "business developer",
      "developpement commercial",
    ],
  },

  chauffeur: {
    allow: [
      "capa metiers de l agriculture",
      "capa ma",
      "capa productions agricoles",
      "capa pa",
      "capa grandes cultures",
      "capa gc",
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

      "bac pro cgea",
      "bac professionnel conduite et gestion de l entreprise agricole",
      "bac pro agroequipement",
      "bac pro ae",
      "bac pro productions vegetales",
      "bac pro pv",
      "bac pro maintenance des materiels",
      "bac pro mm ma",
      "bp rea",
      "brevet professionnel responsable d entreprise agricole",
      "bp agroequipement",
      "bp ae",
      "cs tractoriste",
      "cs tcea",

      "btsa gdea",
      "btsa genie des equipements agricoles",
      "btsa acd",
      "btsa agronomie et cultures durables",
      "btsa acse",
      "btsa productions vegetales",
      "btsa pv",
      "btsa gestion forestiere",
      "btsa gf",

      "certiphyto",
      "caces r482",
      "formation conduite engins agricoles",
      "fsm1",
    ],
    deny: [
      "taxi",
      "vtc",
      "transport de voyageurs",
      "bus",
      "autocar",
      "btp",
      "travaux publics",
    ],
  },

  responsable_silo: {
    allow: [
      "capa metiers de l agriculture",
      "capa ma",
      "capa productions agricoles",
      "capa pa",
      "bpa travaux de la production agricole",
      "bpa tpa",
      "bpa ouvrier agricole polyvalent",
      "bpa oap",

      "bac pro cgea",
      "bac pro productions vegetales",
      "bac pro pv",
      "bac pro agroequipement",
      "bac pro ae",
      "bac pro maintenance des materiels",
      "bac pro mm ma",
      "bac pro pcepc",

      "btsa acse",
      "btsa acd",
      "btsa pv",
      "btsa gdea",
      "btsa qaiams",
      "bts maintenance des systemes",
      "bts ms",
      "bts gtla",

      "lp productions vegetales",
      "lp pv",
      "lp agronomie",
      "lp agro",
      "lp qhse",
      "lp logistique et pilotage des flux",
      "lp lpf",
      "lp management des organisations agricoles et agroalimentaires",
      "lp moaa",

      "certiphyto",
      "atex",
      "caces r482",
      "formation securite silo",
      "formation hygiene qualite tracabilite cereales",
    ],
    deny: ["eau", "gemeau", "aquaculture", "pisciculture"],
  },

  silo: {
    allow: [
      // très proche responsable_silo (agent)
      "capa metiers de l agriculture",
      "capa ma",
      "bpa tceea",
      "bac pro pv",
      "bac pro cgea",
      "bac pro agroequipement",
      "bac pro ae",
      "bac pro logistique",
      "bac pro log",
      "bac pro pcepc",

      "btsa acd",
      "btsa acse",
      "btsa pv",
      "btsa gdea",
      "bts ms",
      "bts maintenance des systemes",
      "bts gtla",

      "certiphyto",
      "atex",
      "caces r482",
      "formation securite silo",
      "formation espaces confines",
      "formation hygiene qualite tracabilite cereales",
    ],
    deny: ["eau", "gemeau", "aquaculture", "pisciculture"],
  },

  // TODO: complète les autres métiers sur le même modèle :
  // responsable_logistique, magasinier_cariste, maintenance, controleur_qualite, agreeur, conducteur_ligne, technicien_culture, commercial_export
};
