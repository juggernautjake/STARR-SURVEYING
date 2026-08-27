// lib/maps/places-status.ts — telling "no matches" apart from "Google refused us"
//
// `getPlacePredictions` reports every outcome through one status string, and the component that
// consumed it treated all of them the same way: clear the list, show nothing. So a key that Google
// REFUSES and a street that genuinely has no match produced an identical screen — an empty dropdown
// under a box you are still typing into.
//
// That is the whole reason the planning doc could only say the admin address autocomplete "may be
// broken". Nobody could tell. The symptom of a denied key and the symptom of a rare address are the
// same pixel.
//
// The classification matters because the two halves need opposite responses:
//
//   ZERO_RESULTS / NOT_FOUND   the user should keep typing — their address is simply not matching yet
//   REQUEST_DENIED             an OWNER action: the API key does not carry Places, and no amount of
//                              typing will ever help
//   OVER_QUERY_LIMIT           real, transient, and self-resolving — worth saying so
//
// Kept as a pure function, away from the component, because the interesting behaviour here is a
// mapping from strings to advice and it should be testable without a DOM or a Google stub.

/** What the caller should do about a prediction result. */
export type PlacesOutcomeKind =
  /** Predictions came back. */
  | 'ok'
  /** The query ran and matched nothing. Not a fault — keep typing. */
  | 'empty'
  /** Google accepted the request and refused the caller. Needs a person. */
  | 'denied'
  /** Real but temporary. Retrying later works. */
  | 'transient'
  /** We sent something malformed, or Google failed in a way it did not name. */
  | 'broken';

export interface PlacesOutcome {
  kind: PlacesOutcomeKind;
  /** Shown to the user in place of the dropdown. `null` when there is nothing worth saying. */
  message: string | null;
}

/**
 * Classify a `google.maps.places.PlacesServiceStatus` value.
 *
 * Takes a plain string rather than the SDK enum so this can be tested — and reasoned about —
 * without loading Google Maps. The enum's values ARE these strings.
 */
export function classifyPlacesStatus(status: string | null | undefined): PlacesOutcome {
  switch (status) {
    case 'OK':
      return { kind: 'ok', message: null };

    // Nothing matched. The user is mid-address, or it is a rural parcel Google has never heard of —
    // both routine for this business. Say nothing; an error here would cry wolf on every keystroke.
    case 'ZERO_RESULTS':
    case 'NOT_FOUND':
      return { kind: 'empty', message: null };

    // The one that was invisible. A key restricted to "Maps JavaScript API" returns exactly this for
    // a Places request: the map draws, the autocomplete never will, and nothing on screen says so.
    case 'REQUEST_DENIED':
      return {
        kind: 'denied',
        message: 'Address suggestions are unavailable — the Google Maps key does not allow Places. Type the address manually.',
      };

    case 'OVER_QUERY_LIMIT':
      return {
        kind: 'transient',
        message: 'Address suggestions are temporarily rate-limited. Type the address manually.',
      };

    default:
      // INVALID_REQUEST, UNKNOWN_ERROR, and anything Google adds later. Deliberately still visible:
      // an unnamed failure that hides is how this one survived.
      return {
        kind: 'broken',
        message: 'Address suggestions are not responding. Type the address manually.',
      };
  }
}

/**
 * Does an already-present Maps script actually carry the Places library?
 *
 * The component used to reuse ANY `maps.googleapis.com` script it found on the page. If that script
 * had been loaded without `libraries=places` — which is the normal way to load a map — then
 * `google.maps.places` stays undefined forever, the services never initialise, and the input degrades
 * to a plain text box with no explanation. Reusing the wrong script is worse than loading a second
 * one, because the failure is permanent and silent.
 */
export function scriptProvidesPlaces(src: string | null | undefined): boolean {
  if (!src) return false;
  return /[?&]libraries=([^&]*\b)?places\b/.test(src);
}
