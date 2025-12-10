import { useState, useRef } from 'react';
import { Loader2, AlertCircle, MapPin } from 'lucide-react';
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
    niveau: '3' | '4' | '5' | '6' | 'all'
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
        niveau: niveau
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
    <div className="flex h-screen overflow-hidden bg-gray-100 font-sans">

      <div className="w-96 bg-white shadow-xl overflow-y-auto flex-shrink-0 flex flex-col z-20">

        <div className="p-6 border-b border-gray-200 bg-gradient-to-br from-green-50 to-white">
          <div className="flex items-start gap-4 mb-3">
            <img
              src="/illustration_ocapiat.png"
              alt="Logo Ocapiat"
              className="w-16 h-16 object-contain flex-shrink-0"
            />
            <div className="flex-1">
              <h1 className="text-lg font-bold text-[#74114D] leading-tight">
                Cartographie de l'offre de <span className="text-[#F5A021]">formation</span>
              </h1>
              <p className="text-xs text-gray-600 mt-1 font-medium">
                Branche du négoce agricole et des produits du sol
              </p>
            </div>
          </div>
        </div>

        <div className="p-4">
          <SearchForm onSearch={handleSearch} isLoading={isLoading} />
        </div>

        {error && (
          <div className="mx-4 mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2 animate-in slide-in-from-top-2">
            <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-800 leading-snug">{error}</p>
          </div>
        )}

        {searchInfo && !isLoading && !error && (
          <div className="mx-4 mb-4 bg-[#47A152]/10 border border-[#47A152]/30 rounded-lg p-3 shadow-sm">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">Métier :</span>
                <span className="font-semibold text-[#74114D] text-right">{searchInfo.metier}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Zone :</span>
                <span className="font-semibold text-[#74114D] text-right flex items-center gap-1 justify-end">
                   <MapPin className="h-3 w-3 text-[#47A152]" /> {searchInfo.ville}
                </span>
              </div>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center py-12 space-y-3">
            <Loader2 className="h-8 w-8 text-[#F5A021] animate-spin" />
            <div className="text-center">
              <p className="text-sm font-medium text-[#74114D]">Analyse en cours...</p>
              <p className="text-xs text-gray-500">Interrogation des bases de données</p>
            </div>
          </div>
        )}

        {!isLoading && formations.length > 0 && (
          <div className="px-4 pb-4 animate-in fade-in duration-500">
            <FormationList
              formations={formations}
              onFormationClick={handleFormationClick}
            />
          </div>
        )}

        {!isLoading && formations.length === 0 && !error && !hasSearched && (
          <div className="px-4 py-12 text-center opacity-60">
            <p className="text-sm text-gray-500">
              Lancez une recherche pour voir les formations apparaître ici et sur la carte.
            </p>
          </div>
        )}

        {!isLoading && formations.length === 0 && !error && hasSearched && searchInfo && (
          <div className="px-4 py-8 text-center bg-gray-50 mx-4 rounded-lg border border-dashed border-gray-300">
            <p className="text-sm font-bold text-gray-900 mb-1">
              Aucune formation trouvée
            </p>
            <p className="text-xs text-gray-500">
              Essayez d'élargir la zone ou de changer de métier.
            </p>
          </div>
        )}

        <div className="mt-auto border-t border-gray-200 p-4 bg-white">
          <div className="flex items-center justify-center gap-6 px-2">
            <img
              src="https://www.pagesjaunes.fr/media/agc/80/3f/66/00/00/9c/fc/23/54/c1/601a803f6600009cfc2354c1/601a803f6600009cfc2354c2.jpg"
              alt="Logo 1"
              className="h-10 w-auto object-contain grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all"
            />
            <img
              src="https://geimage.newstank.fr/image/cms/5a909ce4fc3aeffa412594bc611188ae/logo-plus-dynamique.jpg?fm=browser&w=4720&h=3345&s=24093e8d0f8cf2088814ba1c758e024c"
              alt="Logo 2"
              className="h-10 w-auto object-contain grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all"
            />
            <img
              src="https://www.ocapiat.fr/wp-content/uploads/Logo-Ocapiat-test-site-02.png"
              alt="Ocapiat"
              className="h-10 w-auto object-contain grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all"
            />
            <img
              src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQQ7hqyBE5Vp8fsDfygpmN19ktPuw2RgFy9Kg&s"
              alt="Logo 4"
              className="h-10 w-auto object-contain grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all"
            />
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Minist%C3%A8re_de_l%E2%80%99Agriculture_et_de_la_Souverainet%C3%A9_alimentaire.svg/1024px-Minist%C3%A8re_de_l%E2%80%99Agriculture_et_de_la_Souverainet%C3%A9_alimentaire.svg.png"
              alt="Ministère de l'Agriculture"
              className="h-10 w-auto object-contain grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 relative bg-gray-200">

        {isLoading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-30 flex items-center justify-center">
          </div>
        )}

        <div className="absolute top-4 right-4 bg-white/95 backdrop-blur rounded-lg shadow-lg px-4 py-2.5 z-10 border border-gray-200">
          <div className="flex gap-4 text-[10px] font-semibold text-gray-700">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#74114D]"></div>
              <span>CAP (N3)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#F5A021]"></div>
              <span>Bac (N4)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#47A152]"></div>
              <span>Sup (N5+)</span>
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
