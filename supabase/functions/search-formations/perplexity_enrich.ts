/**
 * Perplexity Enrichment Module (STRICT)
 *
 * But : compléter LBA avec Perplexity, SANS rien inventer.
 *
 * Règles strictes :
 * - 2 URLs de domaines différents + vérifiées (HEAD puis GET fallback)
 * - Pas de doublons (intitulé + organisme + ville) géré ailleurs via merge
 * - Distance RÉELLE uniquement (géocodage + haversine)
 * - Si géocodage incertain -> on REJETTE (pas de distance 0 ni 999)
 * - Alternance/modalité/RNCP : "Non renseigné" (pas d'hallucination)
 *
 * Correctif critique :
 * ✅ Garde-fou B : si géocodage renvoie un point trop loin -> rejet
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

  url1: string;
  url2: string;

  diploma_hint?: string;
  alternance?: "Oui" | "Non" | "Non renseigné";
  modalite?: string;
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

// ----------------------------------------------------------------------------------
// Utils texte
// ----------------------------------------------------------------------------------

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

const STOPWORDS_FR = new Set([
  "de",
  "des",
  "du",
  "la",
  "le",
  "les",
  "un",
  "une",
  "et",
  "en",
  "pour",
  "au",
  "aux",
  "d",
  "l",
  "a",
  "à",
  "sur",
  "avec",
  "dans",
  "ou",
]);

function metierTokens(metierLabel: string): string[] {
  const t = cleanText(metierLabel);
  const parts = t.split(" ").filter(Boolean);
  // tokens significatifs seulement
  return parts.filter((p) => p.length >= 4 && !STOPWORDS_FR.has(p));
}

function isCoherentWithMetier(raw: PerplexityFormationRaw, metierLabel: string): boolean {
  const tokens = metierTokens(metierLabel);
  // si métier trop court, on ne bloque pas
  if (tokens.length === 0) return true;

  const hay = cleanText(`${raw.title} ${raw.organisme} ${raw.modalite ?? ""}`);
  return tokens.some((tk) => hay.includes(tk));
}

// ----------------------------------------------------------------------------------
// URL validation
// ----------------------------------------------------------------------------------

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
    return await fetch(url, { ...init, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Vérifie si une URL répond (beaucoup de sites bloquent HEAD => fallback GET)
 */
async function isUrlValid(url: string): Promise<boolean> {
  try {
    const head = await fetchWithTimeout(url, { method: "HEAD" }, 5000);
    if (head.ok) return true;

    const get = await fetchWithTimeout(url, { method: "GET" }, 7000);
    return get.ok;
  } catch {
    return false;
  }
}

async function validateUrls(url1: string, url2: string): Promise<boolean> {
  const d1 = extractDomain(url1);
  const d2 = extractDomain(url2);
  if (!d1 || !d2 || d1 === d2) return false;

  const [ok1, ok2] = await Promise.all([isUrlValid(url1), isUrlValid(url2)]);
  return ok1 && ok2;
}

// ----------------------------------------------------------------------------------
// Geo + distance
// ----------------------------------------------------------------------------------

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/**
 * Géocodage via api-adresse.data.gouv.fr
 * On tente adresse puis (organisme+ville) puis ville.
 * IMPORTANT : si ça ne match pas bien => null.
 */
