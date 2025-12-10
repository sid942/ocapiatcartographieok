import { useState } from 'react';
import { ExternalLink, MapPin, Building2, Award, FileText, BookOpen, Briefcase } from 'lucide-react';
import { Formation } from '../types';

interface FormationListProps {
  formations: Formation[];
  onFormationClick?: (formation: Formation) => void;
}

export function FormationList({ formations, onFormationClick }: FormationListProps) {
  // Ajout du filtre niveau 3 (CAP)
  const [niveauFilter, setNiveauFilter] = useState<'all' | '3' | '4' | '5' | '6'>('all');

  const filteredFormations = formations.filter(
    f => niveauFilter === 'all' || f.niveau === niveauFilter
  );

  const sortedFormations = [...filteredFormations].sort((a, b) => {
    const niveauA = a.niveau && !isNaN(parseInt(a.niveau)) ? parseInt(a.niveau) : 999;
    const niveauB = b.niveau && !isNaN(parseInt(b.niveau)) ? parseInt(b.niveau) : 999;
    return niveauA - niveauB;
  });

  const getLevelColor = (niveau: string | null) => {
    switch (niveau) {
      case '3': return 'bg-[#74114D]/10 text-[#74114D] border-[#74114D]/30'; // CAP/CQP
      case '4': return 'bg-[#F5A021]/10 text-[#F5A021] border-[#F5A021]/30'; // Bac
      case '5': return 'bg-[#47A152]/10 text-[#47A152] border-[#47A152]/30'; // Bac+2
      case '6': return 'bg-[#47A152]/10 text-[#47A152] border-[#47A152]/30'; // Bac+3
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between sticky top-0 bg-white py-2 z-10 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-900">
          {sortedFormations.length} formation{sortedFormations.length > 1 ? 's' : ''}
        </h2>
        <select
          value={niveauFilter}
          onChange={(e) => setNiveauFilter(e.target.value as any)}
          className="px-2 py-1 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-[#47A152] outline-none"
        >
          <option value="all">Tous niveaux</option>
          <option value="3">Niv. 3 (CAP)</option>
          <option value="4">Niv. 4 (Bac)</option>
          <option value="5">Niv. 5 (Bac+2)</option>
          <option value="6">Niv. 6 (Bac+3/+4)</option>
        </select>
      </div>

      <div className="space-y-2">
        {sortedFormations.map((formation, index) => (
          <div
            key={index}
            onClick={() => onFormationClick?.(formation)}
            className="bg-gray-50 rounded-lg border border-gray-200 p-3 hover:bg-white hover:shadow-lg hover:border-[#47A152] transition-all cursor-pointer group"
          >
            {/* Header Carte : Titre + Niveau */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="font-bold text-gray-900 text-sm flex-1 leading-tight group-hover:text-[#47A152] transition-colors">
                {formation.intitule}
              </h3>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap uppercase tracking-wide ${getLevelColor(formation.niveau)}`}>
                {formation.niveau && !isNaN(parseInt(formation.niveau)) 
                  ? `NIV. ${formation.niveau}` 
                  : (formation.niveau || 'N/A')}
              </span>
            </div>

            {/* Corps Carte : Détails */}
            <div className="space-y-1.5 text-xs text-gray-600">
              
              {/* Organisme */}
              <div className="flex items-start gap-2">
                <Building2 className="h-3.5 w-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
                <span className="font-medium text-gray-700">{formation.organisme}</span>
              </div>

              {/* Ville + Distance (Seulement si < 900km pour éviter les bugs) */}
              <div className="flex items-start gap-2">
                <MapPin className="h-3.5 w-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
                <div className="flex items-center gap-2">
                  <span>{formation.ville}</span>
                  {formation.distance_km !== undefined && formation.distance_km < 900 && (
                    <span className="bg-gray-200 text-gray-700 px-1.5 rounded text-[10px] font-semibold">
                      {formation.distance_km} km
                    </span>
                  )}
                </div>
              </div>

              {/* RNCP */}
              <div className="flex items-start gap-2">
                <Award className="h-3.5 w-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
                <span title="Répertoire National des Certifications Professionnelles">
                  RNCP&nbsp;: {formation.rncp && formation.rncp !== 'Non renseigné' ? (
                    <span className="font-mono text-gray-700">{formation.rncp}</span>
                  ) : 'Non renseigné'}
                </span>
              </div>

              {/* Catégorie (Diplôme/Titre) */}
              <div className="flex items-start gap-2">
                <FileText className="h-3.5 w-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
                <span>{formation.categorie || 'Diplôme / Titre'}</span>
              </div>

              {/* Alternance (Demande spécifique Ocapiat) */}
              <div className="flex items-start gap-2">
                <Briefcase className="h-3.5 w-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
                <span className={formation.alternance === 'Oui' ? 'text-[#47A152] font-semibold' : ''}>
                  Alternance&nbsp;: {formation.alternance || (formation.modalite?.includes('Apprentissage') ? 'Oui' : 'Non')}
                </span>
              </div>

              {/* Lien Site Web */}
              {formation.site_web ? (
                <div className="flex items-start gap-2 pt-1">
                  <ExternalLink className="h-3.5 w-3.5 mt-0.5 text-[#F5A021] flex-shrink-0" />
                  <a
                    href={formation.site_web}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[#F5A021] hover:text-[#e69116] hover:underline font-semibold"
                  >
                    Voir le site de l'école
                  </a>
                </div>
              ) : (
                <div className="flex items-start gap-2 pt-1 opacity-50">
                  <ExternalLink className="h-3.5 w-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
                  <span className="italic">Site web non référencé</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}