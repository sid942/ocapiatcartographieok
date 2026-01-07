import { useMemo, useState } from "react";
import { ExternalLink, MapPin, Building2, Award, FileText, Briefcase } from "lucide-react";
import type { Formation } from "../types";

interface FormationListProps {
  formations: Formation[];
  onFormationClick?: (formation: Formation) => void;
}

type NiveauFilter = "all" | "3" | "4" | "5" | "6" | "na";

function normalizeNiveau(n: string | undefined | null): "3" | "4" | "5" | "6" | "N/A" {
  const s = (n ?? "").toString().trim();
  if (s === "3" || s === "4" || s === "5" || s === "6") return s;
  return "N/A";
}

function getLevelColor(niveau: string) {
  switch (niveau) {
    case "3":
      return "bg-[#74114D]/10 text-[#74114D] border-[#74114D]/30";
    case "4":
      return "bg-[#F5A021]/10 text-[#F5A021] border-[#F5A021]/30";
    case "5":
      return "bg-[#47A152]/10 text-[#47A152] border-[#47A152]/30";
    case "6":
      return "bg-[#47A152]/10 text-[#47A152] border-[#47A152]/30";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}

function formationKey(f: Formation, idx: number) {
  // Priorité à un id stable si dispo
  if (f.id) return f.id;
  // Sinon hash simple basé sur les champs affichés
  return `${f.intitule}|${f.organisme}|${f.ville}|${idx}`;
}

export function FormationList({ formations, onFormationClick }: FormationListProps) {
  const [niveauFilter, setNiveauFilter] = useState<NiveauFilter>("all");

  const sortedFormations = useMemo(() => {
    const filtered = formations.filter((f) => {
      const n = normalizeNiveau(f.niveau);
      if (niveauFilter === "all") return true;
      if (niveauFilter === "na") return n === "N/A";
      return n === niveauFilter;
    });

    // Tri “humain” : d’abord géolocalisées, puis distance, puis niveau
    return [...filtered].sort((a, b) => {
      const da = typeof a.distance_km === "number" ? a.distance_km : 9999;
      const db = typeof b.distance_km === "number" ? b.distance_km : 9999;
      if (da !== db) return da - db;

      const na = normalizeNiveau(a.niveau);
      const nb = normalizeNiveau(b.niveau);
      const ia = na === "N/A" ? 999 : parseInt(na, 10);
      const ib = nb === "N/A" ? 999 : parseInt(nb, 10);
      return ia - ib;
    });
  }, [formations, niveauFilter]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between sticky top-0 bg-white py-2 z-10 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-900">
          {sortedFormations.length} formation{sortedFormations.length > 1 ? "s" : ""}
        </h2>

        <select
          value={niveauFilter}
          onChange={(e) => setNiveauFilter(e.target.value as NiveauFilter)}
          className="px-2 py-1 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-[#47A152] outline-none"
        >
          <option value="all">Tous niveaux</option>
          <option value="3">Niv. 3 (CAP/BEP)</option>
          <option value="4">Niv. 4 (Bac)</option>
          <option value="5">Niv. 5 (Bac+2)</option>
          <option value="6">Niv. 6 (Bac+3/4)</option>
          <option value="na">Niveau non renseigné</option>
        </select>
      </div>

      <div className="space-y-2">
        {sortedFormations.map((formation, index) => {
          const niveauNorm = normalizeNiveau(formation.niveau);
          const hasDistance = typeof formation.distance_km === "number" && formation.distance_km < 900;

          const rncp = formation.rncp ?? "Non renseigné";
          const categorie = formation.categorie ?? "Diplôme / Titre";
          const alternance = formation.alternance ?? "Non";

          return (
            <div
              key={formationKey(formation, index)}
              onClick={() => onFormationClick?.(formation)}
              className="bg-gray-50 rounded-lg border border-gray-200 p-3 hover:bg-white hover:shadow-lg hover:border-[#47A152] transition-all cursor-pointer group"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-bold text-gray-900 text-sm flex-1 leading-tight group-hover:text-[#47A152] transition-colors">
                  {formation.intitule}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap uppercase tracking-wide ${getLevelColor(
                    niveauNorm
                  )}`}
                >
                  {niveauNorm === "N/A" ? "N/A" : `NIV. ${niveauNorm}`}
                </span>
              </div>

              {/* Détails */}
              <div className="space-y-1.5 text-xs text-gray-600">
                <div className="flex items-start gap-2">
                  <Building2 className="h-3.5 w-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
                  <span className="font-medium text-gray-700">{formation.organisme}</span>
                </div>

                <div className="flex items-start gap-2">
                  <MapPin className="h-3.5 w-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
                  <div className="flex items-center gap-2">
                    <span>{formation.ville}</span>
                    {hasDistance ? (
                      <span className="bg-gray-200 text-gray-700 px-1.5 rounded text-[10px] font-semibold">
                        {formation.distance_km} km
                      </span>
                    ) : (
                      <span className="bg-gray-100 text-gray-500 px-1.5 rounded text-[10px] font-semibold">
                        Non géolocalisé
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <Award className="h-3.5 w-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
                  <span title="Répertoire National des Certifications Professionnelles">
                    RNCP&nbsp;:{" "}
                    {rncp !== "Non renseigné" ? <span className="font-mono text-gray-700">{rncp}</span> : "Non renseigné"}
                  </span>
                </div>

                <div className="flex items-start gap-2">
                  <FileText className="h-3.5 w-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
                  <span>{categorie}</span>
                </div>

                <div className="flex items-start gap-2">
                  <Briefcase className="h-3.5 w-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
                  <span className={alternance === "Oui" ? "text-[#47A152] font-semibold" : ""}>
                    Alternance&nbsp;: {alternance}
                  </span>
                </div>

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
                      Voir le site de l&apos;école
                    </a>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 pt-1 opacity-50">
                    <ExternalLink className="h-3.5 w-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
                    <span className="italic">Site web non référencé</span>
                  </div>
                )}

                {/* (Optionnel) futur "?" : si match.reasons existe, tu pourras l’afficher en tooltip */}
                {/* {formation.match?.reasons?.length ? (...) : null} */}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
