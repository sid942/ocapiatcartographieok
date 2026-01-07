/**
 * Perplexity Enrichment Module
 *
 * Complète les résultats LBA avec des formations supplémentaires via Perplexity AI
 * uniquement si nécessaire.
 *
 * Règles strictes :
 * - Chaque formation doit avoir 2 URLs de sources différentes et vérifiées
 * - Pas de doublons (intitulé + organisme + ville)
 * - Formations cohérentes avec le métier recherché
 * - Distance réelle (jamais inventée) : géocodage + haversine
 *
 * Correctifs critiques :
 * ✅ Garde-fou A : si raw.ville == villeRef et pas d'adresse -> on prend la géoloc villeRef (distance 0)
 * ✅ Garde-fou B : si géocodage renvoie un point trop loin -> on annule la géoloc (distance 999)
 */

const PPLX_API_URL = "https://api.perplexity.ai/chat/completions";
const PPLX_MODEL = "sonar-pro";

export interface PerplexityFormationInput {
  metierLabel: string;
  villeRef: string;
  lat: number;
  lon: number;
  limit?: number;
}

export interface PerplexityFormationRaw {
  title: string;
  organisme: string;
  ville: string;
  address?: string;

  // URLs (2 sources différentes)
  url1: string;
  url2: string;

  // infos optionnelles
  diploma_hint?: string; // ex: CAP, Bac Pro, BP, BTS, BTSA, BUT, Licence...
  alternance?: "Oui" | "Non" | "Non renseigné";
  modalite?: string; // ex: "Apprentissage", "Alternance", "Formation continue", etc.
  rncp?: string;
}

export interface EnrichedFormation {
  id: string;
  intitule: string;
  organisme: string;
  ville: string;
  lat?: number;
  lon?: number;
  distance_km: number;
  rncp: string;
  modalite: string;
  alternance: string;
  categorie: string;
  site_web: string | null;
  url: string | null;
  niveau: string;
  match: {
    score: number;
    reasons: string[];
  };
}

function cleanText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDomain(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, redirect: "follow" });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Vérifie si une URL répond (beaucoup de sites bloquent HEAD → fallback GET léger)
 */
async function isUrlValid(url: string): Promise<boolean> {
  try {
    // 1) HEAD
    const head = await fetchWithTimeout(url, { method: "HEAD" }, 5000);
    if (head.ok) return true;

    // 2) fallback GET (on ne lit pas le body)
    const get = await fetchWithTimeout(url, { method: "GET" }, 7000);
    return get.ok;
  } catch {
    return false;
  }
}

/**
 * Vérifie que 2 URLs sont valides et sur des domaines différents
 */
