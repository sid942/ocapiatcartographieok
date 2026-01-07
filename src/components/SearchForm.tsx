import { useEffect, useMemo, useRef, useState } from "react";
import { Search, MapPin, AlertCircle, CheckCircle2 } from "lucide-react";
import { METIERS, MetierKey, NominatimResult, NiveauFiltre } from "../types";
import { searchCities } from "../services/nominatim";

interface SearchFormProps {
  onSearch: (metierKey: MetierKey, ville: string, niveau: NiveauFiltre) => void;
  isLoading: boolean;
}

function normalizeCityLabel(displayName: string) {
  // On garde le nom principal (avant la première virgule)
  return displayName.split(",")[0].trim();
}

/**
 * Anti "Mont" / "St" etc.
 * - On laisse taper, mais on refuse la soumission si c'est ambigu et non validé par suggestion.
 */
function isAmbiguousCityInput(v: string) {
  const s = v.trim().toLowerCase();

  // Trop court = ambigu
  if (s.length < 4) return true;

  // cas classiques (st/ste/saint)
  if (s === "st" || s === "ste" || s === "saint" || s === "sainte") return true;

  // "mont" seul -> ambigu (Montélimar/Montauban/Montpellier/Mont-de-Marsan…)
  if (s === "mont") return true;

  // "st " / "ste " / "mont " => ambigu
  if (s.startsWith("st ") || s.startsWith("ste ") || s.startsWith("mont ")) return true;

  return false;
}

export function SearchForm({ onSearch, isLoading }: SearchFormProps) {
  const safeDefaultMetierKey = (METIERS[0]?.key ?? "silo") as MetierKey;

  const [metierKey, setMetierKey] = useState<MetierKey>(safeDefaultMetierKey);
  const [ville, setVille] = useState("");
  const [niveau, setNiveau] = useState<NiveauFiltre>("all");

  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // ✅ Ville validée (= cliquée dans les suggestions)
  const [selectedCity, setSelectedCity] = useState<{
    label: string; // ex "Montélimar"
    display_name: string;
    place_id: number;
  } | null>(null);

  const [error, setError] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);

  const metierLabel = useMemo(() => {
    return METIERS.find((m) => m.key === metierKey)?.label ?? "";
  }, [metierKey]);

  // ✅ Si l'utilisateur modifie au clavier après avoir sélectionné une ville,
  // on considère qu'elle n'est plus "validée".
  useEffect(() => {
    if (!selectedCity) return;
    const v = ville.trim();
    if (v && v !== selectedCity.label) {
      setSelectedCity(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ville]);

  // Autocomplete ville (debounce 300ms) + anti-race condition
  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      const q = ville.trim();

      // reset erreur quand on retape
      if (!cancelled) setError(null);

      if (q.length < 2) {
        if (!cancelled) {
          setSuggestions([]);
          setShowSuggestions(false);
        }
        return;
      }

      try {
        const results = await searchCities(q);

        if (!cancelled) {
          // On garde des suggestions mais on évite de spammer l’UI
          setSuggestions(results ?? []);
          setShowSuggestions(true);
        }
      } catch {
        if (!cancelled) {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ville]);

  // ✅ Click dehors => ferme suggestions
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    const v = ville.trim();
    if (!v) {
      setError("Merci d’indiquer une ville.");
      return;
    }

    // ✅ Anti-villes ambiguës : on exige une sélection suggestion
    // pour éviter les “Mont” ou “St” qui font n’importe quoi côté géocodage.
    const ambiguous = isAmbiguousCityInput(v);

    if (ambiguous && !selectedCity) {
      setError(
        "Ville trop ambiguë. Clique une suggestion (ex: “Montélimar”, “Montauban”, “Montpellier”…)."
      );
      setShowSuggestions(true);
      return;
    }

    // ✅ Si on a une ville validée, on envoie la version propre
    const villeToSend = selectedCity?.label ?? v;

    onSearch(metierKey, villeToSend, niveau);
    setShowSuggestions(false);
  };

  const handleSuggestionClick = (suggestion: NominatimResult) => {
    const cityName = normalizeCityLabel(suggestion.display_name);

    setVille(cityName);
    setSelectedCity({
      label: cityName,
      display_name: suggestion.display_name,
      place_id: suggestion.place_id,
    });

    setError(null);
    setShowSuggestions(false);
  };

  const canSubmit =
    !isLoading &&
    ville.trim().length > 0 &&
    // si c'est ambigu, il faut une sélection
    (!isAmbiguousCityInput(ville) || !!selectedCity);

  return (
    <div ref={rootRef}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Métier */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Métier</label>

          <select
            value={metierKey}
            onChange={(e) => setMetierKey(e.target.value as MetierKey)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#47A152] focus:border-transparent"
            aria-label="Sélection du métier"
          >
            {METIERS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>

          <div className="mt-1 text-[11px] text-gray-500">Sélection : {metierLabel}</div>
        </div>

        {/* Ville */}
        <div className="relative">
          <label className="block text-xs font-medium text-gray-700 mb-1">Ville</label>

          <div className="relative">
            <input
              type="text"
              value={ville}
              onChange={(e) => setVille(e.target.value)}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              placeholder="Ex: Montpellier, Montélimar, Brest…"
              className="w-full px-3 py-2 pl-8 pr-10 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#47A152] focus:border-transparent"
              required
              aria-label="Ville"
              aria-expanded={showSuggestions && suggestions.length > 0}
              aria-autocomplete="list"
            />
            <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />

            {/* ✅ indicateur ville validée */}
            {selectedCity ? (
              <CheckCircle2 className="absolute right-2.5 top-2.5 h-4 w-4 text-green-600" />
            ) : null}
          </div>

          {/* ✅ message d’état sous le champ */}
          <div className="mt-1 text-[11px]">
            {selectedCity ? (
              <div className="text-green-700 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Ville reconnue : <span className="font-medium">{selectedCity.label}</span>
              </div>
            ) : isAmbiguousCityInput(ville) && ville.trim().length > 0 ? (
              <div className="text-amber-700 flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                Ville ambiguë : choisis une suggestion.
              </div>
            ) : (
              <div className="text-gray-500">Astuce : clique une suggestion pour éviter les erreurs.</div>
            )}
          </div>

          {showSuggestions && suggestions.length > 0 && (
            <div
              className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-56 overflow-y-auto"
              role="listbox"
            >
              {suggestions.slice(0, 8).map((suggestion) => (
                <button
                  key={suggestion.place_id}
                  type="button"
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="w-full px-3 py-2 text-left hover:bg-gray-100 border-b border-gray-100 last:border-b-0"
                  role="option"
                >
                  <div className="text-xs">{suggestion.display_name}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ✅ Erreur */}
        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Niveau */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Niveau</label>
          <select
            value={niveau}
            onChange={(e) => setNiveau(e.target.value as NiveauFiltre)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#47A152] focus:border-transparent"
            aria-label="Niveau"
          >
            <option value="all">Tous</option>
            <option value="3">Niveau 3 (CAP, BEP)</option>
            <option value="4">Niveau 4 (Bac)</option>
            <option value="5">Niveau 5 (Bac+2)</option>
            <option value="6">Niveau 6 (Bac+3/4)</option>
          </select>
        </div>

        {/* CTA */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full bg-[#F5A021] hover:bg-[#e69116] disabled:bg-gray-400 text-white font-bold py-2.5 px-4 rounded-lg transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 text-sm"
        >
          <Search className="h-4 w-4" />
          {isLoading ? "Recherche..." : "Rechercher"}
        </button>
      </form>
    </div>
  );
}
