import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { Building2, MapPin, Award, FileText, Briefcase, ExternalLink } from "lucide-react";
import type { Formation } from "../types";
import "leaflet/dist/leaflet.css";

interface FormationMapProps {
  formations: Formation[];
  onFormationClick?: (formation: Formation) => void;
}

export interface FormationMapRef {
  flyToFormation: (formation: Formation) => void;
}

function normalizeNiveau(n: string | undefined | null): "3" | "4" | "5" | "6" | "N/A" {
  const s = (n ?? "").toString().trim();
  if (s === "3" || s === "4" || s === "5" || s === "6") return s;
  return "N/A";
}

function formationKey(f: Formation, idx: number) {
  if (f.id) return f.id;
  return `${f.intitule}|${f.organisme}|${f.ville ?? ""}|${idx}`;
}

const createCustomIcon = (niveau: "3" | "4" | "5" | "6" | "N/A") => {
  const colors: Record<string, string> = {
    "3": "#74114D",
    "4": "#F5A021",
    "5": "#47A152",
    "6": "#47A152",
    "N/A": "#6B7280",
  };

  const color = colors[niveau] ?? colors["N/A"];

  return L.divIcon({
    className: "custom-marker",
    html: `
      <div style="
        background-color: ${color};
        width: 26px;
        height: 26px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      "></div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
};

const getLevelColor = (niveau: "3" | "4" | "5" | "6" | "N/A") => {
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
};

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function clampText(s: string, max = 110) {
  const t = (s ?? "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

function computeAlternance(f: Formation): "Oui" | "Non" {
  if (f.alternance === "Oui") return "Oui";
  if (f.alternance === "Non") return "Non";

  const m = (f.modalite ?? "").toLowerCase();
  if (m.includes("apprentissage") || m.includes("alternance")) return "Oui";
  return "Non";
}

/**
 * Nettoie l'intitulé :
 * - garde le diplôme (parenthèse finale) dans le titre principal
 * - retire la spécialité du titre (SPE / ":" / " - ")
 * - renvoie specialty à afficher en petit dessous
 */
function splitIntitule(intitule: string): { titleMain: string; specialty?: string } {
  const raw = (intitule ?? "").toString().trim();
  if (!raw) return { titleMain: "" };

  // extrait la dernière parenthèse finale (souvent le diplôme)
  let diplomaSuffix = "";
  let base = raw;

  const diplomaMatch = base.match(/\s*\(([^)]+)\)\s*$/);
  if (diplomaMatch?.[0]) {
    diplomaSuffix = diplomaMatch[0].trim();
    base = base.slice(0, base.length - diplomaMatch[0].length).trim();
  }

  // spécialité via "SPE" / "SPECIALITE"
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

  // split sur ":"
  if (base.includes(":")) {
    const [left, ...rest] = base.split(":");
    const right = rest.join(":").trim();
    const main = `${left.trim()}${diplomaSuffix ? " " + diplomaSuffix : ""}`.trim();
    const specialty = right ? right : undefined;
    return { titleMain: main, specialty };
  }

  // split sur " - "
  if (base.includes(" - ")) {
    const [left, ...rest] = base.split(" - ");
    const right = rest.join(" - ").trim();
    const main = `${left.trim()}${diplomaSuffix ? " " + diplomaSuffix : ""}`.trim();
    const specialty = right ? right : undefined;
    return { titleMain: main, specialty };
  }

  return { titleMain: `${base}${diplomaSuffix ? " " + diplomaSuffix : ""}`.trim() };
}

function buildWhyText(f: Formation, distLabel: string | null) {
  const reasons = Array.isArray(f.match?.reasons) ? f.match!.reasons : [];
  const score = typeof f.match?.score === "number" ? f.match!.score : null;

  const lines: string[] = [];
  lines.push("Pourquoi cette formation ?");
  if (reasons.length > 0) {
    for (const r of reasons.slice(0, 4)) lines.push(`• ${r}`);
  } else {
    lines.push("• Correspondance globale avec votre recherche");
  }

  if (score !== null) lines.push(`• Score de pertinence : ${score}`);
  if (distLabel) lines.push(`• Distance : ${distLabel}`);

  return lines.join("\n");
}

function MapBounds({ formations }: { formations: Formation[] }) {
  const map = useMap();

  useEffect(() => {
    if (!formations.length) return;

    const bounds = L.latLngBounds(
      formations.map((f) => [f.lat as number, f.lon as number] as [number, number])
    );

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [formations, map]);

  return null;
}

function MapController({ selected }: { selected: Formation | null }) {
  const map = useMap();

  useEffect(() => {
    if (!selected) return;
    if (typeof selected.lat !== "number" || typeof selected.lon !== "number") return;

    map.flyTo([selected.lat, selected.lon], 12, { duration: 1.5 });
  }, [selected, map]);

  return null;
}

function FormationMarker({
  formation,
  isSelected,
  onFormationClick,
}: {
  formation: Formation;
  isSelected: boolean;
  onFormationClick?: (formation: Formation) => void;
}) {
  const markerRef = useRef<L.Marker>(null);
  const [whyOpen, setWhyOpen] = useState(false);

  useEffect(() => {
    if (isSelected && markerRef.current) {
      markerRef.current.openPopup();
    }
  }, [isSelected]);

  const niveauNorm = normalizeNiveau(formation.niveau);

  const rncp = formation.rncp ?? "Non renseigné";
  const categorie = formation.categorie ?? "Diplôme / Titre";
  const alternance = computeAlternance(formation);

  const villeLabel = formation.ville ?? "Ville non renseignée";

  const distOk = typeof formation.distance_km === "number" && formation.distance_km < 900;
  const distLabel = distOk ? `${round1(formation.distance_km)} km` : null;

  const { titleMain, specialty } = splitIntitule(formation.intitule || "");
  const whyText = buildWhyText(formation, distLabel);

  return (
    <Marker
      ref={markerRef}
      position={[formation.lat as number, formation.lon as number]}
      icon={createCustomIcon(niveauNorm)}
      eventHandlers={{
        click: () => onFormationClick?.(formation),
      }}
    >
      <Popup>
        <div className="p-3 min-w-[280px] max-w-[340px]">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2">
                <h3 className="font-bold text-gray-900 text-sm leading-tight break-words">
                  {titleMain || formation.intitule}
                </h3>

                {/* "?" why */}
                <div className="relative flex-shrink-0">
                  <button
                    type="button"
                    aria-label="Pourquoi cette formation ?"
                    className="mt-0.5 h-5 w-5 rounded-full border border-gray-300 text-[11px] font-bold text-gray-600 hover:text-gray-900 hover:border-gray-400 bg-white flex items-center justify-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      setWhyOpen((v) => !v);
                    }}
                    onMouseEnter={() => setWhyOpen(true)}
                    onMouseLeave={() => setWhyOpen(false)}
                  >
                    ?
                  </button>

                  {whyOpen && (
                    <div
                      className="absolute right-0 mt-2 w-[260px] bg-white border border-gray-200 rounded-lg shadow-xl p-2 z-50"
                      onClick={(e) => e.stopPropagation()}
                      onMouseEnter={() => setWhyOpen(true)}
                      onMouseLeave={() => setWhyOpen(false)}
                      role="tooltip"
                    >
                      <div className="text-[11px] text-gray-800 whitespace-pre-line leading-snug">
                        {whyText}
                      </div>
                    </div>
                  )}
                </div>

                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap uppercase tracking-wide ${getLevelColor(
                    niveauNorm
                  )}`}
                >
                  {niveauNorm === "N/A" ? "N/A" : `NIV. ${niveauNorm}`}
                </span>
              </div>

              {/* Spécialité discrète */}
              {specialty && (
                <div className="mt-0.5 text-[11px] text-gray-500 leading-snug">
                  <span className="italic">Spécialité :</span> {clampText(specialty, 95)}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5 text-xs text-gray-600">
            <div className="flex items-start gap-2">
              <Building2 className="h-3.5 w-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
              <span className="font-medium text-gray-700">{formation.organisme}</span>
            </div>

            <div className="flex items-start gap-2">
              <MapPin className="h-3.5 w-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
              <div className="flex items-center gap-2">
                <span>{villeLabel}</span>
                {distLabel && (
                  <span className="bg-gray-200 text-gray-700 px-1.5 rounded text-[10px] font-semibold">
                    {distLabel}
                  </span>
                )}
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
      </Popup>
    </Marker>
  );
}

export const FormationMap = forwardRef<FormationMapRef, FormationMapProps>(({ formations, onFormationClick }, ref) => {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const validFormations = useMemo(
    () => formations.filter((f) => typeof f.lat === "number" && typeof f.lon === "number"),
    [formations]
  );

  const center: [number, number] = [46.603354, 1.888334];

  const selectedFormation = useMemo(() => {
    if (!selectedKey) return null;
    const idx = validFormations.findIndex((f, i) => formationKey(f, i) === selectedKey);
    return idx >= 0 ? validFormations[idx] : null;
  }, [selectedKey, validFormations]);

  useImperativeHandle(ref, () => ({
    flyToFormation: (formation: Formation) => {
      if (typeof formation.lat !== "number" || typeof formation.lon !== "number") return;

      const idx = validFormations.findIndex((f, i) => {
        if (formation.id && f.id && formation.id === f.id) return true;
        return formationKey(f, i) === formationKey(formation, i);
      });

      if (idx >= 0) setSelectedKey(formationKey(validFormations[idx], idx));
    },
  }));

  return (
    <MapContainer center={center} zoom={6} className="h-full w-full" style={{ height: "100vh" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {validFormations.length > 0 && <MapBounds formations={validFormations} />}
      <MapController selected={selectedFormation} />

      {validFormations.map((formation, index) => {
        const key = formationKey(formation, index);
        return (
          <FormationMarker
            key={key}
            formation={formation}
            isSelected={selectedKey === key}
            onFormationClick={onFormationClick}
          />
        );
      })}
    </MapContainer>
  );
});

FormationMap.displayName = "FormationMap";
