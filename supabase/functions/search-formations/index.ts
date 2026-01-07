// ==================================================================================
// THEME GUARD (VF) - Anti hors-thème universel
// ==================================================================================

type ThemeDomain =
  | "security"
  | "construction"
  | "it"
  | "finance"
  | "hospitality"
  | "health"
  | "law"
  | "beauty_fashion"
  | "tourism_transport_people"
  | "forestry"
  | "animal_equestrian"
  | "driving_road_heavy" // routier pur (non agri)
  | "education_childcare"
  | "sport_coaching";

const THEME_BANNED: Record<ThemeDomain, string[]> = {
  security: [
    "securite", "sûreté", "surete", "agent de securite", "ssi", "incendie", "vigile", "surveillance", "cynophile",
  ],
  construction: [
    "btp","batiment","chantier","macon","maconnerie","carrelage","plomberie","electricien","peintre",
    "menuiserie","charpente","couvreur","grutier","grue","engins de chantier","terrassement","vrd",
  ],
  it: [
    "informatique","developpeur","développeur","programmation","code","web","wordpress","reseau","réseau",
    "cybersecurite","cybersécurité","systeme","système","data","cloud","devops","sql",
  ],
  finance: [
    "banque","assurance","immobilier","credit","crédit","finance","patrimoine","courtier","comptable","audit financier",
  ],
  hospitality: [
    "cuisine","restauration","hotellerie","hôtellerie","cuisinier","serveur","barman","chef de rang","barista",
  ],
  health: [
    "infirmier","infirmiere","infirmière","aide soignant","aide-soignant","medical","médical","pharmacie",
    "ambulancier","sage femme","sage-femme",
  ],
  law: ["avocat","notaire","juridique","droit","huissier"],
  beauty_fashion: [
    "esthetique","esthétique","coiffure","cosmetique","cosmétique","mode","textile","spa","maquillage",
  ],
  tourism_transport_people: [
    "tourisme","voyageurs","transport de personnes","chauffeur de bus","bus","autocar","taxis","taxi","vtc",
    "conducteur de voyageurs","transport urbain",
  ],
  forestry: [
    "forestier","forêt","foret","sylviculture","bucheronnage","bûcheronnage","debardage","débardage",
    "elagage","élagage","abattage","tronconneuse","tronçonneuse","grume","grumes","grumier",
  ],
  animal_equestrian: [
    "equestre","équestre","equitation","équitation","cheval","chevaux","attelage","attelages","palefrenier",
  ],
  driving_road_heavy: [
    "routier","transport routier","longue distance","messagerie","livraison longue distance","fimo","fco",
    "conducteur routier","poids lourd","spl","super lourd",
  ],
  education_childcare: ["petite enfance","creche","crèche","atsem","animateur","animation","educateur","éducateur"],
  sport_coaching: ["coach sportif","sport","musculation","fitness","bpjeps","entrainement","entraînement"],
};

// domaines bannis "par défaut" pour TOUS les métiers
const DEFAULT_BANNED_DOMAINS: ThemeDomain[] = [
  "security","construction","it","finance","hospitality","health","law","beauty_fashion","tourism_transport_people",
  "education_childcare","sport_coaching",
];

// domaines bannis supplémentaires selon métier
const JOB_EXTRA_BANNED_DOMAINS: Record<string, ThemeDomain[]> = {
  chauffeur: ["forestry","animal_equestrian","driving_road_heavy"], // chauffeur agricole ≠ forestier ≠ routier pur
  silo: ["forestry","animal_equestrian"],
  responsable_silo: ["forestry","animal_equestrian"],
  magasinier_cariste: ["tourism_transport_people","driving_road_heavy"],
  responsable_logistique: ["tourism_transport_people","driving_road_heavy"],
  controleur_qualite: [],
  agreeur: [],
  conducteur_ligne: [],
  maintenance: [],
  technico: [],
  technicien_culture: ["forestry","animal_equestrian"],
};

function getThemeBannedList(jobKey: string): string[] {
  const domains = new Set<ThemeDomain>(DEFAULT_BANNED_DOMAINS);
  (JOB_EXTRA_BANNED_DOMAINS[jobKey] ?? []).forEach((d) => domains.add(d));

  const terms: string[] = [];
  for (const d of domains) terms.push(...THEME_BANNED[d]);
  return terms;
}
