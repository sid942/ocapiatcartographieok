import { useEffect, useMemo, useState } from "react";
import { Search, MapPin } from "lucide-react";
import { METIERS, MetierKey, NominatimResult } from "../types";
import { searchCities } from "../services/nominatim";

type Niveau = "3" | "4" | "5" | "6" | "all";

interface SearchFormProps {
  // IMPORTANT : on envoie une clé métier stable au backend
  onSearch: (metierKey: MetierKey, ville: string, niveau: Niveau) => void;
  isLoading: boolean;
}

export function SearchForm({ onSearch, isLoading }: SearchFormProps) {
  const defaultMetierKey = METIERS[0]?.key ?? "silo";

  const [metierKey, setMetierKey] = useState<MetierKey>(defaultMetierKey);
  const [ville, setVille] = useState("");
  const [niveau, setNiveau] = useState<Niveau>("all");

  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const metierLabel = useMemo(() => {
    return METIERS.find((m) => m.key === metierKey)?.label ?? "";
  }, [metierKey]);

  // Autocomplete ville (debounce 300ms)
  useEffect(() => {
    const timer = setTimeout(async () => {
      const q = ville.trim();
      if (q.length >= 2) {
        try {
          const results = await searchCities(q);
          setSuggestions(results);
          setShowSuggestions(true);
        } catch {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [ville]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = ville.trim();
    if (!v) return;

    // On envoie la clé métier stable + ville + niveau
    onSearch(metierKey, v, niveau);
    setShowSuggestions(false);
  };

  const handleSuggestionClick = (suggestion: NominatimResult) => {
    // On garde juste le nom principal (souvent la commune)
    const cityName = suggestion.display_name.split(",")[0].trim();
    setVille(cityName);
    setShowSuggestions(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Métier */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Métier
        </label>

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

        {/* Optionnel : petit rappel du label choisi (utile en debug / accessibilité) */}
        <div className="mt-1 text-[11px] text-gray-500">
          Sélection : {metierLabel}
        </div>
      </div>

      {/* Ville */}
      <div className="relative">
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Ville, département, région
        </label>

        <div className="relative">
          <input
            type="text"
            value={ville}
            onChange={(e) => setVille(e.target.value)}
            placeholder="Paris, Lyon, Toulouse..."
            className="w-full px-3 py-2 pl-8 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#47A152] focus:border-transparent"
            required
            aria-label="Ville"
          />
          <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
        </div>

        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.place_id}
                type="button"
                onClick={() => handleSuggestionClick(suggestion)}
                className="w-full px-3 py-2 text-left hover:bg-gray-100 border-b border-gray-100 last:border-b-0"
              >
                <div className="text-xs">{suggestion.display_name}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Niveau */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Niveau
        </label>
        <select
          value={niveau}
          onChange={(e) => setNiveau(e.target.value as Niveau)}
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
        disabled={isLoading || ville.trim().length === 0}
        className="w-full bg-[#F5A021] hover:bg-[#e69116] disabled:bg-gray-400 text-white font-bold py-2.5 px-4 rounded-lg transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 text-sm"
      >
        <Search className="h-4 w-4" />
        {isLoading ? "Recherche..." : "Rechercher"}
      </button>
    </form>
  );
}
