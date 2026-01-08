// supabase/functions/search-formations/refeaSearch.ts
import { loadRefEA, refeaCityOf, refeaTitleOf, toNumberOrNull, haversineKm, type RefEARow } from "./refea.ts";
import { REFEA_RULES } from "./refeaRules.ts";

function norm(s: any) {
  return (s ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['']/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchRules(title: string, jobLabel: string): boolean {
  const rules = REFEA_RULES[jobLabel];
  if (!rules) return true; // si pas de règle, on ne bloque pas

  const t = norm(title);

  // forbid
  if (rules.forbidAny.some((w) => t.includes(norm(w)))) return false;

  // mustAll
  if (rules.mustAll && rules.mustAll.some((w) => !t.includes(norm(w)))) return false;

  // mustAny
  if (rules.mustAny.length > 0 && !rules.mustAny.some((w) => t.includes(norm(w)))) return false;

  return true;
}

export function searchRefEA(params: {
  jobLabel: string;
  ville: string;
  userLat: number;
  userLon: number;
  radiusKm: number;
  limit?: number;
}) {
  const { jobLabel, ville, userLat, userLon, radiusKm, limit = 30 } = params;

  const cityWanted = norm(ville);

  const rows = loadRefEA();

  const filtered = rows
    .filter((r) => matchRules(r.formacertif_libusage, jobLabel))
    .map((r) => {
      const lat = toNumberOrNull(r.latitude);
      const lon = toNumberOrNull(r.longitude);
      if (lat === null || lon === null) return null;

      const dist = haversineKm(userLat, userLon, lat, lon);

      return {
        raw: r,
        dist,
        city: refeaCityOf(r),
        title: refeaTitleOf(r),
      };
    })
    .filter(Boolean) as Array<{ raw: RefEARow; dist: number; city: string; title: string }>;

  // Filtre ville "soft" : on garde d'abord ceux de la même ville, sinon on élargit
  const inSameCity = filtered.filter((x) => x.city === cityWanted);
  const pool = inSameCity.length > 0 ? inSameCity : filtered;

  // Rayon + tri distance
  return pool
    .filter((x) => x.dist <= radiusKm)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, limit)
    .map((x) => {
      const r = x.raw;
      return {
        id: `refea_${r.code_formation_maaf || r.code_formation_en || crypto.randomUUID()}`,
        intitule: r.formacertif_libusage,
        organisme: r.uai_libcom || r.uai_libadmin || r.etablissement_niveau_1 || "Établissement",
        ville: r.adresse_ville || "",
        lat: Number(r.latitude),
        lon: Number(r.longitude),
        distance_km: Math.round(x.dist * 10) / 10,
        rncp: "Non renseigné",
        modalite: "Non renseigné",
        alternance: "Non renseigné",
        categorie: "Diplôme / Titre",
        site_web: r.site_internet || null,
        url: r.site_internet || null,
        niveau: "N/A",
        match: {
          score: 80, // RefEA = source de vérité => score haut
          reasons: ["Formation issue de la source officielle (RefEA)"],
        },
        _source: "refea",
      };
    });
}
