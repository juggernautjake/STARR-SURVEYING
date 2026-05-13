// __tests__/admin/personas.test.ts
//
// Phase 4 slice 4b — locks the §5.4 persona table + the role-to-persona
// inference. The override picker in HubGreeting reads from these maps,
// so the order + completeness assertions here also keep the picker UI
// honest.

import { describe, expect, it } from 'vitest';

import {
  PERSONAS,
  PERSONA_ORDER,
  inferPersona,
  railOrderFor,
} from '@/lib/admin/personas';
import { WORKSPACE_ORDER } from '@/lib/admin/route-registry';

describe('personas — shape', () => {
  it('every persona in PERSONA_ORDER has a PERSONAS entry', () => {
    for (const id of PERSONA_ORDER) {
      expect(PERSONAS[id]).toBeDefined();
      expect(PERSONAS[id].id).toBe(id);
    }
  });

  it("each persona's railOrder is exhaustive over WORKSPACE_ORDER", () => {
    for (const id of PERSONA_ORDER) {
      const order = PERSONAS[id].railOrder;
      expect(order).toHaveLength(WORKSPACE_ORDER.length);
      expect(new Set(order)).toEqual(new Set(WORKSPACE_ORDER));
    }
  });
});

describe('personas — inference', () => {
  it('equipment_manager wins over admin', () => {
    expect(inferPersona(['admin', 'equipment_manager'])).toBe('equipment-manager');
  });

  it('researcher / drawer surface the researcher persona', () => {
    expect(inferPersona(['researcher'])).toBe('researcher');
    expect(inferPersona(['drawer'])).toBe('researcher');
  });

  it('admin + tech_support → dispatcher', () => {
    expect(inferPersona(['admin', 'tech_support'])).toBe('dispatcher');
  });

  it('plain admin → admin persona', () => {
    expect(inferPersona(['admin'])).toBe('admin');
  });

  it('field_crew → field-surveyor', () => {
    expect(inferPersona(['field_crew'])).toBe('field-surveyor');
  });

  it('student → student persona', () => {
    expect(inferPersona(['student'])).toBe('student');
  });

  it('unknown / empty roles → fallback (field-surveyor)', () => {
    expect(inferPersona([])).toBe('field-surveyor');
    expect(inferPersona(['guest'])).toBe('field-surveyor');
  });
});

describe('personas — railOrderFor', () => {
  it('override beats inference', () => {
    const order = railOrderFor({ roles: ['field_crew'], override: 'researcher' });
    expect(order).toEqual(PERSONAS.researcher.railOrder);
  });

  it('inference is used when override is null', () => {
    const order = railOrderFor({ roles: ['equipment_manager'], override: null });
    expect(order).toEqual(PERSONAS['equipment-manager'].railOrder);
  });

  it('result is always exhaustive', () => {
    const order = railOrderFor({ roles: [], override: null });
    expect(new Set(order)).toEqual(new Set(WORKSPACE_ORDER));
  });
});