async function validateUrls(url1: string, url2: string): Promise<boolean> {
  const d1 = extractDomain(url1);
  const d2 = extractDomain(url2);
  if (!d1 || !d2 || d1 === d2) return false;

  const [ok1, ok2] = await Promise.all([isUrlValid(url1), isUrlValid(url2)]);
  return ok1 && ok2;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((((lat2 as number) * Math.PI) / 180)) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/**
 * Géocodage via api-adresse.data.gouv.fr
 * - Essaye d'abord l'adresse complète si dispo
 * - Sinon fallback sur la ville
 */
async function geocodeFrance(query: string): Promise<{ lat: number; lon: number; score: number } | null> {
  const q = query.trim();
  if (!q || q.length < 3) return null;

  const tries: Array<{ url: string; minScore: number }> = [
    {
      url: `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1&type=housenumber`,
      minScore: 0.45,
    },
    {
      url: `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1&type=street`,
      minScore: 0.45,
    },
    {
      url: `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1&type=municipality`,
      minScore: 0.45,
    },
    {
      url: `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1&type=city`,
      minScore: 0.45,
    },
    {
      url: `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1`,
      minScore: 0.55,
    },
  ];

  for (const t of tries) {
    try {
      const res = await fetchWithTimeout(t.url, { method: "GET" }, 7000);
      if (!res.ok) continue;
      const data = await res.json().catch(() => null);
      const feat = data?.features?.[0];
      const coords = feat?.geometry?.coordinates;
      const props = feat?.properties;
      if (!Array.isArray(coords) || coords.length < 2) continue;

      const [lon, lat] = coords;
      const score = typeof props?.score === "number" ? props.score : 0;
      if (score < t.minScore) continue;

      if (typeof lat === "number" && typeof lon === "number") {
        return { lat, lon, score };
      }
    } catch {
      // continue
    }
  }

  return null;
}

function inferNiveauFromHint(hint: string | undefined): string {
  const h = cleanText(hint ?? "");
  if (!h) return "N/A";

  if (h.includes("cap") || h.includes("bep")) return "3";
  if (h.includes("bac pro") || (h.includes("bac") && !h.includes("bac+"))) return "4";
  if (h.includes("bp") || h.includes("brevet professionnel")) return "4";
  if (h.includes("bts") || h.includes("btsa") || h.includes("dut") || h.includes("bac 2") || h.includes("bac+2"))
    return "5";
  if (h.includes("but") || h.includes("licence") || h.includes("bachelor") || h.includes("bac 3") || h.includes("bac+3"))
    return "6";

  return "N/A";
}

function normalizeAlternance(v: any): "Oui" | "Non" | "Non renseigné" {
  if (v === "Oui") return "Oui";
  if (v === "Non") return "Non";
  return "Non renseigné";
}

/**
 * Appelle Perplexity AI pour obtenir des formations supplémentaires
 */
export async function fetchPerplexityFormations(input: PerplexityFormationInput): Promise<EnrichedFormation[]> {
  const { metierLabel, villeRef, lat, lon, limit = 5 } = input;

  const apiKey = Deno.env.get("PPLX_API_KEY");
  if (!apiKey) {
    console.warn("PPLX_API_KEY not configured, skipping Perplexity enrichment");
    return [];
  }

  const systemPrompt = `Tu es un expert en formations professionnelles françaises.
Tu dois trouver des formations RÉELLES, VÉRIFIABLES et pertinentes pour le métier "${metierLabel}" près de "${villeRef}".

RÈGLES ABSOLUES :
- Retourne UNIQUEMENT des formations cohérentes avec le métier "${metierLabel}" (pas de hors-sujet)
- Chaque formation DOIT avoir 2 URLs de sources différentes (domaines différents) et fiables
- Préfère des organismes officiels (CFA, CFPPA, lycées agricoles, EPLEFPA, MFR, GRETA, universités, IUT)
- Si possible, indique l'adresse complète
- Tu dois répondre UNIQUEMENT par un JSON valide (aucun texte avant/après)`;

  const userPrompt = `Trouve ${limit} formations proches de "${villeRef}" pour devenir "${metierLabel}".

Répond UNIQUEMENT en JSON avec exactement cette structure :
{
  "formations": [
    {
      "title": "Nom exact de la formation",
      "organisme": "Nom exact de l'organisme/école",
      "ville": "Ville (ex: Montpellier)",
      "address": "Adresse complète si disponible (optionnel)",
      "url1": "Source 1 (site officiel ou page organisme)",
      "url2": "Source 2 (autre site fiable: Onisep, Carif-Oref, France Travail, site public, etc.)",
      "diploma_hint": "Ex: CAP, Bac Pro, BP, BTS, BTSA, BUT, Licence (optionnel)",
      "alternance": "Oui|Non|Non renseigné (optionnel)",
      "modalite": "Texte court: apprentissage / alternance / initial / continue (optionnel)",
      "rncp": "Code RNCP si trouvé (optionnel)"
    }
  ]
}

IMPORTANT :
- 2 URLs doivent être sur des DOMAINES DIFFÉRENTS
- Les formations doivent être cohérentes avec "${metierLabel}"`;

  try {
    const response = await fetch(PPLX_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: PPLX_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 2200,
      }),
    });

    if (!response.ok) {
      console.error("Perplexity API error:", response.status, await response.text());
      return [];
    }

    const data = await response.json().catch(() => null);
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      console.warn("No content from Perplexity");
      return [];
    }

    // Parser JSON (gérer ```json)
    let jsonContent = content.trim();
    if (jsonContent.startsWith("```json")) {
      jsonContent = jsonContent.replace(/^```json\s*/i, "").replace(/```\s*$/, "");
    } else if (jsonContent.startsWith("```")) {
      jsonContent = jsonContent.replace(/^```\s*/, "").replace(/```\s*$/, "");
    }

    const parsed = JSON.parse(jsonContent);
    const rawFormations: PerplexityFormationRaw[] = parsed?.formations || [];

    if (!Array.isArray(rawFormations) || rawFormations.length === 0) {
      console.warn("No formations in Perplexity response");
      return [];
    }

    const villeRefClean = cleanText(villeRef);

    const enriched: EnrichedFormation[] = [];

    for (const raw of rawFormations) {
      // champs requis
      if (!raw.title || !raw.organisme || !raw.ville || !raw.url1 || !raw.url2) continue;

      // URLs validées + domaines différents
      const urlsValid = await validateUrls(raw.url1, raw.url2);
      if (!urlsValid) continue;

      const rawVilleClean = cleanText(raw.ville);
      const hasAddress = !!(raw.address && raw.address.trim().length >= 6);

      // Géocodage : d'abord adresse, sinon (organisme + ville), sinon ville
      const q1 = hasAddress ? `${raw.address} ${raw.ville}` : "";
      const q2 = `${raw.organisme} ${raw.ville}`;
      const q3 = raw.ville;

      const geo =
        (q1 ? await geocodeFrance(q1) : null) ||
        (q2 ? await geocodeFrance(q2) : null) ||
        (q3 ? await geocodeFrance(q3) : null);

      let formationLat: number | undefined;
      let formationLon: number | undefined;
      let distance_km = 999;

      // =========================
      // ✅ GARDE-FOU A
      // Si la ville annoncée == villeRef ET pas d'adresse,
      // on évite de géocoder un texte flou -> on place sur la villeRef (distance 0)
      // =========================
      if (!hasAddress && rawVilleClean && rawVilleClean === villeRefClean) {
        formationLat = lat;
        formationLon = lon;
        distance_km = 0;
      } else if (geo?.lat != null && geo?.lon != null) {
        // distance réelle calculée
        const d = round1(haversineKm(lat, lon, geo.lat, geo.lon));

        // =========================
        // ✅ GARDE-FOU B
        // Si le géocodage part en vrille (point trop loin), on annule la géoloc
        // =========================
        const MAX_REASONABLE_KM = 200;

        if (d <= MAX_REASONABLE_KM) {
          formationLat = geo.lat;
          formationLon = geo.lon;
          distance_km = d;
        } else {
          // si malgré tout raw.ville == villeRef -> on retombe sur villeRef
          if (!hasAddress && rawVilleClean && rawVilleClean === villeRefClean) {
            formationLat = lat;
            formationLon = lon;
            distance_km = 0;
          } else {
            formationLat = undefined;
            formationLon = undefined;
            distance_km = 999;
          }
        }
      }

      const niveau = inferNiveauFromHint(raw.diploma_hint);

      const alternance = normalizeAlternance(raw.alternance);
      const modalite = (raw.modalite ?? "").toString().trim() || "Non renseigné";
      const rncp = (raw.rncp ?? "").toString().trim() || "Non renseigné";

      const reasons = [
        "Formation trouvée sur des sources vérifiées",
        "Correspond à votre métier recherché",
        distance_km === 0 ? "Localisation estimée (ville)" : distance_km !== 999 ? "Proche de votre ville" : "Localisation non confirmée",
      ].slice(0, 3);

      enriched.push({
        id: `pplx_${crypto.randomUUID()}`,
        intitule: raw.title,
        organisme: raw.organisme,
        ville: raw.ville,
        ...(formationLat != null && formationLon != null ? { lat: formationLat, lon: formationLon } : {}),
        distance_km,
        rncp,
        modalite,
        alternance,
        categorie: "Diplôme / Titre",
        site_web: raw.url1,
        url: raw.url1,
        niveau,
        match: {
          score: 25, // Score modéré pour rester derrière LBA si LBA est bon
          reasons,
        },
      });
    }

    console.log(`Perplexity enrichment: ${enriched.length} formations validées`);
    return enriched;
  } catch (error) {
    console.error("Perplexity enrichment error:", error);
    return [];
  }
}

