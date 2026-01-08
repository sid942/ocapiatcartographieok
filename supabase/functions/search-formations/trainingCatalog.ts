// supabase/functions/search-formations/trainingCatalog.ts

export type CatalogLevel = "3" | "4" | "5" | "6" | "extra";

export type CatalogEntry = {
  level: CatalogLevel;
  labels: string[];     // intitulés "officiels" / longs
  aliases?: string[];   // abréviations / variantes (BTS TC, BTSA GDEA, etc.)
};

// IMPORTANT : les clés doivent matcher tes MetierKey côté front / index.ts
// Ici : technico, chauffeur, responsable_silo
export const TRAINING_CATALOG: Record<string, CatalogEntry[]> = {
  technico: [
    // -----------------------
    // Niveau 5 (Bac+2)
    // -----------------------
    {
      level: "5",
      labels: [
        "BTSA Technico-commercial option biens et services pour l’agriculture",
        "BTSA Technico-commercial option alimentation et boissons",
        "BTSA Technico-commercial option univers jardins et animaux de compagnie",
        "BTS Technico-commercial",
        "BTS Conseil et commercialisation de solutions techniques",
        "BTSA Analyse, conduite et stratégie de l’entreprise agricole",
        "BTSA Agronomie et cultures durables",
        "BTSA Productions animales",
        "BTSA Génie des équipements agricoles",
        "Titre professionnel Négociateur technico-commercial",
        "RNCP Négociateur technico-commercial",
      ],
      aliases: [
        "BTSA TC BSA",
        "BTSA TC AB",
        "BTSA TC UJAC",
        "BTS TC",
        "BTS CCST",
        "BTSA ACSE",
        "BTSA ACD",
        "BTSA PA",
        "BTSA GDEA",
        "TP NTC",
        "RNCP NTC",
        "NEGOCIATEUR TECHNICO COMMERCIAL",
      ],
    },

    // -----------------------
    // Niveau 6 (Bac+3)
    // -----------------------
    {
      level: "6",
      labels: [
        "BUT Techniques de commercialisation",
        "Licence professionnelle Technico-commercial",
        "Licence professionnelle Productions végétales",
        "Licence professionnelle Commerce et vente en agrofourniture",
        "Licence professionnelle Gestion des organisations agricoles et alimentaires",
        "Licence professionnelle Agronomie",
        "Licence professionnelle Métiers du commerce international des produits agricoles et alimentaires",
      ],
      aliases: [
        "BUT TC",
        "DUT TC",
        "EX DUT TC",
        "LP TC",
        "LP PV",
        "LP CVA",
        "LP GOAA",
        "LP AGRO",
        "LP MCI PAA",
        "LP MCI-PAA",
      ],
    },

    // -----------------------
    // Niveau 6 (Bac+4/5) -> on reste en 6 côté filtre UI
    // -----------------------
    {
      level: "6",
      labels: [
        "Certification RNCP Responsable technico-commercial",
        "Master Commerce et vente",
        "Master Management des entreprises agricoles et agroalimentaires",
        "Diplôme d’ingénieur agronome",
      ],
      aliases: [
        "RNCP RTC",
        "RESPONSABLE TECHNICO COMMERCIAL",
        "MASTER CV",
        "MASTER MEAA",
        "INGENIEUR AGRONOME",
        "DIPLOME AGRO",
      ],
    },

    // -----------------------
    // Formations complémentaires (on les garde en extra)
    // -----------------------
    {
      level: "extra",
      labels: [],
      aliases: [],
    },
  ],

  chauffeur: [
    // infra-bac => niveau 3
    {
      level: "3",
      labels: [
        "CAPA Métiers de l’agriculture",
        "CAPA Productions agricoles",
        "CAPA Grandes cultures",
        "CAPA Agriculture des régions chaudes",
        "BPA Travaux de la production agricole",
        "BPA Travaux des cultures",
        "BPA Travaux de conduite et entretien des engins agricoles",
        "BPA Ouvrier agricole en grandes cultures",
        "BPA Ouvrier agricole polyvalent",
      ],
      aliases: [
        "CAPA MA",
        "CAPA PA",
        "CAPA GC",
        "CAPA ARC",
        "BPA TPA",
        "BPA TC",
        "BPA TCEEA",
        "BPA OAGC",
        "BPA OAP",
      ],
    },

    // bac => niveau 4
    {
      level: "4",
      labels: [
        "Bac professionnel Conduite et gestion de l’entreprise agricole",
        "Bac professionnel Agroéquipement",
        "Bac professionnel Productions végétales",
        "Bac professionnel Maintenance des matériels option matériels agricoles",
        "Brevet professionnel Responsable d’entreprise agricole",
        "Brevet professionnel Agroéquipement",
        "Certificat de spécialisation Tractoriste Conducteur d’engins agricoles",
      ],
      aliases: [
        "BAC PRO CGEA",
        "CGEA",
        "BAC PRO AE",
        "AGROEQUIPEMENT",
        "BAC PRO PV",
        "BAC PRO MM MA",
        "BP REA",
        "BP AE",
        "CS TCEA",
        "TRACTORISTE",
      ],
    },

    // bac+2 => niveau 5
    {
      level: "5",
      labels: [
        "BTSA Génie des équipements agricoles",
        "BTSA Agronomie et cultures durables",
        "BTSA Analyse, conduite et stratégie de l’entreprise agricole",
        "BTSA Productions végétales",
        "BTSA Gestion forestière",
      ],
      aliases: ["BTSA GDEA", "BTSA ACD", "BTSA ACSE", "BTSA PV", "BTSA GF"],
    },

    // complémentaires
    {
      level: "extra",
      labels: [
        "Certificat phytosanitaire",
        "Formation à la conduite des engins agricoles",
        "CACES R482",
        "Formation sécurité et maintenance de premier niveau des matériels agricoles",
      ],
      aliases: ["CERTIPHYTO", "CERTIPHYTO OPERATEUR", "FCEA", "FSM1 MA", "CACES R482"],
    },
  ],

  responsable_silo: [
    // infra-bac => niveau 3
    {
      level: "3",
      labels: [
        "CAPA Métiers de l’agriculture",
        "CAPA Productions agricoles",
        "BPA Travaux de la production agricole",
        "BPA Ouvrier agricole polyvalent",
      ],
      aliases: ["CAPA MA", "CAPA PA", "BPA TPA", "BPA OAP"],
    },

    // bac => niveau 4
    {
      level: "4",
      labels: [
        "Bac professionnel Conduite et gestion de l’entreprise agricole",
        "Bac professionnel Productions végétales",
        "Bac professionnel Agroéquipement",
        "Bac professionnel Maintenance des matériels option matériels agricoles",
        "Bac professionnel Procédés de la chimie de l’eau et des papiers-cartons",
      ],
      aliases: ["BAC PRO CGEA", "BAC PRO PV", "BAC PRO AE", "BAC PRO MM MA", "BAC PRO PCEPC", "PCEPC"],
    },

    // bac+2 => niveau 5
    {
      level: "5",
      labels: [
        "BTSA Analyse, conduite et stratégie de l’entreprise agricole",
        "BTSA Agronomie et cultures durables",
        "BTSA Productions végétales",
        "BTSA Génie des équipements agricoles",
        "BTSA Qualité, alimentation, innovation et maîtrise sanitaire",
        "BTS Maintenance des systèmes",
        "BTS Gestion des transports et logistique associée",
      ],
      aliases: ["BTSA ACSE", "BTSA ACD", "BTSA PV", "BTSA GDEA", "BTSA QAIAMS", "BTS MS", "BTS GTLA", "GTLA"],
    },

    // bac+3 => niveau 6
    {
      level: "6",
      labels: [
        "Licence professionnelle Productions végétales",
        "Licence professionnelle Agronomie",
        "Licence professionnelle Qualité hygiène sécurité santé environnement",
        "Licence professionnelle Logistique et pilotage des flux",
        "Licence professionnelle Management des organisations agricoles et agroalimentaires",
      ],
      aliases: ["LP PV", "LP AGRO", "LP QHSE", "LP LPF", "LP MOAA"],
    },

    // complémentaires
    {
      level: "extra",
      labels: [
        "Certificat phytosanitaire",
        "Formation sécurité silo et atmosphères confinées",
        "Formation prévention des risques d’explosion",
        "CACES R482",
        "Formation hygiène sécurité qualité et traçabilité des céréales",
      ],
      aliases: ["CERTIPHYTO", "FSSA", "ATEX", "CACES R482", "HSQT CEREALES", "HSQT CÉRÉALES"],
    },
  ],
};
