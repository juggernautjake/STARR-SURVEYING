// lib/weather/wmo.ts
//
// hub-widget-excellence-15 — weather. Pure mapping of WMO weather codes
// (the World Meteorological Organization code Open-Meteo returns in
// `current.weather_code`) to a short description + an emoji icon for the
// widget. Dependency-free → unit-tested in node.
//
// Ref: https://open-meteo.com/en/docs (WMO Weather interpretation codes).

export interface WeatherLook {
  description: string;
  icon: string;
}

/** Map a WMO weather code to a human description + emoji. Unknown codes
 *  fall back to a neutral "Unknown" cloud so the widget still renders. */
export function describeWeather(code: number): WeatherLook {
  switch (true) {
    case code === 0:
      return { description: 'Clear sky', icon: '☀️' };
    case code === 1:
      return { description: 'Mainly clear', icon: '🌤️' };
    case code === 2:
      return { description: 'Partly cloudy', icon: '⛅' };
    case code === 3:
      return { description: 'Overcast', icon: '☁️' };
    case code === 45 || code === 48:
      return { description: 'Fog', icon: '🌫️' };
    case code >= 51 && code <= 57:
      return { description: 'Drizzle', icon: '🌦️' };
    case code >= 61 && code <= 67:
      return { description: 'Rain', icon: '🌧️' };
    case code >= 71 && code <= 77:
      return { description: 'Snow', icon: '🌨️' };
    case code >= 80 && code <= 82:
      return { description: 'Rain showers', icon: '🌦️' };
    case code === 85 || code === 86:
      return { description: 'Snow showers', icon: '🌨️' };
    case code === 95:
      return { description: 'Thunderstorm', icon: '⛈️' };
    case code === 96 || code === 99:
      return { description: 'Thunderstorm with hail', icon: '⛈️' };
    default:
      return { description: 'Unknown', icon: '☁️' };
  }
}
