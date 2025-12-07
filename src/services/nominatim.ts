import { NominatimResult } from '../types';

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function searchCities(query: string): Promise<NominatimResult[]> {
  if (query.length < 2) return [];

  try {
    const response = await fetch(
      `${NOMINATIM_BASE_URL}/search?` +
      new URLSearchParams({
        q: query,
        format: 'json',
        countrycodes: 'fr',
        limit: '5',
        addressdetails: '1'
      }),
      {
        headers: {
          'User-Agent': 'FormationsNegociantsAgricoles/1.0'
        }
      }
    );

    if (!response.ok) throw new Error('Nominatim search failed');

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error searching cities:', error);
    return [];
  }
}

export async function geocodeCity(cityName: string): Promise<{ lat: number; lon: number } | null> {
  try {
    await delay(1000);

    const response = await fetch(
      `${NOMINATIM_BASE_URL}/search?` +
      new URLSearchParams({
        q: cityName + ', France',
        format: 'json',
        limit: '1'
      }),
      {
        headers: {
          'User-Agent': 'FormationsNegociantsAgricoles/1.0'
        }
      }
    );

    if (!response.ok) throw new Error('Geocoding failed');

    const data = await response.json();
    if (data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
      };
    }
    return null;
  } catch (error) {
    console.error(`Error geocoding ${cityName}:`, error);
    return null;
  }
}
