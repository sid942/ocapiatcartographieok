/**
 * Perplexity Enrichment Module (VF ULTRA - STRICT & SAFE)
 *
 * Objectif : compléter LBA avec Perplexity sans halluciner.
 * - 2 URLs domaines différents + vérifiées
 * - Cohérence métier robuste (keywords métier + anti-honte)
 * - Distance réelle uniquement (géocode fiable + haversine)
 * - Si géocode incertain => rejet (pas de 0 / pas de 999)
 * - Alternance/modalité/RNCP : jamais inventés => "Non renseigné"
 */

const PPLX_API_URL = "https://api.perplexity.ai/chat/completions";
const PPLX_MODEL = "sonar-pro";

// ---- Perf / timeouts
const URL_TIMEOUT_MS = 8000;
const GEO_TIMEOUT_MS = 8000;
const PPLX_TIMEOUT_MS = 12000;

// ---- Scoring / output
const DEFAULT_PPLX_SCORE = 14; // doit rester derrière LBA
const MAX_REASONS = 3;

// ---- URL quality signals (anti pages génériques)
const URL_MUST_CONTAIN_ANY = [
  "formation",
  "formations",
  "cfa",
  "cfppa",
  "lycee",
  "ep lefpa",
  "eplefpa",
  "mfr",
  "onisep",
  "carif",
  "orefs",
  "orientation",
  "apprentissage",
  "diplome",
  "brevet",
  "btsa",
  "bp",
  "bac-pro",
  "bacpro",
];
const URL_BANNED_CONTAIN = [
  "blog",
  "article",
  "actualite",
  "news",
  "forum",
  "pdf",
  "presse",
  "annonce",
  "emploi",
  "job",
];

// ----------------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------------

export interface PerplexityFormationInput {
  metierLabel: string;
  villeRef: string;
  lat: number;
  lon: number;
  limit?: number;

  /** 🔥 VF: keywords métier venant de ton index.ts (context + strong + synonyms) */
  job_keywords?: string[];

  /** 🔥 VF: mots bannis spécifiques métier (ex: bus, taxi, chevaux, attelage, routier...) */
  banned_keywords?: string[];

  /** cap distance dur */
  hard_cap_km?: number;

  /** score output (sinon DEFAULT_PPLX_SCORE) */
  output_score?: number;
}

export interface PerplexityFormationRaw {
  title: string;
  organisme: string;
  ville: string;
  address?: string;
  url1: string;
  url2: string;
  diploma_hint?: string;
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
  "de", "des", "du", "la", "le", "les", "un", "une", "et", "en", "pour", "au", "aux",
  "d", "l", "a", "à", "sur", "avec", "dans", "ou", "par", "ces", "ses", "son", "sa",
]);

function uniq(arr: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of arr) {
    const c = cleanText(x);
    if (!c || c.length < 3) continue;
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(x);
  }
  return out;
}

function tokenizeMeaningful(s: string): string[] {
  const t = cleanText(s);
  const parts = t.split(" ").filter(Boolean);
  return parts.filter((p) => p.length >= 4 && !STOPWORDS_FR.has(p));
}

// ----------------------------------------------------------------------------------
// Cohérence métier (VF robuste)
// ----------------------------------------------------------------------------------

function containsAny(hay: string, needles: string[]) {
  const h = cleanText(hay);
  for (const n of needles) {
    const c = cleanText(n);
    if (c && h.includes(c)) return true;
  }
  return false;
}

function isCoherentWithJob(raw: PerplexityFormationRaw, metierLabel: string, jobKeywords: string[]) {
  const hay = `${raw.title} ${raw.organisme} ${raw.ville} ${raw.address ?? ""}`;
  const baseTokens = tokenizeMeaningful(metierLabel);

  // Hard rule 1: au moins 1 keyword métier (si fourni)
  if (jobKeywords.length > 0) {
    if (!containsAny(hay, jobKeywords)) return false;
    return true;
  }

  // fallback si pas de job_keywords (moins fiable)
  if (baseTokens.length === 0) return true;
  return baseTokens.some((tk) => cleanText(hay).includes(tk));
}

function isRejectedByBanned(raw: PerplexityFormationRaw, banned: string[]) {
  if (!banned.length) return false;
  const hay = cleanText(`${raw.title} ${raw.organisme} ${raw.ville} ${raw.address ?? ""}`);
  return banned.some((b) => {
    const bb = cleanText(b);
    return bb && hay.includes(bb);
  });
}

// ----------------------------------------------------------------------------------
// URL validation (qualité + domaines différents)
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

function urlLooksLikeFormation(url: string): boolean {
  const u = cleanText(url);
  // rejette si obvious "article"
  if (URL_BANNED_CONTAIN.some((x) => u.includes(cleanText(x)))) return false;

  // accepte si au moins un signal
  return URL_MUST_CONTAIN_ANY.some((x) => u.includes(cleanText(x)));
}

