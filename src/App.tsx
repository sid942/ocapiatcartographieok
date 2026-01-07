import { useRef, useState } from "react";
import { AlertCircle, Loader2, MapPin } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

import { SearchForm } from "./components/SearchForm";
import { FormationList } from "./components/FormationList";
import { FormationMap, FormationMapRef } from "./components/FormationMap";

import type {
  Formation,
  MetierKey,
  SearchFormationsResponse,
  NiveauFiltre,
  SearchMode,
} from "./types";

// --- CONFIGURATION SUPABASE (idéalement à déplacer dans src/lib/supabase.ts) ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Variables d'environnement Supabase manquantes (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)."
  );
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
// -----------------------------------------------------------------------------

function normalizeForSearch(s: string) {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // retire accents
}

function humanizeMode(mode?: SearchMode) {
  switch (mode) {
    case "strict":
      return { label: "Strict", hint: "Résultats très pertinents uniquement." };

    case "relaxed":
      return {
        label: "Élargi",
        hint: "On garde les plus proches quand c’est trop strict.",
      };

    case "fallback_rome":
      return {
        label: "Secours ROME",
        hint: "ROME élargi pour éviter un résultat vide (le scoring garde la cohérence).",
      };

    case "strict+relaxed":
      return {
        label: "Strict + Élargi",
        hint: "Strict d’abord, puis élargi pour compléter.",
      };

    case "strict+relaxed+fallback_rome":
      return {
        label: "Strict + Élargi + Secours ROME",
        hint: "Tous les filets de sécurité activés.",
      };

    default:
      return null;
  }
}

function App() {
  const mapRef = useRef<FormationMapRef>(null);

  const [formations, setFormations] = useState<Formation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [searchMeta, setSearchMeta] = useState<{
    metier: string;
    ville: string;
    rayon: string;

    // count affiché (après filtre niveau) — correspond à api.count
    count: number;

    // total trouvé avant filtre niveau (si backend le renvoie)
    countTotal?: number;

    mode?: SearchMode;
    debug?: SearchFormationsResponse["debug"];
  } | null>(null);

  const handleSearch = async (metierKey: MetierKey, ville: string, niveau: NiveauFiltre) => {
    setIsLoading(true);
    setError(null);
    setFormations([]);
    setHasSearched(true);
    setSearchMeta(null);

    try {
      const payload = {
        metier: metierKey,
        ville: ville.trim(),
        niveau,
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

      // ✅ on lit count_total de façon safe (même si ton type TS n’est pas encore à jour)
      const rawAny = data as any;
      const countTotal =
        typeof rawAny?.count_total === "number" ? (rawAny.count_total as number) : undefined;

      setSearchMeta({
        metier: api.metier_detecte,
        ville: api.ville_reference,
        rayon: api.rayon_applique,

        count: typeof api.count === "number" ? api.count : results.length,
        countTotal,

        mode: api.mode,
        debug: api.debug,
      });

      // Zoom auto sur la première formation géolocalisée
      if (mapRef.current && results.length > 0) {
        const firstGeo = results.find(
          (f) => typeof f.lat === "number" && typeof f.lon === "number"
        );
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
    if (typeof formation.lat === "number" && typeof formation.lon === "number" && mapRef.current) {
      mapRef.current.flyToFormation(formation);
    }
  };

  const showEmptyState = !isLoading && formations.length === 0 && !error && hasSearched;

  const isExpandedRadius =
    !!searchMeta?.rayon && normalizeForSearch(searchMeta.rayon).includes("elargi");

  const modeInfo = humanizeMode(searchMeta?.mode);
  const isNonStrictMode = !!searchMeta?.mode && searchMeta.mode !== "strict";

  const emptyStateMessage = (() => {
    const dbg = searchMeta?.debug;
    const raw = dbg?.raw_count_last ?? undefined;
    const keptStrict = dbg?.kept_count_strict_last ?? undefined;

    if (typeof raw === "number" && raw === 0) {
      return "Aucune formation trouvée dans la base pour cette zone. Essayez une ville plus grande ou un métier voisin.";
    }

    if (typeof raw === "number" && raw > 0 && typeof keptStrict === "number" && keptStrict === 0) {
      return "Des formations existent, mais aucune n’a passé le filtre de pertinence. Essayez d’élargir la zone ou de choisir un métier voisin.";
    }

    return "Essayez une autre zone ou élargissez la recherche. (Le moteur privilégie les formations les plus pertinentes.)";
  })();

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
        {searchMeta && !isLoading && !error && (
          <div className="mx-4 mb-4 bg-[#47A152]/10 border border-[#47A152]/30 rounded-lg p-3 shadow-sm">
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center border-b border-[#47A152]/20 pb-1">
                <span className="text-gray-600">Métier identifié :</span>
                <span className="font-bold text-[#74114D] text-right">{searchMeta.metier}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-600">Zone de recherche :</span>
                <span className="font-semibold text-gray-800 text-right flex items-center gap-1 justify-end">
                  <MapPin className="h-3 w-3 text-[#47A152]" />
                  {searchMeta.ville}
                </span>
              </div>

              <div className="flex justify-between items-center text-[10px] text-gray-500 italic">
                <span>Rayon appliqué :</span>
                <span>{searchMeta.rayon}</span>
              </div>

              {isExpandedRadius && (
                <div className="text-[10px] text-gray-500 italic pt-1 border-t border-[#47A152]/20">
                  Rayon élargi automatiquement pour proposer assez de formations.
                </div>
              )}

              {modeInfo && (
                <div className="text-[10px] text-gray-500 italic pt-1 border-t border-[#47A152]/20">
                  Mode pertinence : <span className="font-semibold">{modeInfo.label}</span>
                  {modeInfo.hint ? (
                    <span className="block text-gray-500/90 mt-0.5">{modeInfo.hint}</span>
                  ) : null}
                </div>
              )}
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
              {formations.length} formation(s) affichée(s)
              {typeof searchMeta?.countTotal === "number" &&
              searchMeta.countTotal !== formations.length ? (
                <span className="normal-case font-normal ml-1 text-gray-400">
                  (sur {searchMeta.countTotal})
                </span>
              ) : null}
            </div>

            {/* Si mode non strict, avertissement “humain” */}
            {isNonStrictMode && (
              <div className="mb-3 text-[11px] text-gray-600 bg-yellow-50 border border-yellow-200 rounded-md p-2">
                Un mode de secours a été activé pour éviter un résultat vide. Les premiers résultats restent les plus proches
                et les plus cohérents.
              </div>
            )}

            <FormationList formations={formations} onFormationClick={handleFormationClick} />
          </div>
        )}

        {showEmptyState && (
          <div className="px-4 py-8 text-center bg-gray-50 mx-4 rounded-lg border border-dashed border-gray-300">
            <p className="text-sm font-bold text-gray-900 mb-1">Aucune formation trouvée</p>
            <p className="text-xs text-gray-500">{emptyStateMessage}</p>
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
