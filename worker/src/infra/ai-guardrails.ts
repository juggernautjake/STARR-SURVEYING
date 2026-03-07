// worker/src/infra/ai-guardrails.ts — Phase 11 Module K
// AI response validation for surveying domain.
// Validates bearings, distances, traverse geometry, and curve parameters.
//
// Spec §11.12.2 — AI Response Validation

// ── Bearing Validation ──────────────────────────────────────────────────────

/**
 * Validate that AI-extracted bearing is in valid range.
 * Texas surveyor bearing format: [N|S] DD°MM'SS" [E|W]
 * Also accepts: [N|S] DD°MM' [E|W]  (no seconds) and [N|S] DD° [E|W] (degrees only)
 */
export function validateBearing(
  bearing: string,
): { valid: boolean; error?: string } {
  // Full DMS: N DD°MM'SS" E   (seconds may be omitted)
  const match = bearing.match(
    /^([NS])\s*(\d+)[°]\s*(?:(\d+)[''′](?:\s*([\d.]+)[""″]?)?)?\s*([EW])$/i,
  );
  if (!match) {
    return { valid: false, error: `Invalid bearing format: "${bearing}"` };
  }

  const deg = parseInt(match[2]);
  const min = match[3] !== undefined ? parseInt(match[3]) : 0;
  const sec = match[4] !== undefined ? parseFloat(match[4]) : 0;

  if (deg < 0 || deg > 90) {
    return { valid: false, error: `Degrees out of range (0-90): ${deg}` };
  }
  if (min < 0 || min > 59) {
    return { valid: false, error: `Minutes out of range (0-59): ${min}` };
  }
  if (sec < 0 || sec >= 60) {
    return { valid: false, error: `Seconds out of range (0-60): ${sec}` };
  }

  return { valid: true };
}

// ── Distance Validation ─────────────────────────────────────────────────────

/**
 * Validate that a distance is reasonable for a boundary call.
 */
export function validateDistance(
  distance: number,
  unit: string = 'feet',
): { valid: boolean; error?: string } {
  if (distance <= 0) {
    return { valid: false, error: `Distance must be positive: ${distance}` };
  }
  if (unit === 'feet' && distance > 50000) {
    return {
      valid: false,
      error: `Distance suspiciously large (>50,000'): ${distance}`,
    };
  }
  if (unit === 'feet' && distance < 0.01) {
    return {
      valid: false,
      error: `Distance suspiciously small (<0.01'): ${distance}`,
    };
  }
  if (unit === 'varas' && distance > 25000) {
    return {
      valid: false,
      error: `Distance suspiciously large (>25,000 varas): ${distance}`,
    };
  }
  return { valid: true };
}

// ── Curve Validation ────────────────────────────────────────────────────────

/**
 * Validate curve parameters for geometric consistency.
 */
