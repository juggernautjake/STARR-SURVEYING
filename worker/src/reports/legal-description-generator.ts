// worker/src/reports/legal-description-generator.ts — Phase 10 Module 5
// Generates Texas-standard metes & bounds legal descriptions in THENCE/POB format.
// Supports straight calls, curve descriptions, and subdivision lot references.
//
// Spec §10.8 — Legal Description Generator

import type { ProjectData } from '../types/reports.js';

// ── Legal Description Generator ─────────────────────────────────────────────

export class LegalDescriptionGenerator {

  generate(data: ProjectData): string {
    const recon = data.reconciliationV2 || data.reconciliation;
    const calls = recon?.reconciledCalls || recon?.calls || [];
    const corners = recon?.corners || recon?.coordinates || [];
    const monuments = recon?.monuments || [];

    if (calls.length === 0) {
      return 'Legal description not available — no reconciled boundary calls.';
    }

    const lines: string[] = [];

    // ── Header ──────────────────────────────────────────────────────────
    lines.push(this.generateHeader(data));
    lines.push('');

    // ── Point of Beginning ──────────────────────────────────────────────
    const pobMonument = monuments[0];
    const pobCorner = corners[0];
    lines.push(this.generatePOB(pobCorner, pobMonument, data));
    lines.push('');

    // ── Boundary Calls ──────────────────────────────────────────────────
    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      const toCorner = corners[(i + 1) % corners.length];
      const monument = monuments[(i + 1) % monuments.length];
      const isLastCall = i === calls.length - 1;

      if (call.curve) {
        lines.push(this.generateCurveCall(call, toCorner, monument, isLastCall));
      } else {
        lines.push(
          this.generateStraightCall(call, toCorner, monument, isLastCall),
        );
      }
    }

    // ── Closure ─────────────────────────────────────────────────────────
    lines.push('');
    lines.push(this.generateClosure(data, calls));

    // ── Footer ──────────────────────────────────────────────────────────
    lines.push('');
    lines.push(this.generateFooter(data));

