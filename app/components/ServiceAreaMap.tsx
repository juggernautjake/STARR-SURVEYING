'use client';

import { useEffect, useState } from 'react';

// ============================================================================
// TO ENABLE GOOGLE MAPS WITH CIRCLE:
// 1. npm install @react-google-maps/api
// 2. Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to .env.local
// 3. Uncomment the Google Maps code below and remove the placeholder
// ============================================================================

/*
// UNCOMMENT THIS WHEN READY TO USE GOOGLE MAPS:

import { GoogleMap, LoadScript, Circle, Marker } from '@react-google-maps/api';

const containerStyle = {
  width: '100%',
  height: '100%',
};

// Belton, TX coordinates (center of service area)
const beltonCenter = { lat: 31.0561, lng: -97.4642 };

// ~350 miles in meters = 563,270 meters (covers Huntsville, Houston, Dallas, San Antonio and beyond)
const radiusInMeters = 563270;

const circleOptions = {
  strokeColor: '#BD1218',
  strokeOpacity: 0.85,
  strokeWeight: 3,
  fillColor: '#BD1218',
  fillOpacity: 0.08,
};

export default function ServiceAreaMap() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  
  if (!apiKey) {
    return <PlaceholderMap />;
  }

  return (
    <LoadScript googleMapsApiKey={apiKey}>
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={beltonCenter}
        zoom={5.5}
        options={{ 
          mapTypeId: 'hybrid',
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
        }}
      >
        <Circle center={beltonCenter} radius={radiusInMeters} options={circleOptions} />
        <Marker position={beltonCenter} title="Belton HQ" />
      </GoogleMap>
    </LoadScript>
  );
}
*/

// PLACEHOLDER MAP - Shows a nice visual until Google Maps API is set up
export default function ServiceAreaMap() {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div className="placeholder-map placeholder-map--loading">
        <div className="placeholder-map__spinner"></div>
        <p>Loading map...</p>
      </div>
    );
  }

  return (
    <div className="placeholder-map">
      {/* Stylized Texas Map Background */}
      <div className="placeholder-map__texas-bg">
        <svg viewBox="0 0 400 350" className="placeholder-map__texas-svg">
          {/* Simplified Texas outline */}
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
        {/* Outer glow ring */}
        <div className="placeholder-map__glow"></div>
        
        {/* Main circle */}
        <div className="placeholder-map__circle">
          <div className="placeholder-map__ring"></div>
        </div>
        
        {/* Center pin and info */}
        <div className="placeholder-map__center">
          <div className="placeholder-map__pin-marker">
            <svg viewBox="0 0 24 24" fill="#BD1218" width="32" height="32">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </div>
          <div className="placeholder-map__center-label">
            <span className="placeholder-map__center-title">Belton HQ</span>
            <span className="placeholder-map__center-radius">350-mile radius</span>
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
        <span className="placeholder-map__city" style={{ top: '52%', left: '65%' }}>Huntsville</span>
        <span className="placeholder-map__city" style={{ top: '35%', left: '50%' }}>Waco</span>
        <span className="placeholder-map__city" style={{ top: '85%', left: '65%' }}>Galveston</span>
      </div>

      {/* Corner badge */}
      <div className="placeholder-map__badge">
        Central Texas Coverage
      </div>
    </div>
  );
}