export function validateCurve(curve: {
  radius?: number;
  arcLength?: number;
  delta?: string;
  chordBearing?: string;
  chordDistance?: number;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (curve.radius !== undefined) {
    if (curve.radius <= 0) {
      errors.push(`Curve radius must be positive: ${curve.radius}`);
    }
    if (curve.radius > 100000) {
      errors.push(
        `Curve radius suspiciously large (>100,000'): ${curve.radius}`,
      );
    }
  }

  if (curve.arcLength !== undefined) {
    if (curve.arcLength <= 0) {
      errors.push(`Arc length must be positive: ${curve.arcLength}`);
    }
    // Arc length should not exceed the semicircle (π * radius)
    if (
      curve.radius &&
      curve.arcLength > Math.PI * curve.radius
    ) {
      errors.push(
        `Arc length (${curve.arcLength}') exceeds semicircle (${(Math.PI * curve.radius).toFixed(2)}')`,
      );
    }
  }

  if (curve.delta) {
    const deltaResult = validateBearing(
      `N ${curve.delta} E`.replace(/[°'"]/g, (m) => m),
    );
    // Delta angle validation is looser — just check format
    const deltaMatch = curve.delta.match(/(\d+)[°]\s*(\d+)/);
    if (deltaMatch) {
      const deltaDeg = parseInt(deltaMatch[1]);
      if (deltaDeg > 180) {
        errors.push(`Delta angle > 180°: ${curve.delta}`);
      }
    }
  }

  if (curve.chordDistance !== undefined && curve.chordDistance <= 0) {
    errors.push(`Chord distance must be positive: ${curve.chordDistance}`);
  }

  // Cross-check: chord distance should be < 2 * radius
  if (curve.chordDistance && curve.radius && curve.chordDistance > 2 * curve.radius) {
    errors.push(
      `Chord distance (${curve.chordDistance}') exceeds diameter (${2 * curve.radius}')`,
    );
  }

  if (curve.chordBearing) {
    const chordResult = validateBearing(curve.chordBearing);
    if (!chordResult.valid) {
      errors.push(`Invalid chord bearing: ${chordResult.error}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Traverse Validation ─────────────────────────────────────────────────────

/**
 * Validate that a complete boundary closure is geometrically possible.
 */
export function validateTraverseGeometry(
  calls: { bearing: string; distance: number }[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Must have at least 3 calls to form a closed polygon
  if (calls.length < 3) {
    errors.push(`Boundary must have ≥3 calls (got ${calls.length})`);
  }

  // Validate each call
  for (let i = 0; i < calls.length; i++) {
    const brgResult = validateBearing(calls[i].bearing);
    if (!brgResult.valid) {
      errors.push(`Call ${i + 1}: ${brgResult.error}`);
    }

    const distResult = validateDistance(calls[i].distance);
    if (!distResult.valid) {
      errors.push(`Call ${i + 1}: ${distResult.error}`);
    }
  }

  // Check total perimeter is reasonable
  const totalDistance = calls.reduce((sum, c) => sum + c.distance, 0);
  if (totalDistance > 100000) {
    errors.push(
      `Total perimeter (${totalDistance.toFixed(0)}') is suspiciously large`,
    );
  }

  // Check for duplicate consecutive bearings (likely extraction error)
  for (let i = 1; i < calls.length; i++) {
    if (
      calls[i].bearing === calls[i - 1].bearing &&
      Math.abs(calls[i].distance - calls[i - 1].distance) < 0.1
    ) {
      errors.push(
        `Calls ${i} and ${i + 1} appear to be duplicates: ${calls[i].bearing} ${calls[i].distance}'`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── AI JSON Response Validation ─────────────────────────────────────────────

/**
 * Validate that an AI extraction response has the expected structure.
 * Returns cleaned data with invalid fields removed/flagged.
 */
export function validateExtractionResponse(response: any): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  cleanedCalls: any[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const cleanedCalls: any[] = [];

  if (!response || !Array.isArray(response.calls || response.boundaryCalls)) {
    errors.push('Response missing calls/boundaryCalls array');
    return { valid: false, errors, warnings, cleanedCalls };
  }

  const calls = response.calls || response.boundaryCalls;

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];

    // Required fields
    if (!call.bearing) {
      errors.push(`Call ${i + 1}: missing bearing`);
      continue;
    }
    if (!call.distance && call.distance !== 0) {
      errors.push(`Call ${i + 1}: missing distance`);
      continue;
    }

    // Validate bearing
    const brgResult = validateBearing(call.bearing);
    if (!brgResult.valid) {
      warnings.push(`Call ${i + 1}: ${brgResult.error} — flagged for review`);
      call._bearingWarning = brgResult.error;
    }

    // Validate distance
    const distResult = validateDistance(call.distance);
    if (!distResult.valid) {
      warnings.push(`Call ${i + 1}: ${distResult.error} — flagged for review`);
      call._distanceWarning = distResult.error;
    }

    // Validate curve if present
    if (call.curve) {
      const curveResult = validateCurve(call.curve);
      if (!curveResult.valid) {
        for (const err of curveResult.errors) {
          warnings.push(`Call ${i + 1} curve: ${err}`);
        }
      }
    }

    // Confidence sanity check
    if (call.confidence !== undefined) {
      if (call.confidence < 0 || call.confidence > 100) {
        warnings.push(
          `Call ${i + 1}: confidence ${call.confidence} out of range (0-100), clamping`,
        );
        call.confidence = Math.max(0, Math.min(100, call.confidence));
      }
    }

    cleanedCalls.push(call);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    cleanedCalls,
  };
}
