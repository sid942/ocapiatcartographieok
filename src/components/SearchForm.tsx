import { useState, useEffect } from 'react';
import { Search, MapPin } from 'lucide-react';
import { METIERS, Metier, NominatimResult } from '../types';
import { searchCities } from '../services/nominatim';

interface SearchFormProps {
  onSearch: (metier: Metier, ville: string, niveau: '4' | '5' | '6' | 'all') => void;
  isLoading: boolean;
}

export function SearchForm({ onSearch, isLoading }: SearchFormProps) {
  const [metier, setMetier] = useState<Metier>(METIERS[0]);
  const [ville, setVille] = useState('');
  const [niveau, setNiveau] = useState<'4' | '5' | '6' | 'all'>('all');
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (ville.length >= 2) {
        const results = await searchCities(ville);
        setSuggestions(results);
        setShowSuggestions(true);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [ville]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (metier && ville) {
      onSearch(metier, ville, niveau);
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (suggestion: NominatimResult) => {
    const cityName = suggestion.display_name.split(',')[0].trim();
    setVille(cityName);
    setShowSuggestions(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Métier
        </label>
        <select
          value={metier}
          onChange={(e) => setMetier(e.target.value as Metier)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#47A152] focus:border-transparent"
        >
          {METIERS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

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

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Niveau
        </label>
        <select
          value={niveau}
          onChange={(e) => setNiveau(e.target.value as '4' | '5' | '6' | 'all')}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#47A152] focus:border-transparent"
        >
          <option value="all">Tous</option>
          <option value="4">Niveau 4 (Bac)</option>
          <option value="5">Niveau 5 (Bac+2)</option>
          <option value="6">Niveau 6 (Bac+3/4)</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={isLoading || !ville}
        className="w-full bg-[#F5A021] hover:bg-[#e69116] disabled:bg-gray-400 text-white font-bold py-2.5 px-4 rounded-lg transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 text-sm"
      >
        <Search className="h-4 w-4" />
        {isLoading ? 'Recherche...' : 'Rechercher'}
      </button>
    </form>
  );
}
