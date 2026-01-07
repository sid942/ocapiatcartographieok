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

function clampText(s: string, max = 110) {
  const t = (s ?? "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Nettoie l'intitulé pour :
 * - garder le "diplôme" entre parenthèses à la fin (ex: (BTSA), (BTS), (BUT))
 * - retirer la spécialité du gros titre (SPE / ":" / " - ")
 * - afficher la spécialité en petit dessous
 */
function splitIntitule(intitule: string): { titleMain: string; specialty?: string } {
  const raw = (intitule ?? "").toString().trim();
  if (!raw) return { titleMain: "" };

  // 1) extrait la dernière parenthèse finale (souvent le diplôme)
  let diplomaSuffix = "";
  let base = raw;

  const diplomaMatch = base.match(/\s*\(([^)]+)\)\s*$/);
  if (diplomaMatch?.[0]) {
    diplomaSuffix = diplomaMatch[0].trim(); // ex: "(BTSA)"
    base = base.slice(0, base.length - diplomaMatch[0].length).trim();
  }

  // 2) cherche une spécialité via "SPE" / "SPECIALITE"
  const speMatch = base.match(/\b(SPE|SPECIALITE)\b/i);
  if (speMatch?.index !== undefined) {
    const left = base.slice(0, speMatch.index).trim();
    const right = base
      .slice(speMatch.index + speMatch[0].length)
      .replace(/^[:\-–—]\s*/g, "")
      .trim();

    const main = `${left}${diplomaSuffix ? " " + diplomaSuffix : ""}`.trim();
    const specialty = right ? right : undefined;
    return { titleMain: main, specialty };
  }

  // 3) sinon, split sur ":" (ex: TECHNIQUES DE COMMERCIALISATION : BUSINESS INTERNATIONAL)
  if (base.includes(":")) {
    const [left, ...rest] = base.split(":");
    const right = rest.join(":").trim();
    const main = `${left.trim()}${diplomaSuffix ? " " + diplomaSuffix : ""}`.trim();
    const specialty = right ? right : undefined;
    return { titleMain: main, specialty };
  }

  // 4) sinon, split sur " - " (moins agressif)
  if (base.includes(" - ")) {
    const [left, ...rest] = base.split(" - ");
    const right = rest.join(" - ").trim();
    const main = `${left.trim()}${diplomaSuffix ? " " + diplomaSuffix : ""}`.trim();
    const specialty = right ? right : undefined;
    return { titleMain: main, specialty };
  }

  // 5) fallback : titre complet (avec diplôme)
  return { titleMain: `${base}${diplomaSuffix ? " " + diplomaSuffix : ""}`.trim() };
}

function buildWhyText(f: Formation, distLabel: string) {
  const reasons = Array.isArray(f.match?.reasons) ? f.match!.reasons : [];
  const score = typeof f.match?.score === "number" ? f.match!.score : null;

  const lines: string[] = [];
  lines.push("Pourquoi cette formation ?");
  if (reasons.length > 0) {
    // on garde quelques raisons max
    for (const r of reasons.slice(0, 4)) lines.push(`• ${r}`);
  } else {
    lines.push("• Correspondance globale avec votre recherche");
  }

  if (score !== null) lines.push(`• Score de pertinence : ${score}`);
  if (distLabel) lines.push(`• Distance : ${distLabel}`);

  return lines.join("\n");
}

export function FormationList({ formations, onFormationClick }: FormationListProps) {
  const [niveauFilter, setNiveauFilter] = useState<NiveauFilter>("all");
  const [whyOpenId, setWhyOpenId] = useState<string | null>(null);

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

          const hasDistance =
            typeof formation.distance_km === "number" && formation.distance_km < 900;

          const rncp = formation.rncp ?? "Non renseigné";
          const categorie = formation.categorie ?? "Diplôme / Titre";
          const alternance = computeAlternance(formation);

          const villeLabel = formation.ville ?? "Ville non renseignée";
          const distLabel = hasDistance ? `${round1(formation.distance_km)} km` : "Non géolocalisé";

          const { titleMain, specialty } = splitIntitule(formation.intitule || "");

          const whyText = buildWhyText(formation, distLabel);
          const hasWhy = true; // on l'affiche toujours, même si reasons vides

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
                    <h3 className="font-bold text-gray-900 text-sm leading-tight group-hover:text-[#47A152] transition-colors break-words">
                      {titleMain || formation.intitule}
                    </h3>

                    {hasWhy && (
                      <div className="relative flex-shrink-0">
                        <button
                          type="button"
                          aria-label="Pourquoi cette formation ?"
                          className="mt-0.5 h-5 w-5 rounded-full border border-gray-300 text-[11px] font-bold text-gray-600 hover:text-gray-900 hover:border-gray-400 bg-white flex items-center justify-center"
                          onClick={(e) => {
                            e.stopPropagation();
                            setWhyOpenId((prev) => (prev === key ? null : key));
                          }}
                          onMouseEnter={() => setWhyOpenId(key)}
                          onMouseLeave={() => setWhyOpenId((prev) => (prev === key ? null : prev))}
                        >
                          ?
                        </button>

                        {whyOpenId === key && (
                          <div
                            className="absolute right-0 mt-2 w-[260px] bg-white border border-gray-200 rounded-lg shadow-xl p-2 z-20"
                            onClick={(e) => e.stopPropagation()}
                            onMouseEnter={() => setWhyOpenId(key)}
                            onMouseLeave={() => setWhyOpenId((prev) => (prev === key ? null : prev))}
                            role="tooltip"
                          >
                            <div className="text-[11px] text-gray-800 whitespace-pre-line leading-snug">
                              {whyText}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap uppercase tracking-wide ${getLevelColor(
                        niveauNorm
                      )}`}
                    >
                      {niveauNorm === "N/A" ? "N/A" : `NIV. ${niveauNorm}`}
                    </span>
                  </div>

                  {/* Spécialité (discrète) */}
                  {specialty && (
                    <div className="mt-0.5 text-[11px] text-gray-500 leading-snug">
                      <span className="italic">Spécialité :</span> {clampText(specialty, 90)}
                    </div>
                  )}
                </div>
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
