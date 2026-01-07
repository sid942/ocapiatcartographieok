import { useMemo, useState } from "react";
import {
  ExternalLink,
  MapPin,
  Building2,
  Award,
  FileText,
  Briefcase,
  CircleHelp,
} from "lucide-react";
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

function round1(n: number) {
  return Math.round(n * 10) / 10;
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
  if (f.id) return f.id;
  return `${f.intitule}|${f.organisme}|${f.ville ?? ""}|${idx}`;
}

function computeAlternance(f: Formation): "Oui" | "Non" {
  if (f.alternance === "Oui") return "Oui";
  if (f.alternance === "Non") return "Non";

  const m = (f.modalite ?? "").toLowerCase();
  if (m.includes("apprentissage") || m.includes("alternance")) return "Oui";
  return "Non";
}

/**
 * Objectif :
 * - Titre principal propre (sans "SPE", "SPECIALITE", etc.)
 * - Spé en petit dessous
 */
function splitTitle(intitule: string): { main: string; sub: string | null } {
  const t = (intitule ?? "").toString().trim();
  if (!t) return { main: "Formation", sub: null };

  // 1) Si ":" => souvent domaine : spécialisation
  const colonIdx = t.indexOf(" : ");
  if (colonIdx > 4 && colonIdx < t.length - 4) {
    return {
      main: t.slice(0, colonIdx).trim(),
      sub: t.slice(colonIdx + 3).trim() || null,
    };
  }

  // 2) Si parenthèses + reste après => on met tout ce qui est "entre()" + le reste en sub
  const openIdx = t.indexOf("(");
  const closeIdx = t.indexOf(")");
  if (openIdx >= 0 && closeIdx > openIdx) {
    const before = t.slice(0, openIdx).trim();
    const inside = t.slice(openIdx + 1, closeIdx).trim();
    const after = t.slice(closeIdx + 1).trim();

    const subParts = [inside, after].filter(Boolean);
    const sub = subParts.length ? subParts.join(" — ") : null;

    // Si le titre avant parenthèse est trop court, on garde tout en main
    if (before && before.length >= 6) return { main: before, sub };
  }

  // 3) Si " SPE " / "SPECIALITE" / "OPTION" / "PARCOURS"
  const patterns = [" SPE ", " SPECIALITE ", " SPÉCIALITÉ ", " OPTION ", " PARCOURS "];
  const upper = t.toUpperCase();
  for (const p of patterns) {
    const idx = upper.indexOf(p);
    if (idx > 6 && idx < t.length - 6) {
      return {
        main: t.slice(0, idx).trim(),
        sub: t.slice(idx).trim() || null,
      };
    }
  }

  return { main: t, sub: null };
}

function getWhyReasons(f: Formation): string[] {
  const reasons = (f.match?.reasons ?? [])
    .map((x) => (x ?? "").toString().trim())
    .filter(Boolean);

  if (reasons.length) return reasons.slice(0, 3);

  // fallback propre si rien
  return ["Résultat pertinent selon votre recherche"];
}

export function FormationList({ formations, onFormationClick }: FormationListProps) {
  const [niveauFilter, setNiveauFilter] = useState<NiveauFilter>("all");
  const [openWhyKey, setOpenWhyKey] = useState<string | null>(null);

  const sortedFormations = useMemo(() => {
    const filtered = formations.filter((f) => {
      const n = normalizeNiveau(f.niveau);
      if (niveauFilter === "all") return true;
      if (niveauFilter === "na") return n === "N/A";
      return n === niveauFilter;
    });

    // Tri "humain"
    return [...filtered].sort((a, b) => {
      const da = typeof a.distance_km === "number" ? a.distance_km : 9999;
      const db = typeof b.distance_km === "number" ? b.distance_km : 9999;

      const geoA = da < 900 ? 0 : 1;
      const geoB = db < 900 ? 0 : 1;
      if (geoA !== geoB) return geoA - geoB;

      if (da !== db) return da - db;

      const sa = typeof a.match?.score === "number" ? a.match.score : -1;
      const sb = typeof b.match?.score === "number" ? b.match.score : -1;
      if (sa !== sb) return sb - sa;

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
          const key = formationKey(formation, index);
          const niveauNorm = normalizeNiveau(formation.niveau);

          const hasDistance = typeof formation.distance_km === "number" && formation.distance_km < 900;

          const rncp = formation.rncp ?? "Non renseigné";
          const categorie = formation.categorie ?? "Diplôme / Titre";
          const alternance = computeAlternance(formation);

          const villeLabel = formation.ville ?? "Ville non renseignée";
          const distLabel = hasDistance ? `${round1(formation.distance_km)} km` : "Non géolocalisé";

          const { main, sub } = splitTitle(formation.intitule);
          const whyOpen = openWhyKey === key;
          const whyReasons = getWhyReasons(formation);

          return (
            <div
              key={key}
              onClick={() => onFormationClick?.(formation)}
              className="bg-gray-50 rounded-lg border border-gray-200 p-3 hover:bg-white hover:shadow-lg hover:border-[#47A152] transition-all cursor-pointer group"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2">
                    <h3 className="font-bold text-gray-900 text-sm leading-tight group-hover:text-[#47A152] transition-colors">
                      {main}
                    </h3>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenWhyKey((prev) => (prev === key ? null : key));
                      }}
                      className="mt-0.5 inline-flex items-center justify-center rounded hover:bg-gray-200/60 p-1"
                      title="Pourquoi cette formation ?"
                      aria-label="Pourquoi cette formation ?"
                    >
                      <CircleHelp className="h-4 w-4 text-gray-500" />
                    </button>
                  </div>

                  {sub ? <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">{sub}</div> : null}
                </div>

                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap uppercase tracking-wide ${getLevelColor(
                    niveauNorm
                  )}`}
                >
                  {niveauNorm === "N/A" ? "N/A" : `NIV. ${niveauNorm}`}
                </span>
              </div>

              {/* WHY (toggle) */}
              {whyOpen ? (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="mb-2 rounded-md border border-gray-200 bg-white p-2"
                >
                  <div className="text-[11px] font-bold text-gray-800 mb-1">Pourquoi cette formation ?</div>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-gray-700">
                    {whyReasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* Détails */}
              <div className="space-y-1.5 text-xs text-gray-600">
                <div className="flex items-start gap-2">
                  <Building2 className="h-3.5 w-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
                  <span className="font-medium text-gray-700">{formation.organisme}</span>
                </div>

                <div className="flex items-start gap-2">
                  <MapPin className="h-3.5 w-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
                  <div className="flex items-center gap-2">
                    <span>{villeLabel}</span>
                    <span
                      className={`px-1.5 rounded text-[10px] font-semibold ${
                        hasDistance ? "bg-gray-200 text-gray-700" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {distLabel}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <Award className="h-3.5 w-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
                  <span title="Répertoire National des Certifications Professionnelles">
                    RNCP&nbsp;:{" "}
                    {rncp !== "Non renseigné" ? (
                      <span className="font-mono text-gray-700">{rncp}</span>
                    ) : (
                      "Non renseigné"
                    )}
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