/** Vérifie qu'une URL répond ET n'est pas une page "vide" */
async function isUrlValidAndRelevant(url: string): Promise<boolean> {
  try {
    // Fast check : URL structure
    if (!urlLooksLikeFormation(url)) return false;

    // HEAD (souvent bloqué)
    const head = await fetchWithTimeout(url, { method: "HEAD" }, URL_TIMEOUT_MS);
    if (head.ok) {
      const ct = head.headers.get("content-type") || "";
      // si c’est un PDF => généralement catalogue, pas formation détaillée (on évite)
      if (ct.toLowerCase().includes("application/pdf")) return false;
      return true;
    }

    // fallback GET léger
    const get = await fetchWithTimeout(url, { method: "GET" }, URL_TIMEOUT_MS);
    if (!get.ok) return false;

    const ct = get.headers.get("content-type") || "";
    if (ct.toLowerCase().includes("application/pdf")) return false;

    return true;
  } catch {
    return false;
  }
}

async function validateUrls(url1: string, url2: string): Promise<boolean> {
  const d1 = extractDomain(url1);
  const d2 = extractDomain(url2);
  if (!d1 || !d2 || d1 === d2) return false;

  const [ok1, ok2] = await Promise.all([isUrlValidAndRelevant(url1), isUrlValidAndRelevant(url2)]);
  return ok1 && ok2;
}

// ----------------------------------------------------------------------------------
// Geo + distance (strict)
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

type GeoResult = { lat: number; lon: number; score: number; type: string; label?: string };

/**
 * Géocodage strict (api-adresse.data.gouv.fr)
 * - Si on a une adresse, on exige type housenumber/street (sinon rejet)
 * - Sinon on accepte municipality/city si score suffisant
 */
async function geocodeFranceStrict(query: string): Promise<GeoResult | null> {
  const q = query.trim();
  if (!q || q.length < 3) return null;

  const tries: Array<{ type: string; url: string; minScore: number }> = [
    { type: "housenumber", url: `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1&type=housenumber`, minScore: 0.52 },
    { type: "street", url: `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1&type=street`, minScore: 0.52 },
    { type: "municipality", url: `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1&type=municipality`, minScore: 0.48 },
    { type: "city", url: `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1&type=city`, minScore: 0.48 },
    { type: "fallback", url: `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1`, minScore: 0.62 },
  ];

  for (const t of tries) {
    try {
      const res = await fetchWithTimeout(t.url, { method: "GET" }, GEO_TIMEOUT_MS);
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
        return { lat, lon, score, type: t.type, label: props?.label };
      }
    } catch {
      // continue
    }
  }

  return null;
}

// ----------------------------------------------------------------------------------
// Niveau
// ----------------------------------------------------------------------------------

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
// Perplexity call (JSON strict)
// ----------------------------------------------------------------------------------

async function fetchPplxJSON(apiKey: string, systemPrompt: string, userPrompt: string) {
  const res = await fetchWithTimeout(
    PPLX_API_URL,
    {
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
        temperature: 0.15,
        max_tokens: 2200,
      }),
    },
    PPLX_TIMEOUT_MS
  );

  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const content = data?.choices?.[0]?.message?.content;
  if (!content) return null;

  let jsonContent = content.trim();
  if (jsonContent.startsWith("```json")) jsonContent = jsonContent.replace(/^```json\s*/i, "").replace(/```\s*$/, "");
  else if (jsonContent.startsWith("```")) jsonContent = jsonContent.replace(/^```\s*/, "").replace(/```\s*$/, "");

  return JSON.parse(jsonContent);
}

// ----------------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------------

