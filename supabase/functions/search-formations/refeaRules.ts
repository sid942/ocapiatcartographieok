// supabase/functions/search-formations/refeaRules.ts

type Rules = {
  mustAny: string[];      // Au moins 1 mot doit matcher (le "Carburant")
  mustAll?: string[];     // Tous doivent matcher (optionnel, pour cibler très fin)
  forbidAny: string[];    // Si un match => POUBELLE DIRECTE (le "Filtre")
};

/**
 * REFEA RULES - VERSION "BLINDÉE"
 * Ces règles filtrent la base de données brute du Ministère de l'Agriculture.
 * Objectif : Ne garder que le pertinent pour les 12 métiers cibles.
 */
export const REFEA_RULES: Record<string, Rules> = {
  
  // 1. COMMERCE / VENTE
  "technico": { 
    mustAny: [
      "commerce", "commercial", "vente", "negociation", "technico", 
      "distribution", "agrofourniture", "conseil vente", "business"
    ],
    forbidAny: [
      "paysagiste", "amenagements paysagers", "creation", // Paysage
      "equitation", "hippique", "cheval", // Cheval
      "aquaculture", "poisson", // Poisson
      "foret", "bucheronnage", // Forêt
      "animalerie", "canin", "felin", "fleuriste", // Animalerie/Fleuriste (Commerce de détail)
      "service a la personne"
    ],
  },

  "commercial_export": {
    mustAny: [
      "export", "international", "commerce international", 
      "douane", "incoterms", "anglais", "negociation", "echanges"
    ],
    forbidAny: [
      "equitation", "paysagiste", "foret", "service a la personne", 
      "tourisme", "loisirs"
    ],
  },

  // 2. STOCKAGE / GRAINS (Le point sensible "EAU")
  "silo": { // Agent de silo
    mustAny: [
      "cereales", "grain", "collecte", "stockage", "silo", 
      "magasinage", "agroalimentaire", "qualite", "polyvalent", "agricole"
    ],
    forbidAny: [
      "eau", "assainissement", "hydraulique", "gemeau", "riviere", "milieux aquatiques", // <--- ANTI-EAU
      "equitation", "paysagiste", "foret", 
      "dechets", "environnement", // Souvent lié à l'eau/déchets
      "elevage", "soigneur"
    ],
  },

  "responsable_silo": {
    mustAny: [
      "cereales", "grain", "collecte", "stockage", "qualite", 
      "logistique", "silo", "approvisionnement", "responsable"
    ],
    forbidAny: [
      "eau", "assainissement", "hydraulique", "gemeau", "riviere", "aquaculture", "pisciculture", // <--- ANTI-EAU
      "equitation", "paysagiste", "foret",
      "nature", "protection"
    ],
  },

  // 3. CONDUITE / MACHINISME
  "chauffeur": {
    mustAny: [
      "agroequipement", "machinisme", "machines agricoles", "pilotage", 
      "tracteur", "recolte", "travaux mecanises", "conduite", "chauffeur"
    ],
    forbidAny: [
      "equitation", "equin", "attelage", // Pas de calèche
      "paysagiste", "creation", // Pas de tracteur tondeuse de golf
      "foret", "bucheronnage", "debardage", // Pas de débardeur forestier
      "transport de personnes", "taxi", "bus", "voyageurs", "scolaire", "sanitaire", // Pas de bus/ambulance
      "chantier", "tp", "travaux publics" // On évite le BTP pur si possible
    ],
  },

  // 4. LOGISTIQUE
  "responsable_logistique": {
    mustAny: [
      "logistique", "supply chain", "stocks", "flux", "entrepot", 
      "transport", "methodes logistiques", "exploitation", "organisateur"
    ],
    forbidAny: [
      "equitation", "paysagiste", "foret", 
      "transport de personnes", "voyageurs", "tourisme", "taxi", "ambulancier"
    ],
  },

  "magasinier_cariste": {
    mustAny: [
      "cariste", "caces", "entrepot", "magasinier", 
      "logistique", "stock", "preparation de commandes", "emballage"
    ],
    forbidAny: [
      "equitation", "paysagiste", "foret", 
      "animalerie", "jardinerie", "vente" // On veut de la logistique, pas de la mise en rayon
    ],
  },

  // 5. TECHNIQUE / MAINTENANCE
  "maintenance": { // Responsable services techniques
    mustAny: [
      "maintenance", "genie industriel", "electromecanique", "mecanique", 
      "automatismes", "energie", "electrique", "industrielle", "robotique", "maint"
    ],
    forbidAny: [
      "paysagiste", "espaces verts", "motoculture de plaisance", // Pas de tondeuses
      "equitation", "foret",
      "informatique de gestion", "systemes d'information", "reseaux", "telecom", // Pas d'IT
      "automobile", "carrosserie" // Pas de garage auto
    ],
  },

  // 6. QUALITÉ / LABORATOIRE
  "controleur_qualite": {
    mustAny: [
      "qualite", "haccp", "controle", "laboratoire", "agroalimentaire", 
      "tracabilite", "analyse", "securite des aliments", "bioanalyse"
    ],
    forbidAny: [
      "equitation", "paysagiste", "foret", 
      "eau", "environnement", "pollution", // Pas de traitement des eaux
      "cosmetique", "pharmaceutique" // On essaie de rester dans l'alimentaire
    ],
  },

  "agreeur": {
    mustAny: [
      "fruits", "legumes", "produits frais", "qualite", 
      "reception", "tri", "calibrage", "agreage", "normalisation"
    ],
    forbidAny: [
      "equitation", "paysagiste", "foret", "eau", 
      "fleuriste", "art floral", "horticulture" // On veut du comestible
    ],
  },

  // 7. PRODUCTION / USINE
  "conducteur_ligne": {
    mustAny: [
      "conduite de ligne", "production", "conditionnement", "process", 
      "reglage", "agroalimentaire", "pilote d'installation", "transformation", "operateur"
    ],
    forbidAny: [
      "equitation", "paysagiste", "foret", 
      "horticole", "horticulture", // Pas de plantation de fleurs
      "elevage", "soigneur", "animal", // Pas d'élevage
      "vigne", "viticulture", // Pas de travail dans les vignes (sauf embouteillage, mais risqué)
      "laboratoire", // Distinct de la ligne
      // FILTRE SCOLAIRE IMPORTANT :
      "seconde pro", "4eme", "3eme", "seconde generale", "bac general"
    ],
  },

  // 8. AGRONOMIE / TERRAIN
  "technicien_culture": {
    mustAny: [
      "culture", "agronomie", "maraichage", "grandes cultures", 
      "irrigation", "sol", "fertilisation", "vegetale", "conseil", "production vegetale"
    ],
    forbidAny: [
      "equitation", "cheval", 
      "paysagiste", "creation", // Pas de jardinier
      "foret", "bucheronnage",
      "aquaculture", "pisciculture",
      "elevage", "animal", "bovin", "porcin", "ovin" // On veut du végétal
    ],
  },
};