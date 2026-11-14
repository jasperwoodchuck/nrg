import { useEffect } from 'react'
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

export type LocationPoint = { latitude: number; longitude: number }

function MapClick({ onSelect }: { onSelect: (point: LocationPoint) => void }) {
  useMapEvents({
    click(event) {
      onSelect({ latitude: event.latlng.lat, longitude: event.latlng.lng })
    },
  })
  return null
}

function Recenter({ point }: { point: LocationPoint }) {
  const map = useMap()
  useEffect(() => {
    map.setView([point.latitude, point.longitude], map.getZoom(), { animate: false })
    const resizeTimer = window.setTimeout(() => map.invalidateSize(), 0)
    return () => window.clearTimeout(resizeTimer)
  }, [map, point.latitude, point.longitude])
  return null
}

export default function LocationPicker({ point, onSelect }: { point: LocationPoint; onSelect: (point: LocationPoint) => void }) {
  return (
    <MapContainer className="location-map" center={[point.latitude, point.longitude]} zoom={5} scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapClick onSelect={onSelect} />
      <Recenter point={point} />
      <CircleMarker center={[point.latitude, point.longitude]} radius={9} pathOptions={{ color: '#f7fff9', weight: 3, fillColor: '#347a55', fillOpacity: 1 }} />
    </MapContainer>
  )
}
