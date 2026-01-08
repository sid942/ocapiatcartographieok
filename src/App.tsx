import { useMemo, useRef, useState } from "react";
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

// --- CONFIGURATION SUPABASE ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Variables d'environnement Supabase manquantes (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).",
  );
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
// ----------------------------

const DEBUG_CLIENT = false; // mets à true si tu veux voir les payloads

function normalizeForSearch(s: string) {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function humanizeMode(mode?: SearchMode) {
  switch (mode) {
    case "strict":
      return { label: "Strict", hint: "Résultats très pertinents uniquement." };

    case "relaxed":
      return {
        label: "Élargi",
        hint:
          "On assouplit la pertinence pour éviter un résultat vide, en gardant les plus proches en tête.",
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

function shouldShowFallbackBanner(mode?: SearchMode) {
  return !!mode && mode !== "strict";
}

function safeString(x: any): string {
  return typeof x === "string" ? x : "";
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

    // count affiché (après filtre niveau)
    count: number;

    // total trouvé avant filtre niveau
    countTotal?: number;

    mode?: SearchMode;
    warnings?: SearchFormationsResponse["warnings"];
    debug?: SearchFormationsResponse["debug"];
  } | null>(null);

  const handleSearch = async (
    metierKey: MetierKey,
    ville: string,
    niveau: NiveauFiltre,
  ) => {
    // Guard front : si metierKey vide => on refuse (évite "Recherche Générale" côté backend)
    const mk = safeString(metierKey).trim() as MetierKey;
    const v = safeString(ville).trim();

    if (!mk) {
      setError("Métier manquant. Recharge la page et réessaie.");
      return;
    }
    if (!v) {
      setError("Ville manquante. Merci d’indiquer une ville.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setFormations([]);
    setHasSearched(true);
    setSearchMeta(null);

    // ✅ PAYLOAD UNIQUE ET CORRECT : le backend lit body.metier / body.ville / body.niveau
    const payload = {
      metier: mk, // ⚠️ IMPORTANT : "metier" (pas metierKey)
      ville: v,
      niveau,
    };

    if (DEBUG_CLIENT) {
      // Ce log te permet de vérifier en 1 sec si tu envoies bien "metier"
      console.log("🔎 search-formations payload =>", payload);
    }

    try {
      const { data, error: functionError } = await supabase.functions.invoke(
        "search-formations",
        { body: payload },
      );

      if (functionError) {
        throw new Error(
          functionError.message || "Erreur de connexion au serveur (Supabase Functions).",
        );
      }
      if (!data) throw new Error("Réponse serveur vide.");

      // Certaines implémentations renvoient { error: ... }
      if (typeof (data as any)?.error === "string" && (data as any).error) {
        throw new Error((data as any).error);
      }

      const api = data as SearchFormationsResponse;

      const results = Array.isArray(api.formations) ? (api.formations as Formation[]) : [];
      setFormations(results);

      setSearchMeta({
        metier: safeString(api.metier_detecte) || "—",
        ville: safeString(api.ville_reference) || v,
        rayon: safeString(api.rayon_applique) || "—",

        count: typeof api.count === "number" ? api.count : results.length,
        countTotal: typeof api.count_total === "number" ? api.count_total : undefined,

        mode: api.mode,
        warnings: api.warnings,
        debug: api.debug,
      });

      // Zoom auto sur la première formation géolocalisée
      if (mapRef.current && results.length > 0) {
        const firstGeo = results.find(
          (f) => typeof f.lat === "number" && typeof f.lon === "number",
        );
        if (firstGeo) {
          setTimeout(() => mapRef.current?.flyToFormation(firstGeo), 250);
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

  const rayonNormalized = useMemo(
    () => normalizeForSearch(searchMeta?.rayon ?? ""),
    [searchMeta?.rayon],
  );
  const isExpandedRadius = rayonNormalized.includes("elargi") || rayonNormalized.includes("élargi");

  const modeInfo = useMemo(() => humanizeMode(searchMeta?.mode), [searchMeta?.mode]);
  const showFallbackBanner = useMemo(
    () => shouldShowFallbackBanner(searchMeta?.mode),
    [searchMeta?.mode],
  );

  const farResults = !!searchMeta?.warnings?.far_results;
  const geoScore =
    typeof searchMeta?.warnings?.geocode_score === "number"
      ? searchMeta.warnings.geocode_score
      : null;

  const showGeoApprox =
    geoScore !== null &&
    geoScore > 0 &&
    geoScore < 0.55 &&
    normalizeForSearch(searchMeta?.ville ?? "").length <= 10;

  const emptyStateMessage = useMemo(() => {
    const dbg = searchMeta?.debug as any;
    const raw = dbg?.raw_count_last ?? undefined;
    const keptStrict = dbg?.kept_count_strict_last ?? undefined;

    if (typeof raw === "number" && raw === 0) {
      return "Aucune formation trouvée dans la base pour cette zone. Essayez une ville plus grande ou un métier voisin.";
    }

    if (typeof raw === "number" && raw > 0 && typeof keptStrict === "number" && keptStrict === 0) {
      return "Des formations existent, mais aucune n’a passé le filtre de pertinence. Essayez une autre ville proche ou un métier voisin.";
    }

    return "Essayez une autre zone. Le moteur privilégie toujours les formations les plus pertinentes.";
  }, [searchMeta?.debug]);

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
                <span className="font-bold text-[#74114D] text-right">
                  {searchMeta.metier}
                </span>
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

              {!rayonNormalized.includes("elargi automatiquement") && isExpandedRadius && (
                <div className="text-[10px] text-gray-500 italic pt-1 border-t border-[#47A152]/20">
                  Rayon élargi automatiquement pour proposer assez de formations.
                </div>
              )}

              {modeInfo && (
                <div className="text-[10px] text-gray-500 italic pt-1 border-t border-[#47A152]/20">
                  Mode pertinence :{" "}
                  <span className="font-semibold">{modeInfo.label}</span>
                  {modeInfo.hint ? (
                    <span className="block text-gray-500/90 mt-0.5">{modeInfo.hint}</span>
                  ) : null}
                </div>
              )}

              {showGeoApprox && (
                <div className="text-[10px] text-gray-500 italic pt-1 border-t border-[#47A152]/20">
                  Note : localisation approximative. Si besoin, précise la ville (ex : “Montpellier”, “Montélimar”…).
                </div>
              )}

              {farResults && (
                <div className="text-[11px] text-gray-700 bg-white/70 border border-yellow-200 rounded-md p-2 mt-2">
                  Certaines formations sont éloignées : le moteur privilégie les plus proches, mais élargit si nécessaire.
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

            {showFallbackBanner && (
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
