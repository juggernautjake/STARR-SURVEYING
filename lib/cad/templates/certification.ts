// lib/cad/templates/certification.ts — Professional surveyor certification block
import type { CertificationTemplateConfig } from './types';

export const DEFAULT_CERTIFICATION_TEXT =
  `I, the undersigned, a Registered Professional Land Surveyor in the State of {{state}}, ` +
  `do hereby certify that this plat correctly represents a {{category}} survey made under ` +
  `my direction on the ground, that the monuments shown hereon actually exist as described, ` +
  `and that all dimensional and geodetic details are correct to the best of my knowledge ` +
  `and belief.\n\n` +
  `This survey was performed in compliance with the current Texas Standards and ` +
  `Specifications for a Category {{category}}, Condition {{condition}} survey, ` +
  `having a precision ratio of 1:{{precisionRatio}} or better.`;

/**
 * Build the final certification paragraph by substituting template variables.
 */
export function formatCertificationText(
  template: string,
  surveyorName: string,
  state: string,
  category: string,
  condition: string,
  precisionRatio: string,
): string {
  return template
    .replace(/\{\{surveyorName\}\}/g, surveyorName)
    .replace(/\{\{state\}\}/g, state)
    .replace(/\{\{category\}\}/g, category)
    .replace(/\{\{condition\}\}/g, condition)
    .replace(/\{\{precisionRatio\}\}/g, precisionRatio);
}

export const DEFAULT_CERTIFICATION_CONFIG: CertificationTemplateConfig = {
  position: { x: 0.5, y: 2 },
  width: 6,
  visible: true,
  certificationText: DEFAULT_CERTIFICATION_TEXT,
  surveyorName: '',
  licenseNumber: '',
  licenseState: 'Texas',
  firmName: '',
  showSignatureLine: true,
  showDateLine: true,
  showSealPlaceholder: true,
  sealDiameter: 1.75,
  font: 'Arial',
  fontSize: 8,
};
