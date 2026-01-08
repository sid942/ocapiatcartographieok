import { NominatimResult } from "../types";

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";

// Nominatim n'aime pas les rafales. On met un petit garde-fou.
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Types OSM qu'on accepte pour une "ville" au sens UX.
// (On reste assez large mais on exclut pays/régions/continents/points random)
const ALLOWED_TYPES = new Set([
  "city",
  "town",
  "village",
  "municipality",
  "administrative",
  "hamlet",
  "suburb",
  "locality",
]);

function safeLower(s: any) {
  return (s ?? "").toString().toLowerCase();
}

// Retourne le nom principal (avant la virgule), ex "Montélimar"
function primaryName(displayName: string) {
  return (displayName ?? "").split(",")[0].trim();
}

function isGoodResult(r: any): r is NominatimResult {
  if (!r) return false;

  const cls = safeLower(r.class);
  const type = safeLower(r.type);

  // On veut surtout des lieux (pas "amenity", pas "shop", etc.)
  // Nominatim utilise souvent class="place" pour city/town/village
  const isPlaceLike = cls === "place" || cls === "boundary";

  if (!isPlaceLike) return false;
  if (!ALLOWED_TYPES.has(type)) return false;

  // doit avoir un display_name exploitable
  if (!r.display_name || typeof r.display_name !== "string") return false;

  // doit avoir lat/lon
  if (!r.lat || !r.lon) return false;

  return true;
}

// Score simple pour trier : city > town > village > autres
function rankType(type: string) {
  const t = safeLower(type);
  if (t === "city") return 0;
  if (t === "town") return 1;
  if (t === "municipality") return 2;
  if (t === "village") return 3;
  if (t === "suburb") return 4;
  if (t === "hamlet") return 5;
  if (t === "locality") return 6;
  if (t === "administrative") return 7;
  return 99;
}

// Dédupe sur le nom principal pour éviter 10 fois "Paris ..."
function dedupByPrimaryName(items: NominatimResult[]) {
  const seen = new Set<string>();
  const out: NominatimResult[] = [];

  for (const r of items) {
    const key = safeLower(primaryName(r.display_name));
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }

  return out;
}

// Fetch helper
async function nominatimSearch(params: Record<string, string>): Promise<any[]> {
  const url =
    `${NOMINATIM_BASE_URL}/search?` +
    new URLSearchParams(params).toString();

  const response = await fetch(url, {
    headers: {
      // Nominatim recommande un UA explicite. Idéalement un email/URL aussi.
      "User-Agent": "FormationsNegociantsAgricoles/1.0 (contact: support@ocapiat.local)",
      "Accept-Language": "fr",
    },
  });

  if (!response.ok) throw new Error("Nominatim search failed");
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Suggestions de villes :
 * - France uniquement
 * - Résultats limités mais qualitatifs
 * - Filtrage strict "ville-like"
 */
export async function searchCities(query: string): Promise<NominatimResult[]> {
  const q = (query ?? "").trim();
  if (q.length < 2) return [];

  try {
    // mini-delay (évite d'enchaîner trop vite)
    await delay(150);

    const raw = await nominatimSearch({
      q,
      format: "json",
      countrycodes: "fr",
      limit: "10", // on récupère un peu +, on filtre ensuite
      addressdetails: "1",
      // Astuce : ce param aide parfois Nominatim à comprendre que tu veux un lieu
      // (pas garanti, mais utile)
      "accept-language": "fr",
    });

    const filtered = raw.filter(isGoodResult) as NominatimResult[];

    // Tri : meilleurs types d'abord, et si importance existe, on la favorise
    filtered.sort((a: any, b: any) => {
      const rt = rankType(a.type) - rankType(b.type);
      if (rt !== 0) return rt;

      const ia = typeof a.importance === "number" ? a.importance : 0;
      const ib = typeof b.importance === "number" ? b.importance : 0;
      if (ib !== ia) return ib - ia;

      // fallback : display_name stable
      return safeLower(a.display_name).localeCompare(safeLower(b.display_name));
    });

    // Dédup par nom principal
    const deduped = dedupByPrimaryName(filtered);

    // On coupe à 5 suggestions max (UX)
    return deduped.slice(0, 5);
  } catch (error) {
    console.error("Error searching cities:", error);
    return [];
  }
}

/**
 * Géocodage :
 * - On cherche en France
 * - On filtre pareil que searchCities
 * - On prend le meilleur
 */
export async function geocodeCity(
  cityName: string
): Promise<{ lat: number; lon: number } | null> {
  const q = (cityName ?? "").trim();
  if (!q) return null;

  try {
    // Nominatim recommande 1 req/sec. Ici on garde une marge.
    await delay(700);

    const raw = await nominatimSearch({
      q: `${q}, France`,
      format: "json",
      countrycodes: "fr",
      limit: "5",
      addressdetails: "1",
      "accept-language": "fr",
    });

    const filtered = raw.filter(isGoodResult) as NominatimResult[];
    if (filtered.length === 0) return null;

    filtered.sort((a: any, b: any) => {
      const rt = rankType(a.type) - rankType(b.type);
      if (rt !== 0) return rt;

      const ia = typeof a.importance === "number" ? a.importance : 0;
      const ib = typeof b.importance === "number" ? b.importance : 0;
      return ib - ia;
    });

    const best = filtered[0];
    return {
      lat: parseFloat((best as any).lat),
      lon: parseFloat((best as any).lon),
    };
  } catch (error) {
    console.error(`Error geocoding ${cityName}:`, error);
    return null;
  }
}

export { geocodeCity as geocodeCityToLatLon };