    return lines.join('\n');
  }

  // ── Header ──────────────────────────────────────────────────────────────

  private generateHeader(data: ProjectData): string {
    const parts: string[] = [];

    if (data.discovery?.legalDescription) {
      parts.push(data.discovery.legalDescription);
      parts.push('');
    }

    parts.push(
      `BEING a tract of land situated in ${data.county} County, Texas, ` +
      `and being more particularly described by metes and bounds as follows:`,
    );

    if (data.discovery?.subdivision) {
      const sub = data.discovery.subdivision;
      const lot = data.discovery.lot;
      const block = data.discovery.block;

      let ref = `Being all of Lot ${lot || '___'}`;
      if (block) ref += `, Block ${block}`;
      ref += `, ${sub}`;
      ref += `, a subdivision in ${data.county} County, Texas`;
      ref += `, according to the map or plat thereof recorded in the official records of ${data.county} County, Texas.`;

      parts.push('');
      parts.push(ref);
    }

    return parts.join('\n');
  }

  // ── Point of Beginning ──────────────────────────────────────────────────

  private generatePOB(
    corner: any,
    monument: any,
    data: ProjectData,
  ): string {
    let pob = 'BEGINNING';

    if (monument?.description) {
      pob += ` at a ${monument.description.toLowerCase()}`;
      if (monument.type) {
        pob += ` (${monument.type})`;
      }
    } else {
      pob += ' at a point';
    }

    if (corner?.northing && corner?.easting) {
      pob += ` having coordinates of N: ${corner.northing.toFixed(2)}, E: ${corner.easting.toFixed(2)}`;
      pob += ' (NAD83, Texas Central Zone, US Survey Feet)';
    }

    // Reference tie if available
    const recon = data.reconciliationV2 || data.reconciliation;
    if (recon?.pobReference) {
      pob += `, said point being ${recon.pobReference}`;
    }

    pob += ', for the POINT OF BEGINNING of the herein described tract;';

    return pob;
  }

  // ── Straight Call ───────────────────────────────────────────────────────

  private generateStraightCall(
    call: any,
    toCorner: any,
    monument: any,
    isLastCall: boolean,
  ): string {
    let text = 'THENCE ';

    // Bearing
    text += this.formatBearing(call.bearing);

    // Distance
    text += `, a distance of ${this.formatDistance(call.distance)}`;

    // Monument at destination
    if (monument?.description) {
      text += `, to a ${monument.description.toLowerCase()}`;
      if (monument.type) {
        text += ` (${monument.type})`;
      }
    } else {
      text += ', to a point';
    }

    // Adjacency note
    if (call.adjacentOwner) {
      text += `, along the ${call.adjacentSide || 'common'} line of ${call.adjacentOwner}`;
    }

    if (call.roadName) {
      text += `, along the ${call.roadSide || ''} right-of-way line of ${call.roadName}`.trim();
    }

    // Terminator
    if (isLastCall) {
      text += ', to the POINT OF BEGINNING and containing ';
      text += this.formatAcreage(toCorner, call);
      text += '.';
    } else {
      text += ';';
    }

    return text;
  }

  // ── Curve Call ──────────────────────────────────────────────────────────

  private generateCurveCall(
    call: any,
    toCorner: any,
    monument: any,
    isLastCall: boolean,
  ): string {
    const curve = call.curve;
    let text = 'THENCE ';

    // Direction
    const direction = call.curveDirection || 'to the right';
    text += `along a curve ${direction}`;

    // Curve parameters
    const params: string[] = [];

    if (curve.radius) {
      params.push(`having a radius of ${this.formatDistance(curve.radius)}`);
    }

    if (curve.delta) {
      params.push(`a central angle of ${this.formatAngle(curve.delta)}`);
    }

    if (curve.arcLength) {
      params.push(
        `an arc length of ${this.formatDistance(curve.arcLength)}`,
      );
    }

    if (curve.chordBearing && curve.chordDistance) {
      params.push(
        `a chord which bears ${this.formatBearing(curve.chordBearing)} ` +
        `a distance of ${this.formatDistance(curve.chordDistance)}`,
      );
    }

    text += ', ' + params.join(', ');

    // Monument at destination
    if (monument?.description) {
      text += `, to a ${monument.description.toLowerCase()}`;
      if (monument.type) {
        text += ` (${monument.type})`;
      }
    } else {
      text += ', to a point';
    }

    // Adjacency
    if (call.roadName) {
      text += `, along the right-of-way line of ${call.roadName}`;
    }

    // Terminator
    if (isLastCall) {
      text += ', to the POINT OF BEGINNING and containing ';
      text += this.formatAcreage(toCorner, call);
      text += '.';
    } else {
      text += ';';
    }

    return text;
  }

  // ── Closure ─────────────────────────────────────────────────────────────

  private generateClosure(data: ProjectData, calls: any[]): string {
    const recon = data.reconciliationV2 || data.reconciliation;
    const acreage = data.discovery?.acreage;
    const closureError = recon?.closureError;

    let text = '';

    if (acreage) {
      text += `CONTAINING ${acreage.toFixed(4)} acres of land, more or less.`;
    }

    if (closureError?.ratio) {
      text += `\n\nClosure: ${closureError.ratio}`;
      if (closureError.linearError) {
        text += ` (${closureError.linearError.toFixed(3)} ft error in ${this.totalPerimeter(calls).toFixed(2)} ft perimeter)`;
      }
    }

    return text;
  }

  // ── Footer ──────────────────────────────────────────────────────────────

  private generateFooter(data: ProjectData): string {
    const lines: string[] = [];

    lines.push(
      'This description was prepared from public records research and AI-assisted extraction.',
    );
    lines.push(
      'All bearings are based on the NAD83 Texas Central Zone coordinate system.',
    );
    lines.push(
      'All distances are in US Survey Feet unless otherwise noted.',
    );

    if (data.confidence?.overallGrade) {
      lines.push('');
      lines.push(
        `Research Confidence: ${data.confidence.overallScore}% (Grade ${data.confidence.overallGrade})`,
      );
    }

    lines.push('');
    lines.push(
      'NOTE: This description is derived from AI-assisted research and does NOT constitute a boundary survey.',
    );

    return lines.join('\n');
  }

  // ── Formatting Helpers ──────────────────────────────────────────────────

  private formatBearing(bearing: string): string {
    if (!bearing) return 'N 00°00\'00" E';
    // Already formatted — pass through
    return bearing;
  }

  private formatDistance(feet: number): string {
    if (!feet) return '0.00 feet';
    return `${feet.toFixed(2)} feet`;
  }

  private formatAngle(angle: string): string {
    if (!angle) return '00°00\'00"';
    return angle;
  }

  private formatAcreage(_toCorner: any, _call: any): string {
    // Acreage is computed from the full boundary, not per-call
    // Placeholder — actual acreage comes from discovery data
    return 'the acreage hereinabove described';
  }

  private totalPerimeter(calls: any[]): number {
    return calls.reduce((sum: number, c: any) => {
      if (c.curve?.arcLength) return sum + c.curve.arcLength;
      return sum + (c.distance || 0);
    }, 0);
  }
}
