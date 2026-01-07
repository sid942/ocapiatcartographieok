import { useRef, useState } from "react";
import { AlertCircle, Loader2, MapPin } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

import { SearchForm } from "./components/SearchForm";
import { FormationList } from "./components/FormationList";
import { FormationMap, FormationMapRef } from "./components/FormationMap";

import type { Formation, MetierKey, SearchFormationsResponse } from "./types";

type Niveau = "3" | "4" | "5" | "6" | "all";

// --- CONFIGURATION SUPABASE (idéalement à déplacer dans src/lib/supabase.ts) ---
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

  // Infos affichées dans le panneau latéral
  const [searchInfo, setSearchInfo] = useState<{
    metier: string;
    ville: string;
    rayon: string;
    count: number;
  } | null>(null);

  const handleSearch = async (metierKey: MetierKey, ville: string, niveau: Niveau) => {
    setIsLoading(true);
    setError(null);
    setFormations([]);
    setHasSearched(true);

    try {
      const payload = {
        metier: metierKey,      // clé stable
        ville: ville.trim(),
        niveau,                 // IMPORTANT
      };

      const { data, error: functionError } = await supabase.functions.invoke("search-formations", {
        body: payload,
      });

      if (functionError) throw new Error(functionError.message || "Erreur de connexion au serveur");
      if (!data) throw new Error("Réponse serveur vide");
      if (data.error) throw new Error(data.error);

      const api = data as SearchFormationsResponse;

      const results = Array.isArray(api.formations) ? api.formations : [];
      setFormations(results);

      setSearchInfo({
        metier: api.metier_detecte,
        ville: api.ville_reference,
        rayon: api.rayon_applique,
        count: api.count ?? results.length,
      });

      // Zoom auto sur la première formation géolocalisée
      if (mapRef.current && results.length > 0) {
        const firstGeo = results.find((f) => typeof f.lat === "number" && typeof f.lon === "number");
        if (firstGeo) {
          setTimeout(() => mapRef.current?.flyToFormation(firstGeo), 300);
        }
      }
    } catch (err) {
      console.error("Search error:", err);
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      setError(`Erreur système : ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormationClick = (formation: Formation) => {
    if (formation.lat && formation.lon && mapRef.current) {
      mapRef.current.flyToFormation(formation);
    }
  };

  const showEmptyState = !isLoading && formations.length === 0 && !error && hasSearched;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100 font-sans">
      {/* SIDEBAR */}
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
                Négoce Agricole • Résultats contextualisés
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

        {/* INFO RECHERCHE */}
        {searchInfo && !isLoading && !error && (
          <div className="mx-4 mb-4 bg-[#47A152]/10 border border-[#47A152]/30 rounded-lg p-3 shadow-sm">
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center border-b border-[#47A152]/20 pb-1">
                <span className="text-gray-600">Métier identifié :</span>
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
                <span>Rayon appliqué :</span>
                <span>{searchInfo.rayon}</span>
              </div>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center py-12 space-y-3">
            <Loader2 className="h-8 w-8 text-[#F5A021] animate-spin" />
            <div className="text-center">
              <p className="text-sm font-medium text-[#74114D]">Recherche en cours...</p>
              <p className="text-xs text-gray-500">Analyse et tri des formations</p>
            </div>
          </div>
        )}

        {!isLoading && formations.length > 0 && (
          <div className="px-4 pb-4 animate-in fade-in duration-500">
            <div className="mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {formations.length} formation(s) proposée(s)
            </div>
            <FormationList formations={formations} onFormationClick={handleFormationClick} />
          </div>
        )}

        {showEmptyState && (
          <div className="px-4 py-8 text-center bg-gray-50 mx-4 rounded-lg border border-dashed border-gray-300">
            <p className="text-sm font-bold text-gray-900 mb-1">Aucune formation trouvée</p>
            <p className="text-xs text-gray-500">
              Essayez une autre zone ou élargissez la recherche. (Le moteur privilégie les formations les plus pertinentes.)
            </p>
          </div>
        )}

        <div className="mt-auto border-t border-gray-200 p-4 bg-white">
          <div className="text-[10px] text-center text-gray-400 mt-2">
            Propulsé par moteur de pertinence OCAPIAT (scoring + rayon adaptatif)
          </div>
        </div>
      </div>

      {/* MAP */}
      <div className="flex-1 relative bg-gray-200">
        {isLoading && <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-30" />}
        <FormationMap ref={mapRef} formations={formations} onFormationClick={handleFormationClick} />
      </div>
    </div>
  );
}

export default App;
