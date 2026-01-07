import type { MetierKey, SearchFormationsResponse } from "../types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

type Niveau = "3" | "4" | "5" | "6" | "all";

function assertEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Variable d'environnement manquante: ${name}`);
  return value;
}

export async function searchFormations(
  metier: MetierKey,
  ville: string,
  niveau: Niveau
): Promise<SearchFormationsResponse> {
  const urlBase = assertEnv("VITE_SUPABASE_URL", SUPABASE_URL);
  const anonKey = assertEnv("VITE_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY);

  const apiUrl = `${urlBase}/functions/v1/search-formations`;

  const payload = {
    metier,               // clé stable (ex: "silo")
    ville: ville.trim(),  // propre
    niveau,               // "3" | "4" | "5" | "6" | "all"
  };

  console.log("Recherche de formations via Edge Function:", payload);

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  // Essayer de lire le JSON même en erreur (edge renvoie souvent { error })
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const msg =
      (data && typeof data === "object" && "error" in data && (data as any).error) ||
      `Erreur HTTP: ${response.status}`;
    throw new Error(msg);
  }

  const result = data as SearchFormationsResponse;

  console.log(`Formations trouvées: ${result.formations?.length || 0}`);
  if (!result.formations || result.formations.length === 0) {
    console.warn("Aucune formation trouvée dans la réponse API");
  }

  return result;
}
