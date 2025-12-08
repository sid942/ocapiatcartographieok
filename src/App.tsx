import { useState, useRef } from 'react';
import { Loader2, AlertCircle, MapPin } from 'lucide-react'; // Ajout de MapPin
import { SearchForm } from './components/SearchForm';
import { FormationMap, FormationMapRef } from './components/FormationMap';
import { FormationList } from './components/FormationList';
import { Formation, Metier } from './types';
import { searchFormations } from './service/perplexity'; // Vérifie si c'est 'service' ou 'services'
import { geocodeCity } from './services/nominatim';

function App() {
  const mapRef = useRef<FormationMapRef>(null);
  const [formations, setFormations] = useState<Formation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  
  // Stocke les infos de la recherche pour l'affichage
  const [searchInfo, setSearchInfo] = useState<{
    metier: string;
    ville: string;
    niveau: string;
  } | null>(null);

  const handleSearch = async (
    metier: Metier,
    ville: string,
    niveau: '3' | '4' | '5' | '6' | 'all' // ✅ AJOUT DU NIVEAU 3
  ) => {
    setIsLoading(true);
    setError(null);
    setFormations([]);
    setHasSearched(true);

    try {
      // 1. Appel au Backend Intelligent V34
      const result = await searchFormations(metier, ville, niveau);

      // 2. Géocodage Frontend (Pour placer les points sur la carte)
      // On utilise Promise.all pour que ce soit rapide
      const formationsWithCoords = await Promise.all(
        result.formations.map(async (formation) => {
          // On tente de géocoder la ville propre renvoyée par le backend
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
        ville: result.ville_reference, // Utilise la ville ancrée (ex: "Fresnes (94)")
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
      
      {/* SIDEBAR GAUCHE */}
      <div className="w-96 bg-white shadow-xl overflow-y-auto flex-shrink-0 flex flex-col z-20">
        
        {/* Header Sidebar */}
        <div className="p-6 border-b border-gray-200 bg-gradient-to-br from-orange-50 to-white">
          <div className="mb-3">
            <h1 className="text-xl font-bold text-gray-900 leading-tight">
              Cartographie <span className="text-[#EB600A]">Formations</span>
            </h1>
            <p className="text-xs text-gray-600 mt-1 font-medium">
              Branche Négoce Agricole (OCAPIAT)
            </p>
          </div>
        </div>

        {/* Formulaire */}
        <div className="p-4">
          <SearchForm onSearch={handleSearch} isLoading={isLoading} />
        </div>

        {/* Zone d'Erreur */}
        {error && (
          <div className="mx-4 mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2 animate-in slide-in-from-top-2">
            <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-800 leading-snug">{error}</p>
          </div>
        )}

        {/* Résumé de la recherche (Feedback) */}
        {searchInfo && !isLoading && !error && (
          <div className="mx-4 mb-4 bg-blue-50 border border-blue-100 rounded-lg p-3 shadow-sm">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Métier :</span>
                <span className="font-semibold text-gray-900 text-right">{searchInfo.metier}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Zone :</span>
                <span className="font-semibold text-gray-900 text-right flex items-center gap-1 justify-end">
                   <MapPin className="h-3 w-3" /> {searchInfo.ville}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Loader Spinner */}
        {isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center py-12 space-y-3">
            <Loader2 className="h-8 w-8 text-[#EB600A] animate-spin" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-900">Analyse en cours...</p>
              <p className="text-xs text-gray-500">Interrogation des bases de données</p>
            </div>
          </div>
        )}

        {/* Liste des Résultats */}
        {!isLoading && formations.length > 0 && (
          <div className="px-4 pb-4 animate-in fade-in duration-500">
            <FormationList
              formations={formations}
              onFormationClick={handleFormationClick}
            />
          </div>
        )}

        {/* État Vide (Avant recherche) */}
        {!isLoading && formations.length === 0 && !error && !hasSearched && (
          <div className="px-4 py-12 text-center opacity-60">
            <p className="text-sm text-gray-500">
              Lancez une recherche pour voir les formations apparaître ici et sur la carte.
            </p>
          </div>
        )}

        {/* État Vide (Après recherche - Pas de résultats) */}
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

        {/* Footer Logos Officiels */}
        <div className="mt-auto border-t border-gray-200 p-4 bg-white">
          <div className="flex items-center justify-center gap-4 mb-3 grayscale opacity-80 hover:grayscale-0 hover:opacity-100 transition-all">
            {/* Logos en placeholder ou liens externes fiables */}
            <span className="text-[10px] font-bold text-gray-400 border px-1">OCAPIAT</span>
            <span className="text-[10px] font-bold text-gray-400 border px-1">MINISTÈRE AGRI</span>
          </div>
          <p className="text-[9px] text-gray-400 text-center leading-relaxed">
            Données validées via API Adresse Gouv & RNCP.
          </p>
        </div>
      </div>

      {/* CARTE (MAP) À DROITE */}
      <div className="flex-1 relative bg-gray-200">
        
        {/* Overlay chargement sur la carte aussi */}
        {isLoading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-30 flex items-center justify-center">
             {/* Le loader est déjà à gauche, on laisse juste le flou ici pour l'effet */}
          </div>
        )}

        {/* Légende Carte Flottante */}
        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur rounded-lg shadow-md px-3 py-2 z-10 border border-gray-200">
          <div className="flex gap-3 text-[10px] font-medium text-gray-600">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-purple-500"></div>
              <span>CAP (N3)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
              <span>Bac (N4)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-orange-500"></div>
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