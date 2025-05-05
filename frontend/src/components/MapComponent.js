// src/components/MapComponent.jsx
import React, {
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef
} from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getWildfireData, predictFireSpread } from '../api';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;
const R_EARTH = 3958.8;

// Helpers
function getBrightnessCategory(b) {
  if (b >= 375) return 'Extreme';
  if (b >= 350) return 'Severe';
  if (b >= 325) return 'Moderate';
  return 'Small';
}

// turn a raw confidence string (e.g. "0.41" or "41") into an integer percent
function confidenceToPercent(raw) {
  const n = parseFloat(raw);
  if (isNaN(n)) return 0;
  return n <= 1 ? Math.round(n * 100) : Math.round(n);
}

// bracket into Low/Medium/High for side-panel
function bracketConfidence(pct) {
  if (pct < 40)       return 'Low';
  if (pct < 85)       return 'Medium';
  return 'High';
}

function getSeverityIcon(cat) {
  if (cat === 'Extreme') return '🔥🔥🔥';
  if (cat === 'Severe')  return '🔴🔥';
  if (cat === 'Moderate') return '⚠️';
  return '🌡️';
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R_EARTH * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function reverseGeocode(lat, lon, token) {
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${token}&limit=1`;
    const resp = await fetch(url);
    const { features } = await resp.json();
    return features?.[0]?.place_name || 'Unknown';
  } catch {
    return 'Unknown';
  }
}

const MapComponent = forwardRef(({
  brightnessFilter,
  confidenceFilter,
  onFiresUpdated,
  setIsFetching,
  mapStyle,
  userLocation,
  range,
  onNearbyFiresUpdate
}, ref) => {
  const mapContainerRef = useRef();
  const mapRef          = useRef();
  const clickHandlerRef = useRef();
  const [wildfires, setWildfires] = useState([]);
  const [isPredicting, setIsPredicting] = useState(false);
  const [activePopup, setActivePopup] = useState(null);
  const [firePrediction, setFirePrediction] = useState(null);

  // 1) Fetch & cache data
  const fetchWildfires = async () => {
    setIsFetching(true);
    try {
      const { data } = await getWildfireData();
      const arr = data.data || [];
      setWildfires(arr);
      onFiresUpdated?.(arr.length);
      updateWildfireSource(arr);
    } finally {
      setIsFetching(false);
    }
  };
  useImperativeHandle(ref, () => ({ refreshWildfires: fetchWildfires }), []);

  // 2) Update wildfire layer source
  const updateWildfireSource = (dataArray = wildfires) => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource('wildfires-source');
    if (!src) return;

    const filtered = dataArray.filter(f => {
      // reuse your old category filter logic
      const b = getBrightnessCategory(f.brightness);
      const pct = confidenceToPercent(f.confidence);
      const c = bracketConfidence(pct);
      return (!brightnessFilter || brightnessFilter === b)
          && (!confidenceFilter || confidenceFilter === c);
    });
    onFiresUpdated?.(filtered.length);

    src.setData({
      type: 'FeatureCollection',
      features: filtered.map(f => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [f.longitude, f.latitude] },
        properties: {
          brightnessCat:  getBrightnessCategory(f.brightness),
          confidenceRaw:  f.confidence,
          timestamp:      f.timestamp,
          brightness:     f.brightness,
          latitude:       f.latitude,
          longitude:      f.longitude
        }
      }))
    });
  };

  // 3) User location marker
  const updateUserSource = () => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource('user-source');
    if (!src) return;
    if (!userLocation) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    src.setData({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [userLocation.lng, userLocation.lat] },
        properties: {}
      }]
    });
    const z = map.getZoom();
    map.setCenter([userLocation.lng, userLocation.lat]);
    map.setZoom(z);
  };

  // Helper to convert degrees to cardinal direction
  const getDirectionName = (degrees) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(((degrees % 360) / 45)) % 8;
    return directions[index];
  };

  // Handle fire spread prediction
  const handlePredictFireSpread = async (fireProps) => {
    if (isPredicting) return;
    
    setIsPredicting(true);
    try {
      // Close existing popup
      if (activePopup) {
        activePopup.remove();
      }
      
      const fireData = {
        lat: fireProps.latitude,
        lng: fireProps.longitude,
        brightness: fireProps.brightness
      };
      
      const prediction = await predictFireSpread(fireData);
      setFirePrediction(prediction);
      
      // Only display fire prediction on map if probability >= 10%
      const spreadProbability = prediction.spread_probability * 100;
      if (spreadProbability >= 10) {
        displayFirePrediction(prediction);
      }
      
      // Show prediction results in a new popup
      showPredictionPopup(fireProps, prediction);
    } catch (error) {
      console.error('Failed to predict fire spread:', error);
      // Show error in popup
      const map = mapRef.current;
      if (map) {
        const popup = new mapboxgl.Popup()
          .setLngLat([fireProps.longitude, fireProps.latitude])
          .setHTML(`
            <div class="wildfire-popup">
              <h4>${getSeverityIcon(fireProps.brightnessCat)} ${fireProps.brightnessCat} Fire</h4>
              <p>Error predicting fire spread. Please try again.</p>
            </div>
          `)
          .addTo(map);
        setActivePopup(popup);
      }
    } finally {
      setIsPredicting(false);
    }
  };

  // Display fire prediction on map
  const displayFirePrediction = (prediction) => {
    const map = mapRef.current;
    if (!map) return;
    
    // Remove any existing prediction layers
    if (map.getSource('fire-spread-prediction')) {
      map.removeLayer('fire-spread-direction');
      map.removeLayer('fire-spread-area');
      map.removeLayer('fire-spread-points');
      map.removeSource('fire-spread-prediction');
    }
    
    // Add the prediction source
    map.addSource('fire-spread-prediction', {
      type: 'geojson',
      data: prediction.geojson
    });
    
    // Add the spread area layer
    map.addLayer({
      id: 'fire-spread-area',
      type: 'fill',
      source: 'fire-spread-prediction',
      filter: ['==', ['get', 'type'], 'spread'],
      paint: {
        'fill-color': [
          'interpolate',
          ['linear'],
          ['get', 'probability'],
          0.3, 'rgba(255, 255, 0, 0.2)',
          0.5, 'rgba(255, 165, 0, 0.3)',
          0.7, 'rgba(255, 0, 0, 0.4)'
        ],
        'fill-outline-color': '#ff0000'
      }
    });
    
    // Add the direction arrow layer
    map.addLayer({
      id: 'fire-spread-direction',
      type: 'line',
      source: 'fire-spread-prediction',
      filter: ['==', ['get', 'type'], 'direction'],
      paint: {
        'line-color': '#ff0000',
        'line-width': 2,
        'line-dasharray': [2, 1]
      }
    });
    
    // Add spread points layer
    map.addLayer({
      id: 'fire-spread-points',
      type: 'circle',
      source: 'fire-spread-prediction',
      filter: ['==', ['get', 'type'], 'spread_point'],
      paint: {
        'circle-radius': 4,
        'circle-color': [
          'interpolate',
          ['linear'],
          ['get', 'probability'],
          0.3, '#ffff00',
          0.5, '#ffa500',
          0.7, '#ff0000'
        ],
        'circle-opacity': 0.7
      }
    });
  };

  // Show prediction results in popup
  const showPredictionPopup = (fireProps, prediction) => {
    const map = mapRef.current;
    if (!map) return;
    
    // Get environmental data
    const env = prediction.environmental_data;
    const spreadProbability = Math.round(prediction.spread_probability * 100);
    
    let popupContent = '';
    
    if (spreadProbability < 10) {
      // Simple message for low probability
      popupContent = `
        <div class="wildfire-popup">
          <h4>${getSeverityIcon(fireProps.brightnessCat)} ${fireProps.brightnessCat} Fire</h4>
          <div class="prediction-results">
            <h5>Fire Spread Prediction</h5>
            <p>This fire is unlikely to spread significantly.</p>
            <p><strong>Spread probability:</strong> ${spreadProbability}%</p>
            <div class="env-data">
              <h6>Environmental Factors:</h6>
              <p>Wind: ${env.wind_speed.toFixed(1)} km/h ${getDirectionName(env.wind_direction)}</p>
              <p>Temp: ${env.temperature.toFixed(1)}°C, Humidity: ${env.humidity.toFixed(0)}%</p>
              <p>Data source: ${env.data_source === "weather_api" ? "Real-time weather" : "Estimated"}</p>
            </div>
          </div>
        </div>
      `;
    } else {
      // Determine spread status based on probability thresholds
      let spreadStatus = 'No';
      if (spreadProbability >= 20) {
        spreadStatus = 'Yes';
      } else if (spreadProbability >= 10) {
        spreadStatus = 'Possibly';
      }
      
      // Detailed info for higher probability
      popupContent = `
        <div class="wildfire-popup">
          <h4>${getSeverityIcon(fireProps.brightnessCat)} ${fireProps.brightnessCat} Fire</h4>
          <div class="prediction-results">
            <h5>Fire Spread Prediction</h5>
            <p><strong>Will spread:</strong> ${spreadStatus}</p>
            <p><strong>Spread probability:</strong> ${spreadProbability}%</p>
            <p><strong>Spread distance:</strong> ${prediction.spread_distance_km.toFixed(2)} km</p>
            <p><strong>Main direction:</strong> ${getDirectionName(prediction.spread_direction)}</p>
            <div class="env-data">
              <h6>Environmental Factors:</h6>
              <p>Wind: ${env.wind_speed.toFixed(1)} km/h ${getDirectionName(env.wind_direction)}</p>
              <p>Temp: ${env.temperature.toFixed(1)}°C, Humidity: ${env.humidity.toFixed(0)}%</p>
              <p>Data source: ${env.data_source === "weather_api" ? "Real-time weather" : "Estimated"}</p>
            </div>
          </div>
        </div>
      `;
    }
    
    const popup = new mapboxgl.Popup()
      .setLngLat([fireProps.longitude, fireProps.latitude])
      .setHTML(popupContent)
      .addTo(map);
    
    setActivePopup(popup);
  };

  // 4) Create sources/layers + click handler
  const setupLayers = () => {
    const map = mapRef.current;
    if (!map) return;

    // Wildfires layer
    if (map.getLayer('wildfires-layer'))  map.removeLayer('wildfires-layer');
    if (map.getSource('wildfires-source')) map.removeSource('wildfires-source');
    map.addSource('wildfires-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
    map.addLayer({
      id: 'wildfires-layer',
      type: 'circle',
      source: 'wildfires-source',
      paint: {
        'circle-radius':       4,
        'circle-color':        '#FF4500',
        'circle-stroke-width': 1,
        'circle-stroke-color': '#fff'
      }
    });

    // Click handler for popups
    if (clickHandlerRef.current) {
      map.off('click','wildfires-layer', clickHandlerRef.current);
    }
    clickHandlerRef.current = async e => {
      const f = e.features[0];
      if (!f) return;
      const { brightnessCat, confidenceRaw, timestamp, brightness, latitude, longitude } = f.properties;
      const coords = f.geometry.coordinates;
      const timeStr = timestamp
        ? new Date(timestamp).toLocaleString()
        : 'Unknown';

      // raw percent for the popup
      const pct = confidenceToPercent(confidenceRaw);
      const address = await reverseGeocode(coords[1], coords[0], mapboxgl.accessToken);
      const icon    = getSeverityIcon(brightnessCat);

      // Close any existing popup
      if (activePopup) {
        activePopup.remove();
      }

      // Create fire properties object for prediction
      const fireProps = {
        brightnessCat,
        brightness,
        latitude: coords[1],
        longitude: coords[0]
      };

      const popup = new mapboxgl.Popup()
        .setLngLat(coords)
        .setHTML(`
          <div class="wildfire-popup">
            <h4>${icon} ${brightnessCat} Fire</h4>
            <p><strong>Address:</strong> ${address}</p>
            <p><strong>Confidence:</strong> ${pct}%</p>
            <p><strong>Captured at:</strong> ${timeStr}</p>
            <button id="predict-spread-btn" class="predict-spread-btn">
              ${isPredicting ? 'Predicting...' : 'Predict Fire Spread'}
            </button>
          </div>
        `)
        .addTo(map);
      
      setActivePopup(popup);
      
      // Add event listener to the predict button
      const predictBtn = document.getElementById('predict-spread-btn');
      if (predictBtn) {
        predictBtn.addEventListener('click', () => handlePredictFireSpread(fireProps));
      }
    };
    map.on('click','wildfires-layer', clickHandlerRef.current);

    // User marker layer
    if (map.getLayer('user-layer'))  map.removeLayer('user-layer');
    if (map.getSource('user-source')) map.removeSource('user-source');
    map.addSource('user-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
    map.addLayer({
      id: 'user-layer',
      type: 'circle',
      source: 'user-source',
      paint: {
        'circle-radius':       6,
        'circle-color':        '#1E90FF',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff'
      }
    });
  };

  // 5) Initialize map once
  useEffect(() => {
    const m = new mapboxgl.Map({
      container: mapContainerRef.current,
      style:     mapStyle,
      center:    [-98, 38],
      zoom:      4,
      maxBounds: [[-130,22],[-66,50]]
    });
    m.addControl(new mapboxgl.NavigationControl());
    mapRef.current = m;

    m.on('load', () => {
      setupLayers();
      fetchWildfires();
      updateWildfireSource();
      updateUserSource();
    });
    return () => m.remove();
  }, []);

  // 6) Reapply on style change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(mapStyle);
    map.once('styledata', () => {
      setupLayers();
      updateWildfireSource();
      updateUserSource();
    });
  }, [mapStyle]);

  // 7) Refresh layer when filters/data change
  useEffect(() => {
    updateWildfireSource();
  }, [wildfires, brightnessFilter, confidenceFilter]);

  // 8) Update user marker
  useEffect(() => {
    updateUserSource();
  }, [userLocation]);

  // 9) Compute & send all in-range fires
  useEffect(() => {
    if (!onNearbyFiresUpdate) return;
    const t = setTimeout(async () => {
      if (!userLocation || wildfires.length === 0 || range <= 0) {
        onNearbyFiresUpdate([]);
        return;
      }
      // 9a) filter/in-range + derive brightnessCat + raw confidence
      const inRange = wildfires
        .map(f => {
          const d = haversineDistance(
            userLocation.lat, userLocation.lng,
            f.latitude, f.longitude
          );
          return {
            ...f,
            distance:      d,
            brightnessCat: getBrightnessCategory(f.brightness),
            confidenceRaw: f.confidence
          };
        })
        .filter(f => f.distance <= range);

      // 9b) enrich cityName + bracket confidence
      const enriched = await Promise.all(
        inRange.map(async f => {
          const pct = confidenceToPercent(f.confidenceRaw);
          const confCat = bracketConfidence(pct);
          const cityName = await reverseGeocode(f.latitude, f.longitude, mapboxgl.accessToken);
          return {
            cityName,
            distance:      f.distance,
            brightnessCat: f.brightnessCat,
            confidenceCat: confCat
          };
        })
      );
      onNearbyFiresUpdate(enriched);
    }, 500);
    return () => clearTimeout(t);
  }, [userLocation, range, wildfires, onNearbyFiresUpdate]);

  // Add CSS for the prediction button and environmental data
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .predict-spread-btn {
        background-color: #4CAF50;
        color: white;
        padding: 8px 12px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        margin-top: 10px;
        width: 100%;
        font-weight: bold;
      }
      .predict-spread-btn:hover {
        background-color: #45a049;
      }
      .prediction-results {
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid #ddd;
      }
      .prediction-results h5 {
        margin-top: 0;
        margin-bottom: 8px;
        color: #FF4500;
      }
      .env-data {
        margin-top: 8px;
        padding: 8px;
        background-color: #f8f8f8;
        border-radius: 4px;
        font-size: 0.9em;
      }
      .env-data h6 {
        margin: 0 0 5px 0;
        color: #666;
      }
      .env-data p {
        margin: 3px 0;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <div
      ref={mapContainerRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    />
  );
});

export default MapComponent;