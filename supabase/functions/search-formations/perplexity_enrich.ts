/**
 * Perplexity Enrichment Module
 *
 * Complète les résultats LBA avec des formations supplémentaires via Perplexity AI
 * uniquement si nécessaire (< 10 résultats ou distance élevée).
 *
 * Règles strictes :
 * - Chaque formation doit avoir 2 URLs de sources différentes et vérifiées (HTTP 200)
 * - Pas de doublons (intitulé + organisme + ville)
 * - Formations cohérentes avec le métier recherché
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

/**
 * Vérifie si une URL répond avec un status HTTP 200
 */
async function isUrlValid(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeoutId);
    return response.ok; // 200-299
  } catch {
    return false;
  }
}

/**
 * Extrait le domaine d'une URL
 */
function extractDomain(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

/**
 * Vérifie que 2 URLs sont valides et sur des domaines différents
 */
async function validateUrls(url1: string, url2: string): Promise<boolean> {
  // Vérifier que les domaines sont différents
  const domain1 = extractDomain(url1);
  const domain2 = extractDomain(url2);

  if (!domain1 || !domain2 || domain1 === domain2) {
    return false;
  }

  // Vérifier que les deux URLs répondent
  const [valid1, valid2] = await Promise.all([
    isUrlValid(url1),
    isUrlValid(url2),
  ]);

  return valid1 && valid2;
}

/**
 * Appelle Perplexity AI pour obtenir des formations supplémentaires
 */
export async function fetchPerplexityFormations(
  input: PerplexityFormationInput
): Promise<EnrichedFormation[]> {
  const { metierLabel, villeRef, lat, lon, limit = 5 } = input;

  const apiKey = Deno.env.get("PPLX_API_KEY");
  if (!apiKey) {
    console.warn("PPLX_API_KEY not configured, skipping Perplexity enrichment");
    return [];
  }

  const systemPrompt = `Tu es un expert en formations professionnelles françaises.
Ta tâche est de trouver des formations réelles et pertinentes pour le métier "${metierLabel}" près de "${villeRef}".

IMPORTANT :
- Retourne UNIQUEMENT des formations qui correspondent EXACTEMENT au métier "${metierLabel}"
- Privilégie les formations en alternance/apprentissage
- Inclus l'adresse complète si disponible
- Pour chaque formation, fournis 2 URLs de sources DIFFÉRENTES (sites web différents)
- Ne retourne QUE des formations réelles et vérifiables`;

  const userPrompt = `Trouve ${limit} formations pour le métier "${metierLabel}" près de "${villeRef}".

Retourne UNIQUEMENT un JSON avec cette structure exacte (pas de texte avant ou après) :
{
  "formations": [
    {
      "title": "Nom exact de la formation",
      "organisme": "Nom exact de l'organisme/école",
      "ville": "Nom de la ville",
      "address": "Adresse complète si disponible",
      "url1": "URL source 1 (site officiel de l'organisme)",
      "url2": "URL source 2 (autre site - carif, onisep, etc)",
      "diploma_hint": "Niveau du diplôme (CAP, Bac Pro, BTS, etc)"
    }
  ]
}

CRITÈRES STRICTS :
- Formations cohérentes avec "${metierLabel}"
- Organismes réels (CFA, lycées professionnels, écoles)
- Ville proche de "${villeRef}" (France)
- 2 URLs différentes et vérifiables pour chaque formation`;

  try {
    const response = await fetch(PPLX_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: PPLX_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      console.error("Perplexity API error:", response.status, await response.text());
      return [];
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      console.warn("No content from Perplexity");
      return [];
    }

    // Parser le JSON (peut être entouré de ```json ... ```)
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

    // Valider et enrichir chaque formation
    const enriched: EnrichedFormation[] = [];

    for (const raw of rawFormations) {
      // Validation des champs requis
      if (!raw.title || !raw.organisme || !raw.ville || !raw.url1 || !raw.url2) {
        console.warn("Formation manque champs requis:", raw);
        continue;
      }

      // Validation des URLs
      const urlsValid = await validateUrls(raw.url1, raw.url2);
      if (!urlsValid) {
        console.warn("URLs invalides pour formation:", raw.title);
        continue;
      }

      // Géocodage de la ville (simple approximation avec la ville de référence)
      // Note: dans un cas réel, on pourrait faire un appel à l'API géo
      const formationLat = lat;
      const formationLon = lon;
      const distance_km = 50; // Approximation - dans un cas réel, calculer la vraie distance

      // Inférer le niveau
      let niveau = "N/A";
      const diplomaHint = (raw.diploma_hint || "").toLowerCase();
      if (diplomaHint.includes("cap") || diplomaHint.includes("bep")) niveau = "3";
      else if (diplomaHint.includes("bac") && !diplomaHint.includes("bac+")) niveau = "4";
      else if (diplomaHint.includes("bts") || diplomaHint.includes("dut") || diplomaHint.includes("bac+2")) niveau = "5";
      else if (diplomaHint.includes("licence") || diplomaHint.includes("bachelor") || diplomaHint.includes("bac+3")) niveau = "6";

      enriched.push({
        id: `pplx_${crypto.randomUUID()}`,
        intitule: raw.title,
        organisme: raw.organisme,
        ville: raw.ville,
        lat: formationLat,
        lon: formationLon,
        distance_km,
        rncp: "Non renseigné",
        modalite: "Alternance possible",
        alternance: "Oui",
        categorie: "Diplôme / Titre",
        site_web: raw.url1,
        url: raw.url1,
        niveau,
        match: {
          score: 25, // Score modéré pour Perplexity
          reasons: [
            "Formation complémentaire suggérée",
            "Correspond au métier recherché",
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

/**
 * Détermine si l'enrichissement Perplexity est nécessaire
 */
export function shouldEnrichWithPerplexity(
  currentResults: any[],
  config: { min_results?: number; max_distance?: number }
): boolean {
  const minResults = config.min_results ?? 10;
  const maxDistance = config.max_distance ?? 150;

  // Cas 1: Pas assez de résultats
  if (currentResults.length < minResults) {
    return true;
  }

  // Cas 2: Résultats trop éloignés
  const avgDistance = currentResults.reduce((sum, r) => {
    const dist = typeof r?.distance_km === "number" ? r.distance_km : 999;
    return sum + dist;
  }, 0) / currentResults.length;

  if (avgDistance > maxDistance) {
    return true;
  }

  return false;
}

/**
 * Crée une clé de déduplication
 */
export function makeDedupKey(intitule: string, organisme: string, ville: string): string {
  const clean = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "")
      .trim();

  return `${clean(intitule)}|${clean(organisme)}|${clean(ville)}`;
}

/**
 * Fusionne les formations LBA et Perplexity sans doublons
 */
export function mergeFormationsWithoutDuplicates(
  lbaFormations: any[],
  perplexityFormations: EnrichedFormation[]
): any[] {
  const seen = new Set<string>();
  const merged: any[] = [];

  // Ajouter d'abord les formations LBA
  for (const formation of lbaFormations) {
    const key = makeDedupKey(
      formation.intitule || "",
      formation.organisme || "",
      formation.ville || ""
    );
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(formation);
    }
  }

  // Ajouter les formations Perplexity (sans doublons)
  for (const formation of perplexityFormations) {
    const key = makeDedupKey(
      formation.intitule || "",
      formation.organisme || "",
      formation.ville || ""
    );
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(formation);
    }
  }

  return merged;
}
