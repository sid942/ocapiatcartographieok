import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Building2, MapPin, Award, FileText, Briefcase, ExternalLink } from 'lucide-react';
import { Formation } from '../types';
import 'leaflet/dist/leaflet.css';

interface FormationMapProps {
  formations: Formation[];
  onFormationClick?: (formation: Formation) => void;
}

export interface FormationMapRef {
  flyToFormation: (formation: Formation) => void;
}

const createCustomIcon = (niveau: '3' | '4' | '5' | '6') => {
  const colors = {
    '3': '#74114D',
    '4': '#F5A021',
    '5': '#47A152',
    '6': '#47A152'
  };

  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        background-color: ${colors[niveau]};
        width: 26px;
        height: 26px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      "></div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });
};

const getLevelColor = (niveau: string | null) => {
  switch (niveau) {
    case '3': return 'bg-[#74114D]/10 text-[#74114D] border-[#74114D]/30';
    case '4': return 'bg-[#F5A021]/10 text-[#F5A021] border-[#F5A021]/30';
    case '5': return 'bg-[#47A152]/10 text-[#47A152] border-[#47A152]/30';
    case '6': return 'bg-[#47A152]/10 text-[#47A152] border-[#47A152]/30';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

function MapBounds({ formations }: { formations: Formation[] }) {
  const map = useMap();

  useEffect(() => {
    if (formations.length > 0) {
      const validFormations = formations.filter(f => f.lat && f.lon);
      if (validFormations.length > 0) {
        const bounds = L.latLngBounds(
          validFormations.map(f => [f.lat!, f.lon!])
        );
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [formations, map]);

  return null;
}

function MapController({ selectedFormation }: { selectedFormation: Formation | null }) {
  const map = useMap();

  useEffect(() => {
    if (selectedFormation && selectedFormation.lat && selectedFormation.lon) {
      map.flyTo([selectedFormation.lat, selectedFormation.lon], 12, {
        duration: 1.5
      });
    }
  }, [selectedFormation, map]);

  return null;
}

function FormationMarker({
  formation,
  isSelected,
  onFormationClick
}: {
  formation: Formation;
  isSelected: boolean;
  onFormationClick?: (formation: Formation) => void;
}) {
  const markerRef = useRef<L.Marker>(null);

  useEffect(() => {
    if (isSelected && markerRef.current) {
      markerRef.current.openPopup();
    }
  }, [isSelected]);

  return (
    <Marker
      ref={markerRef}
      position={[formation.lat!, formation.lon!]}
      icon={createCustomIcon(formation.niveau)}
      eventHandlers={{
        click: () => onFormationClick?.(formation)
      }}
    >
      <Popup>
        <div className="p-3 min-w-[280px] max-w-[320px]">
          <div className="flex items-start justify-between gap-2 mb-3">
            <h3 className="font-bold text-gray-900 text-sm flex-1 leading-tight">
              {formation.intitule}
            </h3>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap uppercase tracking-wide ${getLevelColor(formation.niveau)}`}>
              {formation.niveau && !isNaN(parseInt(formation.niveau))
                ? `NIV. ${formation.niveau}`
                : (formation.niveau || 'N/A')}
            </span>
          </div>

          <div className="space-y-1.5 text-xs text-gray-600">
            <div className="flex items-start gap-2">
              <Building2 className="h-3.5 w-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
              <span className="font-medium text-gray-700">{formation.organisme}</span>
            </div>

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

            <div className="flex items-start gap-2">
              <Award className="h-3.5 w-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
              <span title="Répertoire National des Certifications Professionnelles">
                RNCP&nbsp;: {formation.rncp && formation.rncp !== 'Non renseigné' ? (
                  <span className="font-mono text-gray-700">{formation.rncp}</span>
                ) : 'Non renseigné'}
              </span>
            </div>

            <div className="flex items-start gap-2">
              <FileText className="h-3.5 w-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
              <span>{formation.categorie || 'Diplôme / Titre'}</span>
            </div>

            <div className="flex items-start gap-2">
              <Briefcase className="h-3.5 w-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
              <span className={formation.alternance === 'Oui' ? 'text-[#47A152] font-semibold' : ''}>
                Alternance&nbsp;: {formation.alternance || (formation.modalite?.includes('Apprentissage') ? 'Oui' : 'Non')}
              </span>
            </div>

            {formation.site_web ? (
              <div className="flex items-start gap-2 pt-1">
                <ExternalLink className="h-3.5 w-3.5 mt-0.5 text-[#F5A021] flex-shrink-0" />
                <a
                  href={formation.site_web}
                  target="_blank"
                  rel="noopener noreferrer"
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
      </Popup>
    </Marker>
  );
}

export const FormationMap = forwardRef<FormationMapRef, FormationMapProps>(
  ({ formations, onFormationClick }, ref) => {
    const [selectedFormation, setSelectedFormation] = useState<Formation | null>(null);
    const validFormations = formations.filter(f => f.lat && f.lon);
    const center: [number, number] = [46.603354, 1.888334];

    useImperativeHandle(ref, () => ({
      flyToFormation: (formation: Formation) => {
        setSelectedFormation(formation);
      }
    }));

    return (
      <MapContainer
        center={center}
        zoom={6}
        className="h-full w-full"
        style={{ height: '100vh' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {validFormations.length > 0 && <MapBounds formations={validFormations} />}
        <MapController selectedFormation={selectedFormation} />
        {validFormations.map((formation, index) => (
          <FormationMarker
            key={index}
            formation={formation}
            isSelected={selectedFormation?.intitule === formation.intitule && selectedFormation?.organisme === formation.organisme}
            onFormationClick={onFormationClick}
          />
        ))}
      </MapContainer>
    );
  }
);

FormationMap.displayName = 'FormationMap';
