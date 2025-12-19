import { useState, useRef } from 'react';
import { Loader2, AlertCircle, MapPin } from 'lucide-react';
import { createClient } from '@supabase/supabase-js'; // Import Supabase
import { SearchForm } from './components/SearchForm';
import { FormationMap, FormationMapRef } from './components/FormationMap';
import { FormationList } from './components/FormationList';
import { Formation, Metier } from './types';

// --- CONFIGURATION SUPABASE (A déplacer idéalement dans src/lib/supabase.ts) ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);
// -----------------------------------------------------------------------------

function App() {
  const mapRef = useRef<FormationMapRef>(null);
  const [formations, setFormations] = useState<Formation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Pour l'affichage des infos de recherche (Debug & User Feedback)
  const [searchInfo, setSearchInfo] = useState<{
    metier: string;
    ville: string;
    rayon: string;
    count: number;
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
      // 1. APPEL AU "CERVEAU" (Backend Supabase)
      // On ne fait plus aucun calcul ici, on fait confiance au backend.
      const { data, error: functionError } = await supabase.functions.invoke('search-formations', {
        body: { metier, ville } 
      });

      if (functionError) throw new Error(functionError.message || "Erreur de connexion au serveur");
      if (data.error) throw new Error(data.error);

      // 2. RÉCEPTION DES DONNÉES PROPRES
      // Le backend nous envoie déjà tout filtré, trié, et géocodé.
      const results = data.formations || [];

      setFormations(results);

      // 3. MISE A JOUR DES INFOS INTELLIGENTES
      setSearchInfo({
        metier: data.metier_detecte, // Ex: "Agent de Silo" (même si user a tapé "silo")
        ville: data.ville_reference,
        rayon: data.rayon_applique,
        count: data.count
      });

      // 4. ZOOM AUTOMATIQUE SUR LA PREMIÈRE FORMATION
      if (results.length > 0 && mapRef.current) {
         // On laisse un petit délai pour que la map charge les points
         setTimeout(() => {
             const first = results[0];
             if (first.lat && first.lon) {
                 mapRef.current?.flyToFormation(first);
             }
         }, 500);
      }

    } catch (err) {
      console.error('Search error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(`Erreur système : ${errorMessage}`);
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

      {/* --- SIDEBAR --- */}
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
                Cartographie <span className="text-[#F5A021]">Intelligente</span>
              </h1>
              <p className="text-xs text-gray-600 mt-1 font-medium">
                Négoce Agricole • Filtre strict
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

        {/* --- ZONE D'INFO INTELLIGENTE --- */}
        {searchInfo && !isLoading && !error && (
          <div className="mx-4 mb-4 bg-[#47A152]/10 border border-[#47A152]/30 rounded-lg p-3 shadow-sm">
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center border-b border-[#47A152]/20 pb-1">
                <span className="text-gray-600">Métier Identifié :</span>
                <span className="font-bold text-[#74114D] text-right">{searchInfo.metier}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Zone de recherche :</span>
                <span className="font-semibold text-gray-800 text-right flex items-center gap-1 justify-end">
                   <MapPin className="h-3 w-3 text-[#47A152]" /> 
                   {searchInfo.ville}
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px] text-gray-500 italic">
                  <span>Rayon strict appliqué :</span>
                  <span>{searchInfo.rayon}</span>
              </div>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center py-12 space-y-3">
            <Loader2 className="h-8 w-8 text-[#F5A021] animate-spin" />
            <div className="text-center">
              <p className="text-sm font-medium text-[#74114D]">Analyse Géographique...</p>
              <p className="text-xs text-gray-500">Filtrage des formations non pertinentes</p>
            </div>
          </div>
        )}

        {!isLoading && formations.length > 0 && (
          <div className="px-4 pb-4 animate-in fade-in duration-500">
            <div className="mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {formations.length} Résultat(s) validé(s)
            </div>
            <FormationList
              formations={formations}
              onFormationClick={handleFormationClick}
            />
          </div>
        )}

        {!isLoading && formations.length === 0 && !error && hasSearched && (
           <div className="px-4 py-8 text-center bg-gray-50 mx-4 rounded-lg border border-dashed border-gray-300">
            <p className="text-sm font-bold text-gray-900 mb-1">
              Aucun résultat strict trouvé
            </p>
            <p className="text-xs text-gray-500">
              Le filtre de sécurité n'a trouvé aucune formation correspondant exactement aux critères de {searchInfo?.metier || "ce métier"} dans le rayon imparti.
            </p>
          </div>
        )}
        
        {/* Footer Logos */}
        <div className="mt-auto border-t border-gray-200 p-4 bg-white">
             {/* ... (Garder vos logos existants ici) ... */}
             <div className="text-[10px] text-center text-gray-400 mt-2">
                 Propulsé par Algorithme de Filtrage ROME V2
             </div>
        </div>
      </div>

      {/* --- MAP --- */}
      <div className="flex-1 relative bg-gray-200">
        {isLoading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-30 flex items-center justify-center">
          </div>
        )}
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