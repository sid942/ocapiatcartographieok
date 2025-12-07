import { useState } from 'react';
import { ExternalLink, MapPin, GraduationCap, Building2, Award, FileText, BookOpen } from 'lucide-react';
import { Formation } from '../types';

interface FormationListProps {
  formations: Formation[];
  onFormationClick?: (formation: Formation) => void;
}

export function FormationList({ formations, onFormationClick }: FormationListProps) {
  const [niveauFilter, setNiveauFilter] = useState<'all' | '4' | '5' | '6'>('all');

  const filteredFormations = formations.filter(
    f => niveauFilter === 'all' || f.niveau === niveauFilter
  );

  const sortedFormations = [...filteredFormations].sort((a, b) => {
    const niveauA = a.niveau ? parseInt(a.niveau) : 999;
    const niveauB = b.niveau ? parseInt(b.niveau) : 999;
    return niveauA - niveauB;
  });

  const getLevelColor = (niveau: string | null) => {
    switch (niveau) {
      case '4': return 'bg-blue-100 text-blue-800 border-blue-200';
      case '5': return 'bg-orange-100 text-orange-800 border-orange-200';
      case '6': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getLevelLabel = (niveau: string | null) => {
    switch (niveau) {
      case '4': return 'Bac';
      case '5': return 'Bac+2';
      case '6': return 'Bac+3/4';
      case null: return 'N/A';
      default: return niveau;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between sticky top-0 bg-white py-2 z-10">
        <h2 className="text-sm font-bold text-gray-900">
          {sortedFormations.length} formation{sortedFormations.length > 1 ? 's' : ''}
        </h2>
        <select
          value={niveauFilter}
          onChange={(e) => setNiveauFilter(e.target.value as 'all' | '4' | '5' | '6')}
          className="px-2 py-1 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-[#EB600A]"
        >
          <option value="all">Tous</option>
          <option value="4">Niv. 4</option>
          <option value="5">Niv. 5</option>
          <option value="6">Niv. 6</option>
        </select>
      </div>

      <div className="space-y-2">
        {sortedFormations.map((formation, index) => (
          <div
            key={index}
            onClick={() => onFormationClick?.(formation)}
            className="bg-gray-50 rounded-lg border border-gray-200 p-3 hover:bg-white hover:shadow-lg hover:border-[#EB600A] transition-all cursor-pointer"
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="font-semibold text-gray-900 text-xs flex-1 leading-tight">
                {formation.intitule}
              </h3>
              <span className={`px-1.5 py-0.5 rounded text-xs font-medium border whitespace-nowrap ${getLevelColor(formation.niveau)}`}>
                {formation.niveau ? `N${formation.niveau}` : 'N/A'}
              </span>
            </div>

            <div className="space-y-1.5 text-xs text-gray-600">
              <div className="flex items-start gap-1.5">
                <Building2 className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span className="line-clamp-1">{formation.organisme}</span>
              </div>

              <div className="flex items-start gap-1.5">
                <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span className="line-clamp-1">{formation.ville}, {formation.region}</span>
              </div>

              <div className="flex items-start gap-1.5">
                <Award className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>
                  RNCP : {formation.rncp || 'Non renseigné'}
                </span>
              </div>

              <div className="flex items-start gap-1.5">
                <FileText className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span className="inline-block px-1.5 py-0.5 bg-white text-gray-700 rounded border border-gray-200">
                  {formation.type}
                </span>
              </div>

              <div className="flex items-start gap-1.5">
                <BookOpen className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>
                  Modalité : {formation.modalite || 'Non renseigné'}
                </span>
              </div>

              {formation.distance_km !== undefined && (
                <div className="flex items-start gap-1.5">
                  <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span className="font-medium text-[#EB600A]">
                    Distance : {formation.distance_km} km
                  </span>
                </div>
              )}

              {formation.site_web ? (
                <div className="flex items-start gap-1.5">
                  <ExternalLink className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <a
                    href={formation.site_web}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    Voir le site
                  </a>
                </div>
              ) : (
                <div className="flex items-start gap-1.5">
                  <ExternalLink className="h-3 w-3 mt-0.5 flex-shrink-0 text-gray-400" />
                  <span className="text-gray-400">Site : Non renseigné</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