export async function fetchPerplexityFormations(input: PerplexityFormationInput): Promise<EnrichedFormation[]> {
  const {
    metierLabel,
    villeRef,
    lat,
    lon,
    limit = 5,
    job_keywords = [],
    banned_keywords = [],
    hard_cap_km = 220,
    output_score = DEFAULT_PPLX_SCORE,
  } = input;

  const apiKey = Deno.env.get("PPLX_API_KEY");
  if (!apiKey) {
    console.warn("PPLX_API_KEY not configured, skipping Perplexity enrichment");
    return [];
  }

  const jobKw = uniq(job_keywords).slice(0, 30);
  const banned = uniq(banned_keywords).slice(0, 40);

  // Prompt ultra cadré : on force des pages de formation, pas des articles
  const systemPrompt = `Tu es un expert des formations professionnelles en France.
Tu dois fournir des formations RÉELLES et VÉRIFIABLES pour le métier "${metierLabel}", proches de "${villeRef}".

RÈGLES ABSOLUES :
- Réponds UNIQUEMENT avec un JSON valide (aucun texte)
- Chaque formation DOIT avoir 2 URLs de domaines différents
- url1 doit idéalement être le site de l'organisme (CFA/CFPPA/EPLEFPA/MFR/GRETA/lycée…)
- url2 doit être une source fiable différente (Onisep, Carif-Oref, France Travail, site public…)
- Ne propose PAS d'articles de blog, ni d'offres d'emploi, ni de pages génériques
- Donne si possible l'adresse complète de l'établissement
`;

  const userPrompt = `Trouve ${limit} formations (pas d'emplois) pour devenir "${metierLabel}" près de "${villeRef}".

Tu dois répondre UNIQUEMENT en JSON avec la structure EXACTE :
{
  "formations": [
    {
      "title": "Nom exact de la formation",
      "organisme": "Nom exact de l'organisme/école",
      "ville": "Ville",
      "address": "Adresse complète si disponible (optionnel)",
      "url1": "Page formation OU site officiel organisme",
      "url2": "Source fiable différente (Onisep/Carif-Oref/France Travail/site public...)",
      "diploma_hint": "CAP|Bac Pro|BP|BTS|BTSA|BUT|Licence (optionnel)"
    }
  ]
}

IMPORTANT :
- url1 et url2 doivent être sur des DOMAINES DIFFÉRENTS
- Priorité: "${villeRef}" puis autour (pas l'autre bout de la France)
- Formation doit être cohérente avec "${metierLabel}"`;

  let parsed: any;
  try {
    parsed = await fetchPplxJSON(apiKey, systemPrompt, userPrompt);
  } catch (e) {
    console.error("Perplexity JSON parse/call failed:", e);
    return [];
  }

  const rawFormations: PerplexityFormationRaw[] = parsed?.formations || [];
  if (!Array.isArray(rawFormations) || rawFormations.length === 0) return [];

  // On traite en pipeline robuste (filtrage -> urls -> geo)
  // 1) champs requis + cohérence + anti-banned
  const candidates = rawFormations
    .filter((r) => r?.title && r?.organisme && r?.ville && r?.url1 && r?.url2)
    .filter((r) => isCoherentWithJob(r, metierLabel, jobKw))
    .filter((r) => !isRejectedByBanned(r, banned))
    .slice(0, Math.max(8, limit * 3)); // garde un pool, puis on valide dur

  if (candidates.length === 0) return [];

  // 2) URLs validées (en parallèle, rapide)
  const urlChecks = await Promise.all(
    candidates.map(async (r) => ({ r, ok: await validateUrls(r.url1, r.url2) }))
  );
  const urlOk = urlChecks.filter((x) => x.ok).map((x) => x.r);
  if (urlOk.length === 0) return [];

  // 3) Géocodage strict (en parallèle)
  const geoResults = await Promise.all(
    urlOk.map(async (raw) => {
      const hasAddress = !!(raw.address && raw.address.trim().length >= 6);

      const q1 = hasAddress ? `${raw.address} ${raw.ville}` : "";
      const q2 = `${raw.organisme} ${raw.ville}`;
      const q3 = raw.ville;

      const geo =
        (q1 ? await geocodeFranceStrict(q1) : null) ||
        (q2 ? await geocodeFranceStrict(q2) : null) ||
        (q3 ? await geocodeFranceStrict(q3) : null);

      // Si on avait une adresse mais qu’on n’obtient que city/municipality => on rejette
      if (hasAddress && geo && (geo.type === "city" || geo.type === "municipality" || geo.type === "fallback")) {
        return { raw, geo: null };
      }

      return { raw, geo };
    })
  );

  const enriched: EnrichedFormation[] = [];

  for (const { raw, geo } of geoResults) {
    if (!geo?.lat || !geo?.lon) continue;

    const d = round1(haversineKm(lat, lon, geo.lat, geo.lon));
    if (!(d >= 0 && d <= hard_cap_km)) continue;

    const niveau = inferNiveauFromHint(raw.diploma_hint);

    enriched.push({
      id: `pplx_${crypto.randomUUID()}`,
      intitule: raw.title,
      organisme: raw.organisme,
      ville: raw.ville,
      lat: geo.lat,
      lon: geo.lon,
      distance_km: d,

      rncp: "Non renseigné",
      modalite: "Non renseigné",
      alternance: "Non renseigné",
      categorie: "Diplôme / Titre",
      site_web: raw.url1,
      url: raw.url1,
      niveau,

      match: {
        score: output_score,
        reasons: [
          "Formation complémentaire vérifiée",
          "Correspond au métier recherché",
          "Localisation confirmée",
        ].slice(0, MAX_REASONS),
      },
    });
  }

  // Limite finale
  return enriched
    .sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999))
    .slice(0, limit);
}

// ----------------------------------------------------------------------------------
// Helpers merge (inchangés)
// ----------------------------------------------------------------------------------

export function shouldEnrichWithPerplexity(currentResults: any[], config: { min_results?: number; max_distance?: number }): boolean {
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
