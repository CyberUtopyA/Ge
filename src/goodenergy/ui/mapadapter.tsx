// File: src/goodenergy/ui/map/MapAdapter.tsx
import React, { useMemo, useRef } from "react";
import { View, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";

export type LatLng = { latitude: number; longitude: number };

type MarkerProps = {
  coordinate: LatLng;
  title?: string;
  description?: string;
  pinColor?: string;
};
type CircleProps = {
  center: LatLng;
  radius: number; // meters
  strokeColor?: string;
  fillColor?: string;
};

export const PROVIDER_GOOGLE = "leaflet-webview"; // placeholder para compatibilidad

// Componentes "marcadores" vacíos: solo sirven para pasar props a MapView
export const Marker: React.FC<MarkerProps> = () => null;
export const Circle: React.FC<CircleProps> = () => null;

type MapViewProps = {
  style?: any;
  provider?: any;
  initialRegion?: {
    latitude: number; longitude: number; latitudeDelta?: number; longitudeDelta?: number;
  };
  onRegionChangeComplete?: (r: { latitude: number; longitude: number }) => void;
  children?: React.ReactNode;
};

export const MapView: React.FC<MapViewProps> = ({
  style,
  initialRegion,
  onRegionChangeComplete,
  children,
}) => {
  // Recolectar hijos Marker / Circle
  const markers: MarkerProps[] = [];
  const circles: CircleProps[] = [];
  React.Children.forEach(children, (ch: any) => {
    if (!ch) return;
    if (ch.type && ch.type.name === "Marker") markers.push(ch.props);
    if (ch.type && ch.type.name === "Circle") circles.push(ch.props);
  });

  const center = initialRegion ?? {
    latitude: -34.6037, longitude: -58.3816, // Buenos Aires default
  };

  const html = useMemo(() => {
    const mks = JSON.stringify(
      markers.map(m => ({
        lat: m.coordinate.latitude,
        lng: m.coordinate.longitude,
        title: m.title || "",
        desc: m.description || "",
        color: m.pinColor || "#1dd1a1",
      }))
    );
    const cirs = JSON.stringify(
      circles.map(c => ({
        lat: c.center.latitude,
        lng: c.center.longitude,
        radius: c.radius,
        stroke: c.strokeColor || "rgba(100,160,255,0.9)",
        fill: c.fillColor || "rgba(120,170,255,0.15)",
      }))
    );
    const c = JSON.stringify({ lat: center.latitude, lng: center.longitude });

    // HTML + Leaflet (CDN OSM)
    return `
<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  html, body, #map { margin:0; padding:0; width:100%; height:100%; background:#0b0f14; }
  .leaflet-container { background:#0b0f14; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  const center = ${c};
  const map = L.map('map', { zoomControl: false }).setView([center.lat, center.lng], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom: 19, attribution: '&copy; OSM'
  }).addTo(map);

  const markers = ${mks};
  markers.forEach(m=>{
    const pin = L.circleMarker([m.lat,m.lng], {radius:8, color:m.color, fillColor:m.color, fillOpacity:0.9});
    pin.addTo(map);
    if (m.title || m.desc) pin.bindPopup('<b>'+m.title+'</b><br/>'+m.desc);
  });

  const circles = ${cirs};
  circles.forEach(c=>{
    L.circle([c.lat, c.lng], { radius: c.radius, color: c.stroke, fillColor: c.fill, fillOpacity: 0.35 }).addTo(map);
  });

  map.on('moveend', ()=>{
    const ctr = map.getCenter();
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
      type:'region', latitude: ctr.lat, longitude: ctr.lng
    }));
  });

</script>
</body>
</html>
`;
  }, [markers, circles, center.latitude, center.longitude]);

  const webref = useRef<WebView>(null);

  return (
    <View style={[styles.wrap, style]}>
      <WebView
        ref={webref}
        originWhitelist={["*"]}
        source={{ html }}
        onMessage={(ev) => {
          try {
            const msg = JSON.parse(ev.nativeEvent.data);
            if (msg?.type === "region") {
              onRegionChangeComplete?.({ latitude: msg.latitude, longitude: msg.longitude });
            }
          } catch {}
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { overflow: "hidden", borderRadius: 12, flex: 1 },
});

export default MapView;
