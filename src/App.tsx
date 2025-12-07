import { useState, useRef } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { SearchForm } from './components/SearchForm';
import { FormationMap, FormationMapRef } from './components/FormationMap';
import { FormationList } from './components/FormationList';
import { Formation, Metier } from './types';
import { searchFormations } from './services/perplexity';
import { geocodeCity } from './services/nominatim';

function App() {
  const mapRef = useRef<FormationMapRef>(null);
  const [formations, setFormations] = useState<Formation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchInfo, setSearchInfo] = useState<{
    metier: string;
    ville: string;
    niveau: string;
  } | null>(null);

  const handleSearch = async (
    metier: Metier,
    ville: string,
    niveau: '4' | '5' | '6' | 'all'
  ) => {
    setIsLoading(true);
    setError(null);
    setFormations([]);
    setHasSearched(true);

    try {
      const result = await searchFormations(metier, ville, niveau);

      const formationsWithCoords = await Promise.all(
        result.formations.map(async (formation) => {
          const coords = await geocodeCity(formation.ville);
          return {
            ...formation,
            lat: coords?.lat,
            lon: coords?.lon
          };
        })
      );

      setFormations(formationsWithCoords);
      setSearchInfo({
        metier: result.metier_normalise,
        ville: result.ville_reference,
        niveau: result.niveau_filtre
      });
    } catch (err) {
      console.error('Search error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(
        `Une erreur est survenue lors de la recherche: ${errorMessage}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormationClick = (formation: Formation) => {
    if (formation.lat && formation.lon && mapRef.current) {
      mapRef.current.flyToFormation(formation);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <div className="w-96 bg-white shadow-xl overflow-y-auto flex-shrink-0 flex flex-col">
        <div className="p-6 border-b border-gray-200 bg-gradient-to-br from-red-50 to-white">
          <div className="mb-3">
            <h1 className="text-xl font-bold text-gray-900">
              Formations Agricoles
            </h1>
            <p className="text-xs text-gray-600">
              Négociants Agricoles France
            </p>
          </div>
        </div>

        <div className="p-4">
          <SearchForm onSearch={handleSearch} isLoading={isLoading} />
        </div>

        {error && (
          <div className="mx-4 mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {searchInfo && (
          <div className="mx-4 mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="space-y-1 text-xs">
              <div>
                <span className="font-medium text-gray-700">Métier:</span>{' '}
                <span className="text-gray-900">{searchInfo.metier}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Ville:</span>{' '}
                <span className="text-gray-900">{searchInfo.ville}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Niveau:</span>{' '}
                <span className="text-gray-900">
                  {searchInfo.niveau === 'all' ? 'Tous' : searchInfo.niveau}
                </span>
              </div>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex-1 flex items-center justify-center py-16">
            <div className="text-center">
              <Loader2 className="h-10 w-10 text-[#EB600A] animate-spin mx-auto mb-4" />
              <p className="text-sm text-gray-600">Interrogation des bases de données...</p>
            </div>
          </div>
        )}

        {!isLoading && formations.length > 0 && (
          <div className="px-4 pb-4">
            <FormationList
              formations={formations}
              onFormationClick={handleFormationClick}
            />
          </div>
        )}

        {!isLoading && formations.length === 0 && !error && !hasSearched && (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-gray-500">
              Sélectionnez un métier et une ville pour voir les formations sur la carte
            </p>
          </div>
        )}

        {!isLoading && formations.length === 0 && !error && hasSearched && searchInfo && (
          <div className="px-4 py-8 text-center">
            <AlertCircle className="h-12 w-12 text-orange-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-900 mb-1">
              Aucune formation trouvée
            </p>
            <p className="text-xs text-gray-500 mb-3">
              Pour {searchInfo.metier} à {searchInfo.ville}
            </p>
            <p className="text-xs text-gray-400">
              Essayez une ville plus grande ou un métier différent
            </p>
          </div>
        )}

        <div className="mt-auto border-t border-gray-200 p-4 bg-gray-50">
          <div className="flex items-center justify-center gap-3 mb-3">
            <img
              src="https://www.ocapiat.fr/wp-content/uploads/Logo-Ocapiat-test-site-02.png"
              alt="Ocapiat"
              className="h-8 object-contain"
            />
            <img
              src="https://www.logotheque-vectorielle.fr/wp-content/uploads/2019/07/logo-vectoriel-ministere-de-l-education-nationale.jpg"
              alt="Ministère de l'Education nationale"
              className="h-8 object-contain"
            />
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Minist%C3%A8re_de_l%E2%80%99Agriculture_et_de_la_Souverainet%C3%A9_alimentaire.svg/1200px-Minist%C3%A8re_de_l%E2%80%99Agriculture_et_de_la_Souverainet%C3%A9_alimentaire.svg.png"
              alt="Ministère de l'Agriculture"
              className="h-8 object-contain"
            />
          </div>
          <p className="text-[10px] text-gray-500 text-center leading-relaxed">
            Financé dans le cadre de la convention de coopération signée avec le Ministère de l'Agriculture et de la Souveraineté alimentaire et le Ministère de l'Education nationale et de la jeunesse
          </p>
        </div>
      </div>

      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 bg-gray-50 bg-opacity-95 z-50 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-lg px-6 py-5 flex items-center gap-4">
              <Loader2 className="h-5 w-5 text-[#EB600A] animate-spin" />
              <div>
                <p className="text-sm font-medium text-gray-900">Recherche en cours</p>
                <p className="text-xs text-gray-500 mt-0.5">Analyse des formations disponibles...</p>
              </div>
            </div>
          </div>
        )}

        <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg px-4 py-2 z-10">
          <div className="flex gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <span className="font-medium">Niveau 4</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-orange-500"></div>
              <span className="font-medium">Niveau 5</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="font-medium">Niveau 6</span>
            </div>
          </div>
        </div>

        <FormationMap
          ref={mapRef}
          formations={formations}
          onFormationClick={handleFormationClick}
        />
      </div>
    </div>
  );
}

export default App;
