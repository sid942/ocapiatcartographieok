import { useMemo, useState } from "react";
import { ExternalLink, MapPin, Building2, Award, FileText, Briefcase, HelpCircle } from "lucide-react";
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
 * Objectif: éviter l'effet "honte" :
 * - On affiche un titre principal "générique" (avant ":" / "-" / " (")
 * - La spécialité / mention (après ":" ou le contenu entre parenthèses) => en petit dessous
 */
function splitIntitule(raw: string | undefined | null): { title: string; subtitle?: string } {
  const s = (raw ?? "").toString().trim();
  if (!s) return { title: "Formation" };

  // Ex: "TECHNIQUES DE COMMERCIALISATION : BUSINESS ..." => title="TECHNIQUES DE COMMERCIALISATION", subtitle="BUSINESS ..."
  const colonIdx = s.indexOf(":");
  if (colonIdx > 6) {
    const left = s.slice(0, colonIdx).trim();
    const right = s.slice(colonIdx + 1).trim();
    if (left && right) return { title: left, subtitle: right };
  }

  // Ex: "XYZ (BTSA)" => title="XYZ", subtitle="BTSA"
  const mParen = s.match(/^(.*)\(([^)]+)\)\s*$/);
  if (mParen?.[1]?.trim() && mParen?.[2]?.trim()) {
    const t = mParen[1].trim();
    const sub = mParen[2].trim();
    return { title: t, subtitle: sub };
  }

  // Ex: "XYZ - option ..." => title="XYZ", subtitle="option ..."
  const dashIdx = s.indexOf(" - ");
  if (dashIdx > 6) {
    const left = s.slice(0, dashIdx).trim();
    const right = s.slice(dashIdx + 3).trim();
    if (left && right) return { title: left, subtitle: right };
  }

  return { title: s };
}

function formatReasons(reasons: any): string[] {
  if (!Array.isArray(reasons)) return [];
  return reasons
    .map((r) => (r ?? "").toString().trim())
    .filter(Boolean)
    .slice(0, 6);
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

    // Tri "humain" :
    // 1) géolocalisées d’abord (distance_km < 900)
    // 2) distance croissante
    // 3) si distance ~ égale, meilleur score d’abord (si disponible)
    // 4) si encore égal, niveau croissant (3->6, puis N/A)
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

          const { title, subtitle } = splitIntitule(formation.intitule);
          const reasons = formatReasons(formation.match?.reasons);
          const score = typeof formation.match?.score === "number" ? formation.match.score : null;

          const whyOpen = openWhyKey === key;

          return (
            <div
              key={key}
              onClick={() => onFormationClick?.(formation)}
              className="bg-gray-50 rounded-lg border border-gray-200 p-3 hover:bg-white hover:shadow-lg hover:border-[#47A152] transition-all cursor-pointer group relative"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900 text-sm leading-tight group-hover:text-[#47A152] transition-colors">
                    {title}
                  </h3>

                  {/* Spé en TOUT petit dessous */}
                  {subtitle ? (
                    <div className="mt-0.5 text-[11px] text-gray-500 leading-snug line-clamp-2">
                      {subtitle}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* "?" pourquoi cette formation */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenWhyKey((prev) => (prev === key ? null : key));
                    }}
                    className="p-1 rounded-md hover:bg-gray-200 text-gray-500 hover:text-gray-700"
                    aria-label="Pourquoi cette formation ?"
                    title="Pourquoi cette formation ?"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </button>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap uppercase tracking-wide ${getLevelColor(
                      niveauNorm
                    )}`}
                  >
                    {niveauNorm === "N/A" ? "N/A" : `NIV. ${niveauNorm}`}
                  </span>
                </div>
              </div>

              {/* Popup "Pourquoi" */}
              {whyOpen ? (
                <div
                  className="mb-2 rounded-lg border border-gray-200 bg-white p-2 text-[11px] text-gray-700 shadow-sm"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">Pourquoi cette formation ?</div>
                    {score !== null ? (
                      <div className="text-[10px] font-bold text-gray-600">Score&nbsp;: {score}</div>
                    ) : null}
                  </div>

                  {reasons.length ? (
                    <ul className="mt-1 list-disc pl-4 space-y-0.5">
                      {reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-1 text-gray-500 italic">Raisons non disponibles.</div>
                  )}

                  <div className="mt-1 text-gray-500">
                    Astuce&nbsp;: si c’est trop loin, la distance est pénalisée et la formation descend dans la liste.
                  </div>
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
