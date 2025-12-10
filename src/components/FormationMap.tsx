import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
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
          <Marker
            key={index}
            position={[formation.lat!, formation.lon!]}
            icon={createCustomIcon(formation.niveau)}
            eventHandlers={{
              click: () => onFormationClick?.(formation)
            }}
          >
            <Popup>
              <div className="p-2 min-w-[220px]">
                <h3 className="font-bold text-sm mb-2">{formation.intitule}</h3>

                <div className="space-y-1 text-xs">
                  <div>
                    <span className="font-medium text-gray-700">Organisme:</span>
                    <p className="text-gray-600">{formation.organisme}</p>
                  </div>

                  <div>
                    <span className="font-medium text-gray-700">Localisation:</span>
                    <p className="text-gray-600">{formation.ville}, {formation.region}</p>
                  </div>

                  <div>
                    <span className="font-medium text-gray-700">Niveau:</span>
                    <span className={`ml-1 px-2 py-0.5 rounded text-xs font-bold ${
                      formation.niveau === '3' ? 'bg-[#74114D]/10 text-[#74114D]' :
                      formation.niveau === '4' ? 'bg-[#F5A021]/10 text-[#F5A021]' :
                      'bg-[#47A152]/10 text-[#47A152]'
                    }`}>
                      N{formation.niveau}
                    </span>
                  </div>

                  <div>
                    <span className="font-medium text-gray-700">RNCP:</span>
                    <span className="ml-1 text-gray-600">
                      {formation.rncp || 'Non renseigné'}
                    </span>
                  </div>

                  <div>
                    <span className="font-medium text-gray-700">Type:</span>
                    <span className="ml-1 text-gray-600">{formation.type}</span>
                  </div>

                  <div>
                    <span className="font-medium text-gray-700">Modalité:</span>
                    <span className="ml-1 text-gray-600">
                      {formation.modalite || 'Non renseigné'}
                    </span>
                  </div>

                  {formation.site_web ? (
                    <div>
                      <span className="font-medium text-gray-700">Site:</span>
                      <a
                        href={formation.site_web}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1 text-[#F5A021] hover:text-[#e69116] underline font-semibold"
                      >
                        Voir le site
                      </a>
                    </div>
                  ) : (
                    <div>
                      <span className="font-medium text-gray-700">Site:</span>
                      <span className="ml-1 text-gray-400">Non renseigné</span>
                    </div>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    );
  }
);

FormationMap.displayName = 'FormationMap';
