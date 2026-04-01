// lib/cad/ai-engine/index.ts
// Public barrel export for the Phase 6 AI Drawing Engine.
// Consumers should import from this barrel rather than individual files.

export * from './types';
export { classifyPoints } from './stage-1-classify';
export { assembleFeatures, kasaCircleFit } from './stage-2-assemble';
