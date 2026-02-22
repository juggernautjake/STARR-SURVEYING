// app/admin/components/AddressAutocomplete.tsx — Address input with auto-suggest
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface AddressSuggestion {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

interface AddressDetails {
  address: string;
  city: string;
  county: string;
  state: string;
  zip: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (details: AddressDetails) => void;
  placeholder?: string;
  className?: string;
  /** Bias results towards Texas */
  biasTexas?: boolean;
}

/**
 * Address input with Google Places Autocomplete suggestions.
 * Requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to be set.
 * Falls back to a plain input if the API key is not available.
 */
export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Start typing an address...',
  className = '',
  biasTexas = true,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [apiAvailable, setApiAvailable] = useState(false);
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hiddenMapDiv = useRef<HTMLDivElement | null>(null);

  // Initialize Google Places services
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    // Check if Google Maps is already loaded
    if (typeof google !== 'undefined' && google.maps?.places) {
      initServices();
      return;
    }

    // Load the Google Places library if not already present
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      // Script exists, wait for it to load
      existingScript.addEventListener('load', initServices);
      // It might already be loaded
      if (typeof google !== 'undefined' && google.maps?.places) {
        initServices();
      }
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', initServices);
    document.head.appendChild(script);

    function initServices() {
      try {
        autocompleteService.current = new google.maps.places.AutocompleteService();
        // PlacesService needs a map or div element
        if (!hiddenMapDiv.current) {
          hiddenMapDiv.current = document.createElement('div');
        }
        placesService.current = new google.maps.places.PlacesService(hiddenMapDiv.current);
        setApiAvailable(true);
      } catch {
        // Google Maps API not available
      }
    }
  }, []);

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchSuggestions = useCallback((input: string) => {
    if (!autocompleteService.current || input.length < 3) {
      setSuggestions([]);
      return;
    }

    setLoading(true);

    const request: google.maps.places.AutocompletionRequest = {
      input,
      types: ['address'],
      componentRestrictions: { country: 'us' },
    };

    // Bias towards Texas if enabled
    if (biasTexas) {
      request.locationBias = new google.maps.Circle({
        center: { lat: 31.0, lng: -97.0 }, // Central Texas
        radius: 500000, // ~500km radius covers most of Texas
      });
    }

    autocompleteService.current.getPlacePredictions(request, (predictions, status) => {
      setLoading(false);
      if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
        setSuggestions(predictions.map(p => ({
          placeId: p.place_id,
          description: p.description,
          mainText: p.structured_formatting.main_text,
          secondaryText: p.structured_formatting.secondary_text,
        })));
        setShowSuggestions(true);
        setHighlightIdx(-1);
      } else {
        setSuggestions([]);
      }
    });
  }, [biasTexas]);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    onChange(val);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (val.length >= 3 && apiAvailable) {
      debounceTimer.current = setTimeout(() => fetchSuggestions(val), 300);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }

  function handleSelectSuggestion(suggestion: AddressSuggestion) {
    onChange(suggestion.mainText);
    setShowSuggestions(false);
    setSuggestions([]);

    // Fetch full place details
    if (placesService.current && onSelect) {
      placesService.current.getDetails(
        {
          placeId: suggestion.placeId,
          fields: ['address_components', 'formatted_address'],
        },
        (place, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && place?.address_components) {
            const details = parseAddressComponents(place.address_components);
            onSelect(details);
          }
        }
      );
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && highlightIdx >= 0) {
      e.preventDefault();
      handleSelectSuggestion(suggestions[highlightIdx]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  }

  return (
    <div ref={wrapperRef} className="address-autocomplete" style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        className={className}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showSuggestions}
        aria-autocomplete="list"
        aria-controls="address-suggestions-list"
      />
      {showSuggestions && suggestions.length > 0 && (
        <ul
          id="address-suggestions-list"
          className="address-autocomplete__list"
          role="listbox"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.placeId}
              className={`address-autocomplete__item ${i === highlightIdx ? 'address-autocomplete__item--active' : ''}`}
              role="option"
              aria-selected={i === highlightIdx}
              onMouseDown={() => handleSelectSuggestion(s)}
              onMouseEnter={() => setHighlightIdx(i)}
            >
              <span className="address-autocomplete__main">{s.mainText}</span>
              <span className="address-autocomplete__secondary">{s.secondaryText}</span>
            </li>
          ))}
          {loading && (
            <li className="address-autocomplete__loading">Searching...</li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Parse Google Place address_components into our structured format */
function parseAddressComponents(components: google.maps.GeocoderAddressComponent[]): AddressDetails {
  let streetNumber = '';
  let route = '';
  let city = '';
  let county = '';
  let state = '';
  let zip = '';

  for (const comp of components) {
    const types = comp.types;
    if (types.includes('street_number')) {
      streetNumber = comp.long_name;
    } else if (types.includes('route')) {
      route = comp.long_name;
    } else if (types.includes('locality')) {
      city = comp.long_name;
    } else if (types.includes('administrative_area_level_2')) {
      // County — remove " County" suffix if present
      county = comp.long_name.replace(/ County$/i, '');
    } else if (types.includes('administrative_area_level_1')) {
      state = comp.short_name; // "TX"
    } else if (types.includes('postal_code')) {
      zip = comp.long_name;
    }
  }

  return {
    address: streetNumber ? `${streetNumber} ${route}` : route,
    city,
    county,
    state,
    zip,
  };
}