async function geocodeFrance(query: string): Promise<{ lat: number; lon: number; score: number; label?: string } | null> {
  const q = query.trim();
  if (!q || q.length < 3) return null;

  const tries: Array<{ url: string; minScore: number }> = [
    {
      url: `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1&type=housenumber`,
      minScore: 0.50,
    },
    {
      url: `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1&type=street`,
      minScore: 0.50,
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
      minScore: 0.60,
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
        return { lat, lon, score, label: props?.label };
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
  if (h.includes("bp") || h.includes("brevet professionnel")) return "4";
  if (h.includes("bac pro") || (h.includes("bac") && !h.includes("bac+"))) return "4";
  if (h.includes("bts") || h.includes("btsa") || h.includes("dut") || h.includes("bac 2") || h.includes("bac+2")) return "5";
  if (h.includes("but") || h.includes("licence") || h.includes("bachelor") || h.includes("bac 3") || h.includes("bac+3")) return "6";

  return "N/A";
}

// ----------------------------------------------------------------------------------
// Perplexity call
// ----------------------------------------------------------------------------------

export async function fetchPerplexityFormations(input: PerplexityFormationInput): Promise<EnrichedFormation[]> {
  const { metierLabel, villeRef, lat, lon, limit = 5 } = input;

  const apiKey = Deno.env.get("PPLX_API_KEY");
  if (!apiKey) {
    console.warn("PPLX_API_KEY not configured, skipping Perplexity enrichment");
    return [];
  }

  // Prompts : on force JSON strict + priorité villeRef avant élargissement
  const systemPrompt = `Tu es un expert des formations professionnelles en France.
Tu dois proposer des formations RÉELLES, VÉRIFIABLES et COHÉRENTES avec le métier "${metierLabel}".

RÈGLES ABSOLUES :
- Réponds UNIQUEMENT avec un JSON valide (aucun texte)
- Chaque formation DOIT avoir 2 URLs de sources différentes (domaines différents)
- Priorité : formations dans "${villeRef}" puis département proche, puis région (si besoin)
- Organismes officiels (CFA, CFPPA, EPLEFPA, MFR, GRETA, lycées pros, etc.)
- Évite les contenus génériques / articles conseils sans formation réelle`;

  const userPrompt = `Trouve ${limit} formations (pas d'emplois) pour devenir "${metierLabel}" près de "${villeRef}".

Répond UNIQUEMENT en JSON avec cette structure exacte :
{
  "formations": [
    {
      "title": "Nom exact de la formation",
      "organisme": "Nom exact de l'organisme/école",
      "ville": "Ville (ex: Montpellier)",
      "address": "Adresse complète si disponible (optionnel)",
      "url1": "Source 1 (site officiel organisme OU page formation)",
      "url2": "Source 2 (site fiable différent: Onisep, Carif-Oref, France Travail, site public, etc.)",
      "diploma_hint": "CAP|Bac Pro|BP|BTS|BTSA|BUT|Licence (optionnel)"
    }
  ]
}

IMPORTANT :
- url1 et url2 doivent être sur des DOMAINES DIFFÉRENTS
- Ne propose QUE des formations cohérentes avec "${metierLabel}"
- Donne en priorité celles situées à "${villeRef}" (puis autour).`;

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
    if (!content) return [];

    // Parser JSON (gérer ```json)
    let jsonContent = content.trim();
    if (jsonContent.startsWith("```json")) {
      jsonContent = jsonContent.replace(/^```json\s*/i, "").replace(/```\s*$/, "");
    } else if (jsonContent.startsWith("```")) {
      jsonContent = jsonContent.replace(/^```\s*/, "").replace(/```\s*$/, "");
    }

    const parsed = JSON.parse(jsonContent);
    const rawFormations: PerplexityFormationRaw[] = parsed?.formations || [];
    if (!Array.isArray(rawFormations) || rawFormations.length === 0) return [];

    const enriched: EnrichedFormation[] = [];

    // Garde-fou distance : au-delà => rejet (géocode “part en vrille”)
    const MAX_REASONABLE_KM = 220;

    for (const raw of rawFormations) {
      if (!raw?.title || !raw?.organisme || !raw?.ville || !raw?.url1 || !raw?.url2) continue;

      // Cohérence métier (léger mais utile)
      if (!isCoherentWithMetier(raw, metierLabel)) continue;

      // URLs validées + domaines différents
      const okUrls = await validateUrls(raw.url1, raw.url2);
      if (!okUrls) continue;

      // Géocodage STRICT : si rien de fiable => rejet
      const hasAddress = !!(raw.address && raw.address.trim().length >= 6);

      const q1 = hasAddress ? `${raw.address} ${raw.ville}` : "";
      const q2 = `${raw.organisme} ${raw.ville}`;
      const q3 = raw.ville;

      const geo =
        (q1 ? await geocodeFrance(q1) : null) ||
        (q2 ? await geocodeFrance(q2) : null) ||
        (q3 ? await geocodeFrance(q3) : null);

      if (!geo?.lat || !geo?.lon) continue;

      const d = round1(haversineKm(lat, lon, geo.lat, geo.lon));

      // ✅ GARDE-FOU B : si trop loin => rejet
      if (!(d >= 0 && d <= MAX_REASONABLE_KM)) continue;

      const niveau = inferNiveauFromHint(raw.diploma_hint);

      // IMPORTANT : on n'invente RIEN
      const alternance = "Non renseigné";
      const modalite = "Non renseigné";
      const rncp = "Non renseigné";

      enriched.push({
        id: `pplx_${crypto.randomUUID()}`,
        intitule: raw.title,
        organisme: raw.organisme,
        ville: raw.ville,
        lat: geo.lat,
        lon: geo.lon,
        distance_km: d,
        rncp,
        modalite,
        alternance,
        categorie: "Diplôme / Titre",
        site_web: raw.url1,
        url: raw.url1,
        niveau,
        match: {
          score: 25,
          reasons: [
            "Formation trouvée sur des sources vérifiées",
            "Correspond au métier recherché",
            "Localisation confirmée",
          ],
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

// ----------------------------------------------------------------------------------
// Helpers merge
// ----------------------------------------------------------------------------------

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

export function mergeFormationsWithoutDuplicates(
  lbaFormations: any[],
  perplexityFormations: EnrichedFormation[]
): any[] {
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
