'use client';

import { useEffect, useState, useCallback } from 'react';
import { GoogleMap, LoadScript, Circle, Marker, InfoWindow } from '@react-google-maps/api';

// ============================================================================
// GOOGLE MAPS SERVICE AREA MAP
// Shows 125-mile radius around Belton, TX headquarters
// Includes "Get Directions" functionality
// ============================================================================

const containerStyle = {
  width: '100%',
  height: '100%',
};

// =============================================================================
// OFFICE LOCATION - EXACT GPS COORDINATES
// 3779 W FM 436, Belton, TX 76513
// =============================================================================
const OFFICE_LAT = 30.99752823122663;
const OFFICE_LNG = -97.40083553223793;
const beltonCenter = { lat: OFFICE_LAT, lng: OFFICE_LNG };

// Professional format for DISPLAY on website
export const OFFICE_ADDRESS = '3779 W FM 436, Belton, TX 76513';
export const OFFICE_ADDRESS_LINE1 = '3779 W FM 436';
export const OFFICE_ADDRESS_LINE2 = 'Belton, TX 76513';

// ~125 miles in meters = 201,168 meters (125 * 1609.34)
const radiusInMeters = 201168;

const circleOptions = {
  strokeColor: '#BD1218',
  strokeOpacity: 0.85,
  strokeWeight: 3,
  fillColor: '#BD1218',
  fillOpacity: 0.08,
};

const mapOptions = {
  mapTypeId: 'hybrid' as const,
  mapTypeControl: true,
  streetViewControl: false,
  fullscreenControl: true,
  zoomControl: true,
};

// Generate Google Maps directions URL using EXACT GPS coordinates
// This is 100% reliable - no address lookup needed
export function getDirectionsUrl(): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${OFFICE_LAT},${OFFICE_LNG}&travelmode=driving`;
}

// Placeholder map component (fallback if no API key)
function PlaceholderMap() {
  return (
    <div className="placeholder-map">
      {/* Stylized Texas Map Background */}
      <div className="placeholder-map__texas-bg">
        <svg viewBox="0 0 400 350" className="placeholder-map__texas-svg">
          <path 
            d="M 50 50 L 280 50 L 290 80 L 350 100 L 380 180 L 350 280 L 280 320 L 200 300 L 150 320 L 80 280 L 50 200 L 30 150 Z" 
            fill="rgba(29, 48, 149, 0.06)" 
            stroke="rgba(29, 48, 149, 0.15)" 
            strokeWidth="2"
          />
        </svg>
      </div>

      {/* Service Area Circle */}
      <div className="placeholder-map__circle-container">
        <div className="placeholder-map__glow"></div>
        <div className="placeholder-map__circle">
          <div className="placeholder-map__ring"></div>
        </div>
        
        <div className="placeholder-map__center">
          <div className="placeholder-map__pin-marker">
            <svg viewBox="0 0 24 24" fill="#BD1218" width="32" height="32">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </div>
          <div className="placeholder-map__center-label">
            <span className="placeholder-map__center-title">Belton HQ</span>
            <span className="placeholder-map__center-radius">125-mile radius</span>
          </div>
        </div>
      </div>

      {/* Reference cities */}
      <div className="placeholder-map__cities">
        <span className="placeholder-map__city" style={{ top: '18%', left: '48%' }}>Dallas</span>
        <span className="placeholder-map__city" style={{ top: '18%', left: '32%' }}>Fort Worth</span>
        <span className="placeholder-map__city" style={{ top: '62%', left: '35%' }}>Austin</span>
        <span className="placeholder-map__city" style={{ top: '78%', left: '28%' }}>San Antonio</span>
        <span className="placeholder-map__city" style={{ top: '72%', left: '72%' }}>Houston</span>
        <span className="placeholder-map__city" style={{ top: '35%', left: '50%' }}>Waco</span>
      </div>

      {/* Corner badge */}
      <div className="placeholder-map__badge">
        Central Texas Coverage
      </div>
    </div>
  );
}

export default function ServiceAreaMap() {
  const [isClient, setIsClient] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [showInfoWindow, setShowInfoWindow] = useState(false);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleGetDirections = useCallback(() => {
    window.open(getDirectionsUrl(), '_blank');
  }, []);

  const handleMarkerClick = useCallback(() => {
    setShowInfoWindow(true);
  }, []);

  const handleInfoWindowClose = useCallback(() => {
    setShowInfoWindow(false);
  }, []);

  // Show loading state during SSR
  if (!isClient) {
    return (
      <div className="placeholder-map placeholder-map--loading">
        <div className="placeholder-map__spinner"></div>
        <p>Loading map...</p>
      </div>
    );
  }

  // If no API key or map error, show placeholder
  if (!apiKey || mapError) {
    return <PlaceholderMap />;
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <LoadScript 
        googleMapsApiKey={apiKey}
        onError={() => setMapError(true)}
      >
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={beltonCenter}
          zoom={7.2}
          options={mapOptions}
        >
          {/* 125-mile radius circle */}
          <Circle 
            center={beltonCenter} 
            radius={radiusInMeters} 
            options={circleOptions} 
          />
          
          {/* HQ Marker */}
          <Marker 
            position={beltonCenter} 
            title="Starr Surveying HQ - Belton, TX"
            onClick={handleMarkerClick}
          />

          {/* Info Window when marker is clicked */}
          {showInfoWindow && (
            <InfoWindow
              position={beltonCenter}
              onCloseClick={handleInfoWindowClose}
            >
              <div style={{ 
                padding: '8px', 
                fontFamily: 'Inter, sans-serif',
                maxWidth: '200px'
              }}>
                <h3 style={{ 
                  margin: '0 0 8px 0', 
                  fontSize: '14px', 
                  fontWeight: '700',
                  color: '#BD1218',
                  fontFamily: 'Sora, sans-serif'
                }}>
                  Starr Surveying HQ
                </h3>
                <p style={{ 
                  margin: '0 0 8px 0', 
                  fontSize: '12px', 
                  color: '#4B5563',
                  lineHeight: '1.4'
                }}>
                  {OFFICE_ADDRESS}
                </p>
                <button
                  onClick={handleGetDirections}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 12px',
                    backgroundColor: '#1D3095',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    width: '100%',
                    justifyContent: 'center',
                    fontFamily: 'Sora, sans-serif'
                  }}
                >
                  🚗 Get Directions
                </button>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </LoadScript>
    </div>
  );
}