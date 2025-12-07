import { PerplexityResponse } from '../types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export async function searchFormations(
  metier: string,
  ville: string,
  niveau: '4' | '5' | '6' | 'all'
): Promise<PerplexityResponse> {
  console.log('Recherche de formations via Edge Function:', { metier, ville, niveau });

  try {
    const apiUrl = `${SUPABASE_URL}/functions/v1/search-formations`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ metier, ville, niveau }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Erreur HTTP: ${response.status}`);
    }

    const result: PerplexityResponse = await response.json();

    console.log(`Formations trouvées: ${result.formations?.length || 0}`);

    if (!result.formations || result.formations.length === 0) {
      console.warn('Aucune formation trouvée dans la réponse API');
    } else {
      console.log('Détails:', result.formations.map(f => `${f.intitule} - ${f.organisme} (${f.ville})`));
    }

    return result;
  } catch (error) {
    console.error('Error calling search-formations function:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Erreur inconnue lors de l\'appel à l\'API de recherche');
  }
}