/**
 * Détermine si l'enrichissement Perplexity est nécessaire
 */
export function shouldEnrichWithPerplexity(
  currentResults: any[],
  config: { min_results?: number; max_distance?: number }
): boolean {
  const minResults = config.min_results ?? 10;
  const maxDistance = config.max_distance ?? 150;

  if (currentResults.length < minResults) return true;

  const avgDistance =
    currentResults.reduce((sum, r) => {
      const dist = typeof r?.distance_km === "number" ? r.distance_km : 999;
      return sum + dist;
    }, 0) / currentResults.length;

  return avgDistance > maxDistance;
}

/**
 * Clé de déduplication
 */
export function makeDedupKey(intitule: string, organisme: string, ville: string): string {
  const clean = (s: string) =>
    (s ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "")
      .trim();

  return `${clean(intitule)}|${clean(organisme)}|${clean(ville)}`;
}

/**
 * Fusion sans doublons (LBA d'abord)
 */
export function mergeFormationsWithoutDuplicates(lbaFormations: any[], perplexityFormations: EnrichedFormation[]): any[] {
  const seen = new Set<string>();
  const merged: any[] = [];

  for (const f of lbaFormations) {
    const key = makeDedupKey(f?.intitule || "", f?.organisme || "", f?.ville || "");
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(f);
    }
  }

  for (const f of perplexityFormations) {
    const key = makeDedupKey(f?.intitule || "", f?.organisme || "", f?.ville || "");
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(f);
    }
  }

  return merged;
}
